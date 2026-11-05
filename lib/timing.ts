// tempo and rhythm calculations

// 1. Describing shape of the data
// One event from the algorithm's output: a moment where one or more notes start.
export type AlgorithmEvent = {
  event: number
  start_beat: number
  beats: number
  status: 'ok' | 'partial' | 'wrong' | 'missing' | 'unscored'
  expected: number[]
  observed: number[]
  start_seconds: number
  end_seconds: number
  margin_db: number | null
}

export type AnalysisResult = {
  source: string
  model: string
  events: AlgorithmEvent[]
} // each sond analysis contains file name, song model, an dlist of AlgorithmEvents

// 2. Deciding which events to trust
const TRUSTED_STATUSES = new Set(['ok', 'partial', 'wrong'])

// Missing and unscored events only have a guessed time slot
export function isTrusted(event: AlgorithmEvent): boolean {
  return TRUSTED_STATUSES.has(event.status) && event.end_seconds > event.start_seconds
}

// 3. Fit a straight line
type Line = { secondsPerBeat: number; offset: number }

// Best-fit straight line through (start_beat, start_seconds) points.
// The slope is how many seconds one beat took.
function fitLine(events: AlgorithmEvent[]): Line | null {
  if (events.length < 3) return null
  const meanBeat = events.reduce((sum, e) => sum + e.start_beat, 0) / events.length
  const meanSeconds = events.reduce((sum, e) => sum + e.start_seconds, 0) / events.length
  let numerator = 0
  let denominator = 0
  for (const e of events) {
    numerator += (e.start_beat - meanBeat) * (e.start_seconds - meanSeconds)
    denominator += (e.start_beat - meanBeat) ** 2
  }
  if (denominator === 0) return null
  const secondsPerBeat = numerator / denominator
  if (secondsPerBeat <= 0) return null
  return { secondsPerBeat, offset: meanSeconds - secondsPerBeat * meanBeat }
}

// Trusted events within `window` places of event i, optionally leaving i itself out.
function neighbours(events: AlgorithmEvent[], i: number, window: number, includeSelf: boolean) {
  return events
    .slice(Math.max(0, i - window), i + window + 1)
    .filter((e) => isTrusted(e) && (includeSelf || e.event !== events[i].event))
}

// 4. calculate tempo (fit a line through the event and its neighbors, then convert the slove to beats per minute)
// Tempo around event i, in beats per minute.
export function localBpm(events: AlgorithmEvent[], i: number, window = 3): number | null {
  const line = fitLine(neighbours(events, i, window, true))
  return line ? 60 / line.secondsPerBeat : null
}

// 5. Rhythm: fit a line through the neighbours only, predict when this event should have start,
// and measure how far off it was. The result is a fraction of a beat, where -0.2 means a fifth of 
// a beat early
// How early (negative) or late (positive) event i was, as a fraction of a beat,
// compared with where its neighbours' tempo says it should have started.
export function timingDeviation(events: AlgorithmEvent[], i: number, window = 3): number | null {
  const expected = expectedStart(events, i, window)
  return expected ? (events[i].start_seconds - expected.seconds) / expected.secondsPerBeat : null
}

// When event i should have started, judging by its neighbours' tempo.
export function expectedStart(events: AlgorithmEvent[], i: number, window = 3) {
  if (!isTrusted(events[i])) return null
  const line = fitLine(neighbours(events, i, window, false))
  if (!line) return null
  return { seconds: line.offset + line.secondsPerBeat * events[i].start_beat, secondsPerBeat: line.secondsPerBeat }
}

// 5. Summarize everything for charts
// Signs that the algorithm lost its place in the recording.
export function looksMisaligned(events: AlgorithmEvent[]): boolean {
  return events.some((e) => e.status === 'unscored' || e.end_seconds <= e.start_seconds)
}

export type TimingPoint = {
  event: number
  seconds: number
  expectedSeconds: number | null
  bpm: number | null
  deviation: number | null
  timing: 'early' | 'late' | 'on time' | null
}

export type TimingSummary = {
  misaligned: boolean
  averageBpm: number | null
  rhythmScore: number | null // share of measured events that were on time, 0..1
  points: TimingPoint[]
}

export function analyzeTiming(
  events: AlgorithmEvent[],
  { window = 3, tolerance = 0.15 } = {},
): TimingSummary {
  const points = events.map((e, i): TimingPoint => {
    const deviation = timingDeviation(events, i, window)
    const timing = deviation === null ? null
      : deviation < -tolerance ? 'early'
      : deviation > tolerance ? 'late'
      : 'on time'
    return {
      event: e.event,
      seconds: e.start_seconds,
      expectedSeconds: expectedStart(events, i, window)?.seconds ?? null,
      bpm: localBpm(events, i, window),
      deviation,
      timing,
    }
  })

  const measured = points.filter((p) => p.timing !== null)
  const overall = fitLine(events.filter(isTrusted))
  return {
    misaligned: looksMisaligned(events),
    averageBpm: overall ? 60 / overall.secondsPerBeat : null,
    rhythmScore: measured.length ? measured.filter((p) => p.timing === 'on time').length / measured.length : null,
    points,
  }
}
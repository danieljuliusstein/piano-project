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
  // True near the start or end of the take, where the tempo window has
  // trusted notes on one side only, so bpm is an estimate.
  edge: boolean
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
    const before = events.slice(Math.max(0, i - window), i).filter(isTrusted).length
    const after = events.slice(i + 1, i + window + 1).filter(isTrusted).length
    return {
      event: e.event,
      seconds: e.start_seconds,
      expectedSeconds: expectedStart(events, i, window)?.seconds ?? null,
      bpm: localBpm(events, i, window),
      edge: before < window - 1 || after < window - 1,
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

// 6. Describe the tempo for the summary sentence, using reliable (non-edge) points only.
// A take counts as steady when every reliable point is within STEADY_RANGE of the average;
// these thresholds are starting guesses to check against real recordings.
const STEADY_RANGE = 0.08
const DRIFT_PERCENT = 5

export type TempoTrend = {
  steady: boolean
  // Percent change from the first third of the take to the last third; negative means slowing down.
  drift: number | null
  // The slowest reliable moment, when it is clearly below the average.
  dip: { event: number; startBeat: number; seconds: number; bpm: number } | null
}

export function tempoTrend(events: AlgorithmEvent[], summary: TimingSummary): TempoTrend | null {
  const reliable = summary.points.filter((p) => p.bpm !== null && !p.edge) as (TimingPoint & { bpm: number })[]
  if (reliable.length < 3 || summary.averageBpm === null) return null
  const average = summary.averageBpm

  const third = Math.max(1, Math.floor(reliable.length / 3))
  const mean = (points: { bpm: number }[]) => points.reduce((sum, p) => sum + p.bpm, 0) / points.length
  const first = mean(reliable.slice(0, third))
  const last = mean(reliable.slice(-third))
  const drift = Math.round(((last - first) / first) * 100)

  const steady = reliable.every((p) => Math.abs(p.bpm - average) / average <= STEADY_RANGE)
  const slowest = reliable.reduce((a, b) => (b.bpm < a.bpm ? b : a))
  const index = summary.points.indexOf(slowest)
  const dip = (average - slowest.bpm) / average > STEADY_RANGE
    ? { event: slowest.event, startBeat: events[index].start_beat, seconds: slowest.seconds, bpm: slowest.bpm }
    : null

  return { steady, drift: Math.abs(drift) >= DRIFT_PERCENT ? drift : null, dip }
}
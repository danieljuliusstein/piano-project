import { analyzeTiming, type AlgorithmEvent, type AnalysisResult } from '@/lib/timing'

export type Hand = 'rh' | 'lh'
export type IssueKind = 'note' | 'passage'
export type IssueId = string

export type PerformedNote = {
  id: string
  hand: Hand
  midi: number
  beat: number
  beats: number
  idealStart: number
  start: number
  duration: number
  velocity: number
  bar: number
  flagged: boolean
  status: AlgorithmEvent['status']
}

export type Issue = {
  id: IssueId
  hand: Hand
  kind: IssueKind
  midi?: number
  anchor: number
  range: [number, number]
  bars: string
  eyebrow: string
  title: string
  detail: string
}

export type PracticeNote = PerformedNote & { loopBeat: number }

export type ReviewSong = {
  title: string
  artist: string
}

export type ReviewSongId = 'elise' | 'joy'

export type PracticeSection = {
  title: string
  description: string
  notes: PracticeNote[]
  loopBeats: number
  bpm: number
  averageBpm: number | null
  startLabel: string
  endLabel: string
}

export type ReviewData = {
  title: string
  composer: string
  fileName: string
  recordedAt: string
  takeLabel: string
  summary: string
  duration: number
  bpm: number
  beatsPerBar: number
  secondsPerBeat: number
  notes: PerformedNote[]
  issues: Issue[]
  focusRange: [number, number]
  focusView: [number, number]
  fullView: [number, number]
  barLines: { bar: number; seconds: number }[]
  practice: PracticeSection
  recommendationTitle: string
  loopLabel: string
  misaligned: boolean
}

const BEATS_PER_BAR: Record<ReviewSongId, number> = { elise: 3, joy: 4 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function midiNoteName(midi: number) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

function formatRecordedAt(isoDate?: string) {
  if (!isoDate) return 'Just now'
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const month = MONTHS[date.getMonth()]
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getDate()} ${month} ${date.getFullYear()} · ${hours}:${minutes}`
}

function barsLabel(startBar: number, endBar: number) {
  return startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar}–${endBar}`
}

/**
 * Turn one evaluation into the review screen's timeline, annotations, and
 * practice passage. Nothing here is hand-authored per song: every position,
 * title, and suggested tempo comes from the analyzer output.
 */
export function buildReviewData(
  evaluation: AnalysisResult & { reference_bpm: number },
  song: ReviewSong,
  songId: ReviewSongId,
  recordedAt?: string,
): ReviewData {
  const events = evaluation.events
  const timing = analyzeTiming(events)
  const beatsPerBar = BEATS_PER_BAR[songId] ?? 4
  const lastEnd = events.reduce(
    (latest, event) => Math.max(latest, Number.isFinite(event.end_seconds) ? event.end_seconds : 0),
    0,
  )
  const duration = Math.max(lastEnd, 0.5)
  const averageBpm = timing.averageBpm
  const referenceBpm = averageBpm ?? evaluation.reference_bpm ?? 100
  const secondsPerBeat = 60 / referenceBpm

  const barFor = (beat: number) => Math.floor(beat / beatsPerBar + 1e-6) + 1

  const notes: PerformedNote[] = []
  events.forEach((event, index) => {
    const point = timing.points[index]
    const expected = event.expected.filter((pitch) => pitch > 0)
    const observed = event.observed.filter((pitch) => pitch > 0)
    const pitches = observed.length ? observed : expected
    if (!pitches.length) return

    const missing = event.status === 'missing' || event.status === 'unscored'
    const start = missing ? (point?.expectedSeconds ?? event.start_seconds) : event.start_seconds
    const idealStart = point?.expectedSeconds ?? start
    const noteDuration = Math.max(event.end_seconds - event.start_seconds, 0.06)
    const offBeat = point?.timing === 'early' || point?.timing === 'late'
    const velocity = Math.min(1, Math.max(0.35, 0.55 + (event.margin_db ?? 0) / 40))

    pitches.forEach((midi, pitchIndex) => {
      notes.push({
        id: `event-${event.event}-${pitchIndex}`,
        hand: midi >= 60 ? 'rh' : 'lh',
        midi,
        beat: event.start_beat,
        beats: event.beats,
        idealStart,
        start,
        duration: noteDuration,
        velocity,
        bar: barFor(event.start_beat),
        flagged: event.status !== 'ok' || offBeat,
        status: event.status,
      })
    })
  })
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi)

  const barLines: { bar: number; seconds: number }[] = []
  const seenBars = new Set<number>()
  for (const event of events) {
    const barIndex = Math.round(event.start_beat / beatsPerBar)
    if (Math.abs(event.start_beat - barIndex * beatsPerBar) > 0.02) continue
    const bar = barIndex + 1
    if (seenBars.has(bar)) continue
    seenBars.add(bar)
    barLines.push({ bar, seconds: event.start_seconds })
  }
  if (!seenBars.has(1)) barLines.unshift({ bar: 1, seconds: notes[0]?.start ?? 0 })
  barLines.sort((a, b) => a.seconds - b.seconds)

  const scored = events.map((event, index) => ({ event, point: timing.points[index] }))
  const errorEvents = scored.filter(
    (item) => item.event.status === 'wrong' || item.event.status === 'missing',
  )
  const offBeatEvents = scored
    .filter((item) => item.point?.deviation !== null && Math.abs(item.point.deviation) >= 0.15)
    .sort((a, b) => Math.abs(b.point!.deviation!) - Math.abs(a.point!.deviation!))
  const noteCandidate = errorEvents[0] ?? offBeatEvents[0]

  let noteIssue: Issue | undefined
  if (noteCandidate) {
    const { event, point } = noteCandidate
    const expected = event.expected.filter((pitch) => pitch > 0)
    const observed = event.observed.filter((pitch) => pitch > 0)
    const midi = observed[0] ?? expected[0] ?? 60
    const hand: Hand = midi >= 60 ? 'rh' : 'lh'
    const bar = barFor(event.start_beat)
    const deviation = point?.deviation ?? 0
    const milliseconds = Math.round(
      Math.abs(deviation) * (point?.bpm ? 60 / point.bpm : secondsPerBeat) * 1000,
    )
    const late = deviation > 0
    const noteName = midiNoteName(midi)
    let title: string
    let detail: string

    if (event.status === 'wrong') {
      title = `Wrong note at ${noteName}`
      detail = `The score expects ${expected.map(midiNoteName).join(' / ') || 'a different pitch'} here, but this take sounds ${observed.map(midiNoteName).join(' / ') || 'something else'}.`
    } else if (event.status === 'missing') {
      title = `Missed ${noteName}`
      detail = `The ${noteName} in this event never sounds clearly enough to count against the score.`
    } else {
      title = `Landed ${milliseconds} ms ${late ? 'late' : 'early'}`
      detail = `This attack sits ${milliseconds} ms ${late ? 'after' : 'before'} the pulse its neighbours establish.`
    }

    noteIssue = {
      id: 'note',
      hand,
      kind: 'note',
      midi,
      anchor: event.start_seconds,
      range: [
        Math.min(point?.expectedSeconds ?? event.start_seconds, event.start_seconds),
        Math.max(point?.expectedSeconds ?? event.start_seconds, event.start_seconds),
      ],
      bars: `Bar ${bar}`,
      eyebrow: `Bar ${bar} · ${hand === 'rh' ? 'Right hand' : 'Left hand'} · ${noteName}`,
      title,
      detail,
    }
  }

  let passageIssue: Issue | undefined
  const trusted = scored.filter((item) => item.point?.timing !== null)
  if (trusted.length >= 2) {
    let best: { items: typeof trusted; score: number } | null = null
    for (let index = 0; index < trusted.length; index += 1) {
      const items = trusted.slice(index, index + 4)
      if (items.length < 2) continue
      const deviations = items.map((item) => Math.abs(item.point?.deviation ?? 0))
      const errors = items.filter(
        (item) => item.event.status === 'wrong' || item.event.status === 'missing',
      ).length
      const score = deviations.reduce((sum, value) => sum + value, 0) / deviations.length + errors * 0.12
      if (!best || score > best.score) best = { items, score }
    }

    if (best) {
      const meanDeviation =
        best.items.reduce((sum, item) => sum + Math.abs(item.point?.deviation ?? 0), 0) /
        best.items.length
      const errors = best.items.filter(
        (item) => item.event.status === 'wrong' || item.event.status === 'missing',
      ).length
      if (meanDeviation > 0.08 || errors >= 2) {
        const first = best.items[0]
        const last = best.items[best.items.length - 1]
        const start = first.event.start_seconds
        const end = Math.max(last.event.end_seconds, start + 0.2)
        const rangeNotes = notes.filter((note) => note.start >= start - 0.05 && note.start <= end + 0.05)
        const rightHand = rangeNotes.filter((note) => note.hand === 'rh').length
        const hand: Hand = rightHand >= rangeNotes.length / 2 ? 'rh' : 'lh'
        const startBar = barFor(first.event.start_beat)
        const endBar = barFor(last.event.start_beat)
        const driftMs = Math.round(
          Math.max(
            ...best.items.map(
              (item) =>
                Math.abs(item.point?.deviation ?? 0) *
                (item.point?.bpm ? 60 / item.point.bpm : secondsPerBeat) *
                1000,
            ),
          ),
        )

        passageIssue = {
          id: 'passage',
          hand,
          kind: 'passage',
          anchor: (start + end) / 2,
          range: [start, end],
          bars: barsLabel(startBar, endBar),
          eyebrow: `${barsLabel(startBar, endBar)} · ${hand === 'rh' ? 'Right hand' : 'Left hand'}`,
          title: errors > 0 ? 'Loose passage' : 'Uneven timing',
          detail: `Attacks drift by up to ${driftMs} ms around the pulse across this passage. Loop it slowly before returning to tempo.`,
        }
      }
    }
  }

  const issues = [noteIssue, passageIssue].filter((issue): issue is Issue => issue !== undefined)

  let focusRange: [number, number]
  let focusBars: string
  if (passageIssue) {
    focusRange = passageIssue.range
    focusBars = passageIssue.bars
  } else if (noteIssue) {
    focusRange = [
      Math.max(0, noteIssue.range[0] - 1),
      Math.min(duration, noteIssue.range[1] + 1.5),
    ]
    focusBars = noteIssue.bars
  } else {
    focusRange = [0, Math.min(duration, 8)]
    focusBars = 'Opening'
  }
  if (focusRange[1] - focusRange[0] < 1.5) {
    focusRange[1] = Math.min(duration, focusRange[0] + 1.5)
  }
  focusRange[0] = Math.max(0, Math.min(focusRange[0], duration - 0.1))
  focusRange[1] = Math.max(focusRange[0] + 0.1, Math.min(focusRange[1], duration))

  const focusView: [number, number] = [
    Math.max(0, focusRange[0] - 0.4),
    Math.min(duration, focusRange[1] + 0.4),
  ]
  const fullView: [number, number] = [0, duration]
  const practiceBpm = Math.min(132, Math.max(40, Math.round(referenceBpm * 0.85)))
  const practiceSecondsPerBeat = 60 / practiceBpm
  const loopBeats = Math.max(
    1,
    Math.min(8, Math.ceil((focusRange[1] - focusRange[0]) / practiceSecondsPerBeat)),
  )
  const practiceEnd = Math.min(
    focusRange[1],
    focusRange[0] + loopBeats * practiceSecondsPerBeat,
  )

  let practiceNotes: PracticeNote[] = notes
    .filter(
      (note) =>
        note.start >= focusRange[0] - 0.05 &&
        note.start < focusRange[0] + loopBeats * practiceSecondsPerBeat,
    )
    .map((note) => ({
      ...note,
      loopBeat: Math.max(0, (note.start - focusRange[0]) / practiceSecondsPerBeat),
    }))

  if (!practiceNotes.length && notes.length) {
    const nearest = [...notes]
      .sort(
        (a, b) =>
          Math.abs(a.start - focusRange[0]) - Math.abs(b.start - focusRange[0]),
      )
      .slice(0, 6)
    practiceNotes = nearest.map((note) => ({
      ...note,
      loopBeat: Math.max(0, (note.start - focusRange[0]) / practiceSecondsPerBeat),
    }))
  }

  const momentCount = issues.length
  const summary = timing.misaligned
    ? 'The analyzer lost the thread in this take, so some positions are approximate.'
    : momentCount
      ? `${momentCount} moment${momentCount === 1 ? '' : 's'} in this take ${momentCount === 1 ? 'is' : 'are'} worth tightening.`
      : 'A clean take. Keep the pulse relaxed and repeat it.'

  return {
    title: song.title,
    composer: song.artist,
    fileName: evaluation.source,
    recordedAt: formatRecordedAt(recordedAt),
    takeLabel: 'Latest take',
    summary,
    duration,
    bpm: Math.round(referenceBpm),
    beatsPerBar,
    secondsPerBeat,
    notes,
    issues,
    focusRange,
    focusView,
    fullView,
    barLines,
    practice: {
      title: focusBars,
      description:
        passageIssue?.detail ??
        noteIssue?.detail ??
        'Loop this opening slowly, then rebuild toward the tempo you just played.',
      notes: practiceNotes,
      loopBeats,
      bpm: practiceBpm,
      averageBpm: averageBpm === null ? null : Math.round(averageBpm),
      startLabel: formatTime(focusRange[0]),
      endLabel: formatTime(practiceEnd),
    },
    recommendationTitle: `Work ${focusBars.toLowerCase()} at ${practiceBpm} BPM`,
    loopLabel: focusBars.replace(/^Bars? /, ''),
    misaligned: timing.misaligned,
  }
}

export function formatTime(seconds: number, precise = false) {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  if (precise) return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
  return `${minutes}:${Math.floor(rest).toString().padStart(2, '0')}`
}

export function positionAt(time: number, secondsPerBeat: number, beatsPerBar: number) {
  const totalBeats = Math.max(0, time) / Math.max(secondsPerBeat, 0.001)
  const bar = Math.floor(totalBeats / beatsPerBar) + 1
  const beat = Math.floor(totalBeats % beatsPerBar) + 1
  return { bar, beat }
}

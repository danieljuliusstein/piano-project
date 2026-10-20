export type Hand = 'rh' | 'lh'

export type PerformedNote = {
  id: string
  hand: Hand
  midi: number
  /** Position in the score, in beats from the start. */
  beat: number
  beats: number
  /** Ideal onset in seconds. */
  idealStart: number
  /** Actual onset in seconds, as played. */
  start: number
  duration: number
  velocity: number
  bar: number
  flagged: boolean
}

export type IssueId = 'rh-late' | 'lh-uneven'

export type Issue = {
  id: IssueId
  hand: Hand
  /** Point in time the annotation attaches to. */
  anchor: number
  range: [number, number]
  bars: string
  eyebrow: string
  title: string
  detail: string
}

export const TAKE = {
  title: 'Ode to Joy',
  composer: 'L. van Beethoven',
  recordedAt: 'Mar 10, 2026',
  take: 'Take 3',
  bpm: 120,
  beatsPerBar: 4,
  bars: 16,
}

export const SECONDS_PER_BEAT = 60 / TAKE.bpm
export const SECONDS_PER_BAR = SECONDS_PER_BEAT * TAKE.beatsPerBar
export const DURATION = TAKE.bars * SECONDS_PER_BAR

export const barStart = (bar: number) => (bar - 1) * SECONDS_PER_BAR

export const FOCUS_RANGE: [number, number] = [barStart(5), barStart(7)]
export const FOCUS_VIEW: [number, number] = [barStart(4) - 0.4, barStart(8) + 0.4]
export const FULL_VIEW: [number, number] = [0, DURATION]

type Phrase = [midi: number, beats: number][]

const E4 = 64
const F4 = 65
const G4 = 67
const D4 = 62
const C4 = 60
const G3 = 55

const opening: Phrase = [
  [E4, 1], [E4, 1], [F4, 1], [G4, 1],
  [G4, 1], [F4, 1], [E4, 1], [D4, 1],
  [C4, 1], [C4, 1], [D4, 1], [E4, 1],
]

const melody: Phrase = [
  ...opening, [E4, 1.5], [D4, 0.5], [D4, 2],
  ...opening, [D4, 1.5], [C4, 0.5], [C4, 2],
  [D4, 1], [D4, 1], [E4, 1], [C4, 1],
  [D4, 1], [E4, 0.5], [F4, 0.5], [E4, 1], [C4, 1],
  [D4, 1], [E4, 0.5], [F4, 0.5], [E4, 1], [D4, 1],
  [C4, 1], [D4, 1], [G3, 2],
  ...opening, [D4, 1.5], [C4, 0.5], [C4, 2],
]

const C3 = 48
const G2 = 43
const D3 = 50
const G3L = 55

/** Two half-note roots per bar. */
const bass: number[][] = [
  [C3, G3L], [G2, D3], [C3, G3L], [G2, D3],
  [C3, G3L], [G2, D3], [C3, G3L], [G2, C3],
  [G2, D3], [C3, G2], [G2, D3], [C3, G2],
  [C3, G3L], [G2, D3], [C3, G3L], [G2, C3],
]

const RH_LATE_MS = 180
const LH_DRIFT_MS: Record<number, number> = { 0: 70, 1: -55, 2: 95, 3: -40 }

const humanize = (i: number) => (((i * 37) % 11) - 5) * 3
const humanVelocity = (i: number) => 0.55 + ((i * 53) % 7) / 18

function buildNotes(): PerformedNote[] {
  const notes: PerformedNote[] = []
  let beat = 0
  melody.forEach(([midi, beats], i) => {
    const bar = Math.floor(beat / TAKE.beatsPerBar) + 1
    const isLate = bar === 5 && beat === 16
    const offset = isLate ? RH_LATE_MS : humanize(i)
    const idealStart = beat * SECONDS_PER_BEAT
    notes.push({
      id: `rh-${i}`,
      hand: 'rh',
      midi,
      beat,
      beats,
      idealStart,
      start: idealStart + offset / 1000,
      duration: beats * SECONDS_PER_BEAT * 0.92,
      velocity: humanVelocity(i),
      bar,
      flagged: isLate,
    })
    beat += beats
  })

  let lhIndex = 0
  bass.forEach((pair, barIndex) => {
    pair.forEach((midi, half) => {
      const bar = barIndex + 1
      const noteBeat = barIndex * TAKE.beatsPerBar + half * 2
      const inFocus = bar === 5 || bar === 6
      const driftKey = (bar - 5) * 2 + half
      const offset = inFocus ? LH_DRIFT_MS[driftKey] : humanize(lhIndex + 3)
      const idealStart = noteBeat * SECONDS_PER_BEAT
      notes.push({
        id: `lh-${lhIndex}`,
        hand: 'lh',
        midi,
        beat: noteBeat,
        beats: 2,
        idealStart,
        start: idealStart + offset / 1000,
        duration: 2 * SECONDS_PER_BEAT * 0.95,
        velocity: humanVelocity(lhIndex + 2) * 0.8,
        bar,
        flagged: inFocus,
      })
      lhIndex++
    })
  })

  return notes.sort((a, b) => a.start - b.start)
}

export const NOTES = buildNotes()

const lateNote = NOTES.find((n) => n.hand === 'rh' && n.flagged)!

export const ISSUES: Issue[] = [
  {
    id: 'rh-late',
    hand: 'rh',
    anchor: lateNote.start,
    range: [lateNote.idealStart, lateNote.start],
    bars: 'Bar 5',
    eyebrow: 'Bar 5 · Right hand · E4',
    title: 'Landed 180 ms late',
    detail:
      'The phrase restarts here and the downbeat E4 hesitated. Everything after it was rushed slightly to catch up.',
  },
  {
    id: 'lh-uneven',
    hand: 'lh',
    anchor: barStart(5) + 1.5 * SECONDS_PER_BEAT * 2,
    range: FOCUS_RANGE,
    bars: 'Bars 5–6',
    eyebrow: 'Bars 5–6 · Left hand',
    title: 'Uneven half notes',
    detail:
      'Bass notes drifted between −55 and +95 ms against the beat, so the melody had nothing steady to sit on.',
  },
]

export const PRACTICE_NOTES = NOTES.filter((n) => n.bar === 5 || n.bar === 6).map((n) => ({
  ...n,
  /** Beat within the two-bar loop, using ideal timing. */
  loopBeat: n.beat - 4 * TAKE.beatsPerBar,
}))

export const LOOP_BEATS = 2 * TAKE.beatsPerBar

export function formatTime(seconds: number, precise = false) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  if (precise) return `${m}:${rest.toFixed(1).padStart(4, '0')}`
  return `${m}:${Math.floor(rest).toString().padStart(2, '0')}`
}

export function positionAt(time: number) {
  const totalBeats = Math.max(0, Math.min(time, DURATION - 0.001)) / SECONDS_PER_BEAT
  const bar = Math.floor(totalBeats / TAKE.beatsPerBar) + 1
  const beat = Math.floor(totalBeats % TAKE.beatsPerBar) + 1
  return { bar, beat }
}

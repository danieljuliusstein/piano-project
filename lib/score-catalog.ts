export type BackendScore = {
  score_id: string
  version: string
  title: string
  composer: string
  section: string
  reference_bpm: number
  time_signature: string
  difficulty: string
  supported_hands: string[]
  active: boolean
}

export type Score = {
  title: string
  artist: string
  level: string
  detail: string
  meter: string
  beatSymbol: string
  beatsPerBar: number
  pickupBeats: number
}

function beatsPerBar(timeSignature: string) {
  const numerator = Number.parseInt(timeSignature.split('/')[0] ?? '', 10)
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4
}

function beatSymbol(timeSignature: string) {
  return timeSignature.split('/')[1] === '8' ? '♪' : '♩'
}

export function scoreFromBackend(score: BackendScore): Score {
  const beat = beatSymbol(score.time_signature)
  return {
    title: score.title,
    artist: score.composer,
    level: score.difficulty,
    detail: `${score.section} · ${beat} = ${Math.round(score.reference_bpm)}`,
    meter: score.time_signature,
    beatSymbol: beat,
    beatsPerBar: beatsPerBar(score.time_signature),
    pickupBeats: 0,
  }
}

export function scoreCatalogFromBackend(scores: BackendScore[]) {
  return Object.fromEntries(
    scores
      .filter((score) => score.active)
      .map((score) => [score.score_id, scoreFromBackend(score)]),
  ) as Record<string, Score>
}

export const defaultScoreCatalog: Record<string, Score> = {
  ode_melody: scoreFromBackend({
    score_id: 'ode_melody',
    version: '1.0',
    title: 'Ode to Joy (Melody)',
    composer: 'Ludwig van Beethoven',
    section: 'Main Theme — bars 1–4',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['rh'],
    active: true,
  }),
  ode_harmony: scoreFromBackend({
    score_id: 'ode_harmony',
    version: '1.0',
    title: 'Ode to Joy (Two Hands)',
    composer: 'Ludwig van Beethoven',
    section: 'Main Theme — bars 1–4',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['both'],
    active: true,
  }),
  c_major_rh: scoreFromBackend({
    score_id: 'c_major_rh',
    version: '1.0',
    title: 'C Major Scale (Right Hand)',
    composer: 'Traditional',
    section: '1 Octave Ascending',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['rh'],
    active: true,
  }),
  c_major_both: scoreFromBackend({
    score_id: 'c_major_both',
    version: '1.0',
    title: 'C Major Scale (Both Hands)',
    composer: 'Traditional',
    section: '1 Octave Ascending',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['both'],
    active: true,
  }),
  e_major_rh: scoreFromBackend({
    score_id: 'e_major_rh',
    version: '1.0',
    title: 'E Major Scale (Right Hand)',
    composer: 'Traditional',
    section: '1 Octave Ascending',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['rh'],
    active: true,
  }),
  e_major_rh_down: scoreFromBackend({
    score_id: 'e_major_rh_down',
    version: '1.0',
    title: 'E Major Scale (Descending)',
    composer: 'Traditional',
    section: '1 Octave Descending',
    reference_bpm: 120,
    time_signature: '4/4',
    difficulty: 'beginner',
    supported_hands: ['rh'],
    active: true,
  }),
  canon_lh: scoreFromBackend({
    score_id: 'canon_lh',
    version: '1.0',
    title: 'Canon in D (Left Hand)',
    composer: 'Johann Pachelbel',
    section: 'Ground Bass — bars 1–8',
    reference_bpm: 100,
    time_signature: '4/4',
    difficulty: 'intermediate',
    supported_hands: ['lh'],
    active: true,
  }),
  canon_both: scoreFromBackend({
    score_id: 'canon_both',
    version: '1.0',
    title: 'Canon in D (Both Hands)',
    composer: 'Johann Pachelbel',
    section: 'Bars 1–8',
    reference_bpm: 100,
    time_signature: '4/4',
    difficulty: 'intermediate',
    supported_hands: ['both'],
    active: true,
  }),
}

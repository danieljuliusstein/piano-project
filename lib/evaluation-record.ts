import type { AlgorithmEvent } from '@/lib/timing'

export type SongId = string

export type PitchSummary = {
  score: number
  precision: number
  recall: number
  f1: number
  correct: number
  expected: number
  missing: number
  wrong: number
  insertions: number
}

export type EvaluationRecord = {
  id: string
  createdAt: string
  song: SongId
  fileName: string
  model: string
  referenceBpm: number
  durationSeconds: number | null
  noteAccuracy: number
  rhythmAccuracy: number | null
  averageBpm: number | null
  overallAccuracy: number
  pitch: PitchSummary
  events: AlgorithmEvent[]
}

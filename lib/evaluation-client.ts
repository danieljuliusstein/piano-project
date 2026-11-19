import type { AnalysisResult } from '@/lib/timing'

export type Evaluation = AnalysisResult & {
  reference_bpm: number
  savedAt?: string
  pitch: {
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
}

export async function evaluateRecording(file: File, scoreId: string): Promise<Evaluation> {
  const body = new FormData()
  body.append('file', file)
  body.append('score_id', scoreId)

  const response = await fetch('/api/evaluate', { method: 'POST', body })
  const payload = await response.json() as Evaluation | { error?: string }
  if (!response.ok || !('pitch' in payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Evaluation failed.')
  }
  return payload
}

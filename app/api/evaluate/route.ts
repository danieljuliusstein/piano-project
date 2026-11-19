import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { analyzeTiming, type AlgorithmEvent } from '@/lib/timing'
import type { EvaluationRecord, PitchSummary } from '@/lib/evaluation-record'
import { saveEvaluation } from '@/lib/evaluation-store'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a'])
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'

type BackendResult = {
  schema_version: string
  algorithm_version: string
  evaluation_id: string
  source: string
  score_id: string
  reference_bpm: number
  audio?: {
    duration_seconds?: number
  }
  pitch: PitchSummary
  events: Array<{
    event: number
    note_id?: string
    hand?: string
    bar?: number
    start_beat: number
    beats: number
    status: 'ok' | 'wrong' | 'missing'
    flags?: string[]
    expected: number[]
    observed: number[]
    start_seconds: number | null
    end_seconds: number | null
    confidence?: number
  }>
}

type BackendResponse = {
  status?: string
  result?: BackendResult
  error?: {
    message?: string
  }
}

function backendUrl() {
  return (process.env.PIANO_EVAL_API_URL ?? DEFAULT_BACKEND_URL).replace(/\/+$/, '')
}

function normalizeEvents(result: BackendResult): AlgorithmEvent[] {
  const secondsPerBeat = 60 / result.reference_bpm
  return result.events.map((event) => {
    const fallbackStart = event.start_beat * secondsPerBeat
    const fallbackEnd = fallbackStart + event.beats * secondsPerBeat
    return {
      event: event.event,
      start_beat: event.start_beat,
      beats: event.beats,
      status: event.status,
      expected: event.expected,
      observed: event.observed,
      start_seconds: event.start_seconds ?? fallbackStart,
      end_seconds: event.end_seconds ?? fallbackEnd,
      margin_db: event.confidence ?? null,
    }
  })
}

function resolveScoreId(form: FormData) {
  const scoreId = form.get('score_id')
  if (typeof scoreId === 'string' && scoreId.length > 0) return scoreId

  const model = form.get('model')
  if (typeof model !== 'string' || model.length === 0) return null
  return model === 'ode_to_joy_with_harmony' ? 'ode_harmony' : model
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    const scoreId = resolveScoreId(form)

    if (!(file instanceof File) || !scoreId) {
      return Response.json({ error: 'An audio file and score ID are required.' }, { status: 400 })
    }

    const extension = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return Response.json({ error: 'Only MP3, WAV, and M4A files are supported.' }, { status: 415 })
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'Audio files must be between 1 byte and 25 MB.' }, { status: 413 })
    }

    const upload = new FormData()
    upload.append('file', file, file.name)
    upload.append('score_id', scoreId)

    const headers: HeadersInit = {}
    if (process.env.PIANO_EVAL_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.PIANO_EVAL_API_TOKEN}`
    }

    const response = await fetch(`${backendUrl()}/v1/evaluations`, {
      method: 'POST',
      headers,
      body: upload,
      cache: 'no-store',
    })
    const payload = await response.json() as BackendResponse

    if (!response.ok || !payload.result) {
      const message = payload.error?.message ?? `Evaluation service returned HTTP ${response.status}.`
      return Response.json({ error: message }, { status: response.status >= 400 ? response.status : 502 })
    }

    const result = payload.result
    const events = normalizeEvents(result)
    const timing = analyzeTiming(events)
    const referenceBpm = Math.round(result.reference_bpm)
    const record: EvaluationRecord = {
      id: result.evaluation_id || randomUUID(),
      createdAt: new Date().toISOString(),
      song: result.score_id,
      fileName: file.name,
      model: result.score_id,
      referenceBpm: referenceBpm,
      durationSeconds: result.audio?.duration_seconds
        ?? events.at(-1)?.end_seconds
        ?? null,
      noteAccuracy: result.pitch.score,
      rhythmAccuracy: timing.rhythmScore === null ? null : Math.round(timing.rhythmScore * 100),
      averageBpm: timing.averageBpm === null ? null : Math.round(timing.averageBpm),
      overallAccuracy: timing.rhythmScore === null
        ? result.pitch.score
        : Math.round((result.pitch.score + timing.rhythmScore * 100) / 2),
      pitch: result.pitch,
      events,
    }

    try {
      await saveEvaluation(record)
    } catch (saveError) {
      console.error('Unable to save evaluation:', saveError)
    }

    return Response.json({
      source: file.name,
      model: result.score_id,
      reference_bpm: result.reference_bpm,
      pitch: result.pitch,
      events,
      savedAt: record.createdAt,
      evaluation_id: result.evaluation_id,
      algorithm_version: result.algorithm_version,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown evaluation service error'
    console.error('Audio evaluation request failed:', details)
    return Response.json(
      { error: 'Unable to reach the piano evaluation service.' },
      { status: 502 },
    )
  }
}

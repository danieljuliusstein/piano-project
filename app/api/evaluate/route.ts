import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { analyzeTiming, type AlgorithmEvent } from '@/lib/timing'
import type { EvaluationRecord, PitchSummary } from '@/lib/evaluation-record'
import { saveEvaluation } from '@/lib/evaluation-store'

const execFileAsync = promisify(execFile)
const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a'])

type AnalyzerResult = {
  source: string
  model: string
  reference_bpm: number
  events: AlgorithmEvent[]
  pitch: PitchSummary
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolvePython() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  const localEnvironment = [
    path.join(process.cwd(), '.venv', 'bin', 'python'),
    path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
  ]
  return localEnvironment.find((candidate) => existsSync(candidate)) ?? 'python3'
}

export async function POST(request: Request) {
  let temporaryPath: string | undefined

  try {
    const form = await request.formData()
    const file = form.get('file')
    const model = form.get('model')

    if (!(file instanceof File) || typeof model !== 'string') {
      return Response.json({ error: 'An audio file and score model are required.' }, { status: 400 })
    }

    const extension = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return Response.json({ error: 'Only MP3, WAV, and M4A files are supported.' }, { status: 415 })
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'Audio files must be between 1 byte and 25 MB.' }, { status: 413 })
    }

    temporaryPath = path.join(os.tmpdir(), `piano-review-${randomUUID()}${extension}`)
    await fs.writeFile(temporaryPath, Buffer.from(await file.arrayBuffer()))

    const python = resolvePython()
    const script = path.join(process.cwd(), 'python', 'analyze_recording.py')
    const { stdout } = await execFileAsync(
      python,
      [script, '--audio', temporaryPath, '--model', model],
      { cwd: path.join(process.cwd(), 'python'), maxBuffer: 4 * 1024 * 1024 },
    )
    const result = JSON.parse(stdout.trim()) as AnalyzerResult
    result.source = file.name

    const timing = analyzeTiming(result.events)
    const noteAccuracy = result.pitch.score
    const rhythmAccuracy = timing.rhythmScore === null ? null : Math.round(timing.rhythmScore * 100)
    const averageBpm = timing.averageBpm === null ? null : Math.round(timing.averageBpm)
    const lastEvent = result.events[result.events.length - 1]
    const record: EvaluationRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      song: result.model.startsWith('fur_elise') ? 'elise' : 'joy',
      fileName: file.name,
      model: result.model,
      referenceBpm: Math.round(result.reference_bpm),
      durationSeconds: lastEvent && Number.isFinite(lastEvent.end_seconds)
        ? Math.round(lastEvent.end_seconds)
        : null,
      noteAccuracy,
      rhythmAccuracy,
      averageBpm,
      overallAccuracy: rhythmAccuracy === null
        ? noteAccuracy
        : Math.round((noteAccuracy + rhythmAccuracy) / 2),
      pitch: result.pitch,
      events: result.events,
    }

    try {
      await saveEvaluation(record)
    } catch (saveError) {
      console.error('Unable to save evaluation:', saveError)
    }

    return Response.json({ ...result, savedAt: record.createdAt })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown analyzer error'
    console.error('Audio evaluation failed:', details)
    return Response.json(
      { error: 'Evaluation failed. Make sure the Python analyzer is installed (pnpm setup:python) and the audio is a supported file.' },
      { status: 500 },
    )
  } finally {
    if (temporaryPath) {
      await fs.unlink(temporaryPath).catch((error) => {
        console.error('Unable to remove temporary audio file:', error)
      })
    }
  }
}

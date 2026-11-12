import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a'])

type AnalyzerResult = {
  source: string
  model: string
  reference_bpm: number
  events: unknown[]
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    const python = process.env.PYTHON_PATH || 'python'
    const script = path.join(process.cwd(), 'python', 'analyze_recording.py')
    const { stdout } = await execFileAsync(
      python,
      [script, '--audio', temporaryPath, '--model', model],
      { cwd: path.join(process.cwd(), 'python'), maxBuffer: 4 * 1024 * 1024 },
    )
    const result = JSON.parse(stdout.trim()) as AnalyzerResult
    result.source = file.name
    return Response.json(result)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown analyzer error'
    console.error('Audio evaluation failed:', details)
    return Response.json(
      { error: 'Evaluation failed. Check that Python, librosa, NumPy, and SciPy are installed.' },
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

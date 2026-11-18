import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { EvaluationRecord } from '@/lib/evaluation-record'

const dataDirectory = process.env.EVALUATION_DATA_DIR ?? path.join(process.cwd(), '.data')
const storePath = path.join(dataDirectory, 'evaluations.json')

let pending: Promise<unknown> = Promise.resolve()

export async function listEvaluations(): Promise<EvaluationRecord[]> {
  try {
    const raw = await fs.readFile(storePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as EvaluationRecord[]) : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function saveEvaluation(record: EvaluationRecord): Promise<void> {
  // Serialize writes so two evaluations finishing together cannot overwrite each other.
  const write = pending.then(async () => {
    const existing = await listEvaluations()
    await fs.mkdir(dataDirectory, { recursive: true })
    const temporaryPath = `${storePath}.${process.pid}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify([...existing, record], null, 2), 'utf8')
    await fs.rename(temporaryPath, storePath)
  })
  pending = write.catch(() => undefined)
  return write
}

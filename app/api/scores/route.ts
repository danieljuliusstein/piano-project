type BackendScore = {
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

type BackendScoresResponse = {
  scores?: BackendScore[]
  error?: {
    message?: string
  }
}

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const backendUrl = (process.env.PIANO_EVAL_API_URL ?? DEFAULT_BACKEND_URL).replace(/\/+$/, '')
    const headers: HeadersInit = {}
    if (process.env.PIANO_EVAL_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.PIANO_EVAL_API_TOKEN}`
    }

    const response = await fetch(`${backendUrl}/v1/scores`, {
      headers,
      cache: 'no-store',
    })
    const payload = await response.json() as BackendScoresResponse
    if (!response.ok || !Array.isArray(payload.scores)) {
      return Response.json(
        { error: payload.error?.message ?? `Score service returned HTTP ${response.status}.` },
        { status: response.status >= 400 ? response.status : 502 },
      )
    }
    return Response.json({ scores: payload.scores })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown score service error'
    console.error('Unable to load score catalog:', details)
    return Response.json({ error: 'Unable to reach the piano evaluation service.' }, { status: 502 })
  }
}

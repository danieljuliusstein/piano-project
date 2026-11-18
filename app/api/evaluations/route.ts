import { listEvaluations } from '@/lib/evaluation-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return Response.json({ evaluations: await listEvaluations() })
  } catch (error) {
    console.error('Unable to read saved evaluations:', error)
    return Response.json({ error: 'Unable to load saved evaluations.' }, { status: 500 })
  }
}

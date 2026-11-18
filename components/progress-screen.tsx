'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { EvaluationRecord, SongId } from '@/lib/evaluation-record'

type SongInfo = {
  title: string
  artist: string
  level: string
  detail: string
  beatSymbol: string
}

type ChartCard = {
  title: string
  value: string
  points: number[]
  scale: 'percent' | 'tempo'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PAGE_SIZE = 5
const RECENT_COUNT = 3

function formatRecordedAt(isoDate: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return { date: 'Unknown date', time: '--:--' }
  const month = MONTHS[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return { date: `${day} ${month} ${year}`, time: `${hours}:${minutes}` }
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--'
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function pointStyle(value: number, index: number, count: number, card: ChartCard) {
  const left = count <= 1 ? 50 : 8 + (index / (count - 1)) * 84
  if (card.scale === 'percent') {
    return { left: `${left}%`, bottom: `${Math.min(92, Math.max(6, value))}%` }
  }
  const low = Math.min(...card.points)
  const high = Math.max(...card.points)
  const bottom = high === low ? 50 : 12 + ((value - low) / (high - low)) * 76
  return { left: `${left}%`, bottom: `${bottom}%` }
}

function TakeRow({ record, detailed = false }: { record: EvaluationRecord; detailed?: boolean }) {
  const recordedAt = formatRecordedAt(record.createdAt)
  const rhythm = record.rhythmAccuracy === null ? 'not measured' : `${record.rhythmAccuracy}%`
  return <div className={`take-row ${detailed ? 'detailed' : ''}`}>
    <div className="take-when">
      <b>{recordedAt.date} · {recordedAt.time}</b>
      <small>{detailed ? record.fileName : formatDuration(record.durationSeconds)}</small>
    </div>
    <strong className="take-overall">{record.overallAccuracy}%</strong>
    <span className="take-detail">Notes {record.noteAccuracy}% · Rhythm {rhythm}</span>
  </div>
}

export function ProgressScreen({
  song,
  songs,
  onSongChange,
  onBack,
}: {
  song: SongId
  songs: Record<SongId, SongInfo>
  onSongChange: (song: SongId) => void
  onBack: () => void
}) {
  const [records, setRecords] = useState<EvaluationRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/evaluations', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { evaluations?: EvaluationRecord[]; error?: string }
        if (!response.ok || !Array.isArray(payload.evaluations)) {
          throw new Error(payload.error ?? 'Unable to load saved evaluations.')
        }
        return payload.evaluations
      })
      .then(setRecords)
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') return
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load saved evaluations.')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    setShowAll(false)
    setPage(0)
  }, [song])

  const loading = records === null && error === null
  const history = (records ?? [])
    .filter((record) => record.song === song)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const newestFirst = [...history].reverse()
  const latest = history[history.length - 1]
  const chartTakes = history.slice(-8)
  const pageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRecords = newestFirst.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const cards: ChartCard[] = [
    {
      title: 'Notes',
      value: latest ? `${latest.noteAccuracy}%` : '–',
      points: chartTakes.map((record) => record.noteAccuracy),
      scale: 'percent',
    },
    {
      title: 'Tempo',
      value: latest?.averageBpm ? `${songs[song].beatSymbol} = ${latest.averageBpm}` : '–',
      points: chartTakes
        .map((record) => record.averageBpm)
        .filter((bpm): bpm is number => bpm !== null),
      scale: 'tempo',
    },
    {
      title: 'Rhythm',
      value: latest?.rhythmAccuracy !== null && latest?.rhythmAccuracy !== undefined
        ? `${latest.rhythmAccuracy}%`
        : '–',
      points: chartTakes
        .map((record) => record.rhythmAccuracy)
        .filter((accuracy): accuracy is number => accuracy !== null),
      scale: 'percent',
    },
  ]

  return <main className={`page-content progress-page ${showAll ? 'all-takes-open' : ''}`}>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to new evaluation</button>
    <div className="progress-heading">
      <div>
        <div className="eyebrow">SONG PROGRESS</div>
        <h1>{songs[song].title}</h1>
        <p className="lede">{songs[song].detail}</p>
      </div>
      <div className="latest">
        <small>Latest-play accuracy</small>
        <strong>{latest ? `${latest.overallAccuracy}%` : '–'}</strong>
        <span>{latest ? formatRecordedAt(latest.createdAt).date : 'No takes yet'}</span>
      </div>
    </div>
    <p className="fine-print">Overall accuracy = (note accuracy + rhythm accuracy) ÷ 2 · Saved on this device.</p>

    <div className="segmented song-switch" role="tablist" aria-label="Song progress">
      {(Object.keys(songs) as SongId[]).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={song === id}
          className={song === id ? 'selected' : ''}
          onClick={() => onSongChange(id)}
        >
          {songs[id].title}
        </button>
      ))}
    </div>

    {loading && <p className="chart-note">Loading saved takes…</p>}
    {error && <p className="chart-note">{error}</p>}

    {!loading && !error && history.length === 0 && (
      <div className="history-empty">
        <strong>No takes saved for {songs[song].title} yet.</strong>
        <p>Upload a performance and it will appear here with its note, tempo, and rhythm results.</p>
        <button className="primary" onClick={onBack}>Start a new evaluation</button>
      </div>
    )}

    {history.length > 0 && !showAll && <>
      <div className="section-heading progress-section">
        <h2>Progress over time</h2>
        <span>
          {chartTakes.length < history.length ? `Last ${chartTakes.length} logged plays` : `All ${history.length} logged plays`}
        </span>
      </div>
      <div className="chart-grid progress-charts">
        {cards.map((card) => (
          <div className="chart-card" key={card.title} aria-label={`${card.title}: ${card.value}`}>
            <h3>{card.title}<strong>{card.value}</strong></h3>
            <div className="mini-chart">
              {card.points.map((point, index) => (
                <span key={index} style={pointStyle(point, index, card.points.length, card)}>{point}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="section-heading progress-section">
        <h2>Recent takes</h2>
        <button type="button" className="text-button progress-all-link" onClick={() => { setPage(0); setShowAll(true) }}>
          All takes ({history.length})
        </button>
      </div>
      <div className="recent-list">
        {newestFirst.slice(0, RECENT_COUNT).map((record) => <TakeRow record={record} key={record.id} />)}
      </div>
    </>}

    {history.length > 0 && showAll && <>
      <div className="section-heading progress-section">
        <h2>All takes</h2>
        <button type="button" className="text-button progress-all-link" onClick={() => setShowAll(false)}>
          Back to summary
        </button>
      </div>
      <div className="all-takes-list">
        {pageRecords.map((record) => <TakeRow record={record} detailed key={record.id} />)}
      </div>
      <div className="take-pager">
        <button type="button" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
          Previous
        </button>
        <span>Page {safePage + 1} of {pageCount}</span>
        <button type="button" disabled={safePage === pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
          Next
        </button>
      </div>
    </>}
  </main>
}

import type { AlgorithmEvent, TimingSummary } from '@/lib/timing'

// Rows keep the .expected-row / .played-row look from globals.css, but blocks are
// placed by time instead of filling a fixed 16-column grid.
const rowStyle = { display: 'block', position: 'relative', height: 72 } as const
const labelRowStyle = { display: 'block', position: 'relative', height: 16, marginLeft: 95, marginRight: 12 } as const

export function RhythmChart({ events, timing }: { events: AlgorithmEvent[]; timing: TimingSummary }) {
  if (timing.misaligned) {
    return <p className="chart-note">We couldn't follow the timing of this recording, so there is no rhythm view for it.</p>
  }

  const start = events[0].start_seconds
  const end = events[events.length - 1].end_seconds
  const left = (seconds: number) => `${((seconds - start) / (end - start)) * 100}%`
  const width = (seconds: number) => `calc(${(seconds / (end - start)) * 100}% - 2px)`
  const score = timing.rhythmScore === null ? null : Math.round(timing.rhythmScore * 100)

  return <>
    <div className="feedback-legend">
      <span className="legend-blue">■</span> On time <span className="legend-orange">■</span> Early / late <span className="legend-gray">■</span> Expected
      {score !== null && <em>{score}% of notes on time</em>}
    </div>
    <div className="rhythm-roll">
      <strong>Time → whole recording</strong>
      <b>EXPECTED</b>
      <div className="expected-row" style={rowStyle}>
        {events.map((e, i) => {
          const point = timing.points[i]
          const at = point.expectedSeconds ?? e.start_seconds
          return <i key={e.event} style={{ position: 'absolute', left: left(at), width: width(e.end_seconds - e.start_seconds) }} />
        })}
      </div>
      <b>ACTUALLY PLAYED</b>
      <div className="played-row" style={rowStyle}>
        {events.map((e, i) => {
          const point = timing.points[i]
          // No block where nothing reliable was played, so missing notes show as gaps.
          if (point.timing === null) return null
          const label = point.deviation === null ? '' : ` · ${Math.abs(point.deviation).toFixed(2)} beat ${point.deviation < 0 ? 'early' : 'late'}`
          return <i
            key={e.event}
            className={point.timing === 'on time' ? '' : 'late'}
            title={`Note ${e.event + 1}${label}`}
            style={{ position: 'absolute', left: left(e.start_seconds), width: width(e.end_seconds - e.start_seconds) }}
          />
        })}
      </div>
      <div className="timing-labels" style={labelRowStyle}>
        {timing.points.map((point, i) => point.timing === 'early' || point.timing === 'late'
          ? <span key={point.event} style={{ position: 'absolute', left: left(events[i].start_seconds) }}>{point.timing === 'early' ? 'E' : 'L'}</span>
          : null)}
      </div>
    </div>
    <p className="chart-note">
      Each block is a moment where notes start. Orange blocks started noticeably early (E) or late (L) compared with the notes around them; gaps are notes that weren't detected. Hover a block for details.
    </p>
  </>
}

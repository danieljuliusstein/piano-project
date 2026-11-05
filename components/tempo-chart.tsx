import type { TimingSummary } from '@/lib/timing'

// The SVG uses the chart's own pixel height, so the three axis labels,
// which globals.css places at 0px, 50px and 100px, line up with the data.
const WIDTH = 1000
const HEIGHT = 166
const LABEL_SPAN = 100

function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TempoChart({ timing }: { timing: TimingSummary }) {
  const measured = timing.points.filter((p) => p.bpm !== null)
  if (timing.misaligned || measured.length < 2 || timing.averageBpm === null) {
    return <p className="chart-note">We couldn't follow the timing of this recording, so there is no tempo graph for it.</p>
  }

  const bpms = measured.map((p) => p.bpm as number)
  const low = Math.floor(Math.min(...bpms) / 10) * 10
  const high = Math.max(low + 10, Math.ceil(Math.max(...bpms) / 10) * 10)
  const start = timing.points[0].seconds
  const end = timing.points[timing.points.length - 1].seconds
  const x = (seconds: number) => ((seconds - start) / (end - start)) * WIDTH
  const y = (bpm: number) => ((high - bpm) / (high - low)) * LABEL_SPAN

  // Untrusted events break the line instead of being drawn with a guessed value.
  let path = ''
  let drawing = false
  for (const point of timing.points) {
    if (point.bpm === null) {
      drawing = false
      continue
    }
    path += `${drawing ? 'L' : 'M'}${x(point.seconds).toFixed(1)} ${y(point.bpm).toFixed(1)} `
    drawing = true
  }

  const fastest = measured.reduce((a, b) => ((b.bpm as number) > (a.bpm as number) ? b : a))
  const slowest = measured.reduce((a, b) => ((b.bpm as number) < (a.bpm as number) ? b : a))
  const average = Math.round(timing.averageBpm)

  return <>
    <div className="chart-caption"><strong>Tempo over time</strong><span>Beats per minute</span></div>
    <div className="chart-legend"><span className="tempo-line" /> Your tempo <span className="reference-line" /> Your average · {average} BPM</div>
    <div className="tempo-chart">
      <span>{high}</span><span>{(high + low) / 2}</span><span>{low}</span>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-label={`Tempo over time, averaging ${average} BPM`}>
        <path d={`M0 ${y(timing.averageBpm).toFixed(1)} H${WIDTH}`} style={{ stroke: '#cbd4dd', strokeWidth: 2, strokeDasharray: '6 6' }} />
        <path d={path} />
      </svg>
      <div className="chart-axis">{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{formatTime(start + f * (end - start))}</span>)}</div>
    </div>
    <p className="chart-note">
      Fastest around {formatTime(fastest.seconds)} ({Math.round(fastest.bpm as number)} BPM), slowest around {formatTime(slowest.seconds)} ({Math.round(slowest.bpm as number)} BPM).
    </p>
  </>
}

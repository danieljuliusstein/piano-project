import { tempoTrend, type AlgorithmEvent, type TimingSummary } from '@/lib/timing'

// The SVG uses the chart's own pixel height, so the three axis labels,
// which globals.css places at 0px, 50px and 100px, line up with the data.
const WIDTH = 1000
const HEIGHT = 166
const LABEL_SPAN = 100

// What the chart needs to know about the piece: which note is one beat
// (♪ or ♩), and how beats group into bars, counting from the first full bar.
export type TempoSong = { beatSymbol: string; beatsPerBar: number; pickupBeats: number }

function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// targetBpm is the score's reference tempo, in the same beat units as the player's tempo.
export function TempoChart({ timing, events, targetBpm, song }: { timing: TimingSummary; events: AlgorithmEvent[]; targetBpm: number | null; song: TempoSong }) {
  const measured = timing.points.filter((p) => p.bpm !== null)
  if (timing.misaligned || measured.length < 2 || timing.averageBpm === null) {
    return <p className="chart-note">We couldn't follow the timing of this recording, so there is no tempo graph for it.</p>
  }

  const bpms = measured.map((p) => p.bpm as number)
  // The axis covers the curve and both reference lines, so neither line falls off the chart.
  const plotted = targetBpm === null ? [...bpms, timing.averageBpm] : [...bpms, timing.averageBpm, targetBpm]
  const low = Math.floor(Math.min(...plotted) / 10) * 10
  const high = Math.max(low + 10, Math.ceil(Math.max(...plotted) / 10) * 10)
  const start = timing.points[0].seconds
  const end = timing.points[timing.points.length - 1].seconds
  const x = (seconds: number) => ((seconds - start) / (end - start)) * WIDTH
  const y = (bpm: number) => ((high - bpm) / (high - low)) * LABEL_SPAN

  // Each segment joins two neighbouring measured points. Untrusted events break the
  // line instead of being drawn with a guessed value, and segments touching an edge
  // point go in a separate, fainter path because the window there is one-sided.
  let reliablePath = ''
  let edgePath = ''
  timing.points.forEach((point, i) => {
    const previous = timing.points[i - 1]
    if (!previous || previous.bpm === null || point.bpm === null) return
    const segment = `M${x(previous.seconds).toFixed(1)} ${y(previous.bpm).toFixed(1)} L${x(point.seconds).toFixed(1)} ${y(point.bpm).toFixed(1)} `
    if (previous.edge || point.edge) edgePath += segment
    else reliablePath += segment
  })

  const average = Math.round(timing.averageBpm)
  const target = targetBpm === null ? null : Math.round(targetBpm)
  const trend = tempoTrend(events, timing)

  const sentences: string[] = []
  if (targetBpm !== null) {
    const difference = Math.round(((timing.averageBpm - targetBpm) / targetBpm) * 100)
    sentences.push(Math.abs(difference) < 3
      ? `On average you played close to the target tempo of ${target}.`
      : `On average you played ${Math.abs(difference)}% ${difference < 0 ? 'slower' : 'faster'} than the target tempo of ${target}.`)
  }
  if (trend?.steady) {
    sentences.push('You kept a steady tempo throughout.')
  } else if (trend) {
    if (trend.drift !== null) {
      sentences.push(`You ${trend.drift < 0 ? 'slowed down' : 'sped up'} by about ${Math.abs(trend.drift)}% from the start to the end.`)
    }
    if (trend.dip) {
      const bar = Math.floor((trend.dip.startBeat - song.pickupBeats) / song.beatsPerBar) + 1
      const where = bar >= 1 ? `bar ${bar}` : 'the opening notes'
      sentences.push(`Your tempo dipped most around ${where} (${formatTime(trend.dip.seconds)}, ${Math.round(trend.dip.bpm)}).`)
      sentences.push(`Try practicing ${where} slowly with a metronome, then build back up.`)
    }
  }

  return <>
    <div className="chart-caption"><strong>Tempo over time</strong><span>Beats per minute ({song.beatSymbol} = 1 beat)</span></div>
    <div className="chart-legend">
      <span className="tempo-line" /> Your tempo
      <span className="reference-line" /> Your average · {average}
      {target !== null && <><span className="target-line" /> Target · {target}</>}
    </div>
    <div className="tempo-chart">
      <span>{high}</span><span>{(high + low) / 2}</span><span>{low}</span>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-label={`Tempo over time, averaging ${average} ${song.beatSymbol} per minute${target === null ? '' : ` against a target of ${target}`}`}>
        {targetBpm !== null && <path d={`M0 ${y(targetBpm).toFixed(1)} H${WIDTH}`} style={{ stroke: 'var(--ink)', strokeWidth: 2, strokeDasharray: '2 5' }} />}
        <path d={`M0 ${y(timing.averageBpm).toFixed(1)} H${WIDTH}`} style={{ stroke: '#cbd4dd', strokeWidth: 2, strokeDasharray: '6 6' }} />
        <path d={edgePath} style={{ strokeDasharray: '5 6', opacity: 0.45, strokeLinecap: 'round' }} />
        <path d={reliablePath} style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      </svg>
      <div className="chart-axis">{[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{formatTime(start + f * (end - start))}</span>)}</div>
    </div>
    <p className="chart-note">
      {sentences.join(' ')}{edgePath && ' The faded dashed line at the start and end is less certain, because there are only notes on one side to measure from.'}
    </p>
  </>
}

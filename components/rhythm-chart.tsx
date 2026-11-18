'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { midiNoteName } from '@/lib/performance'
import type { AlgorithmEvent, TimingPoint, TimingSummary } from '@/lib/timing'

// Rows keep the .expected-row / .played-row look from globals.css, but blocks are
// placed by time instead of filling a fixed 16-column grid.
const rowStyle = { display: 'block', position: 'relative', height: 'var(--rhythm-row, 72px)' } as const
const labelRowStyle = { display: 'block', position: 'relative', height: 16, marginLeft: 95, marginRight: 12 } as const

// Where the two rows sit inside the roll, so the connector layer can span the gap between them.
type Geometry = { left: number; width: number; linksTop: number; linksBottom: number; playedBottom: number }

// One expected start joined to the moment it was played. The *Center values are where
// the connector meets each block: the middle of its edge, as a percentage of the row.
type Pair = {
  index: number
  event: AlgorithmEvent
  point: TimingPoint
  expectedAt: number
  playedAt: number
  expectedCenter: number
  playedCenter: number
  offsetMs: number
}

function pitchList(pitches: number[]) {
  return pitches.filter((pitch) => pitch > 0).map(midiNoteName).join(' + ')
}

function describe({ event, point, offsetMs }: Pair) {
  const ms = Math.abs(offsetMs)
  const direction = offsetMs < 0 ? 'early' : 'late'
  const timing = point.timing === 'on time'
    ? (ms < 10 ? 'on time' : `on time · ${ms} ms ${direction}`)
    : `${ms} ms ${direction}`
  const expected = pitchList(event.expected)
  const observed = pitchList(event.observed)
  const pitches = (event.status === 'wrong' || event.status === 'partial') && observed && observed !== expected
    ? `${expected} · ${event.status === 'wrong' ? 'played' : 'heard only'} ${observed}`
    : expected
  return { title: `Note ${event.event + 1} · ${timing}`, pitches }
}

export function RhythmChart({ events, timing }: { events: AlgorithmEvent[]; timing: TimingSummary }) {
  const rollRef = useRef<HTMLDivElement>(null)
  const expectedRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const [active, setActive] = useState<number | null>(null)

  // Row sizes change with the screen layout, so re-measure whenever the roll resizes.
  useEffect(() => {
    const roll = rollRef.current
    const expected = expectedRef.current
    const played = playedRef.current
    if (!roll || !expected || !played) return
    const measure = () => setGeometry({
      left: expected.offsetLeft,
      width: expected.offsetWidth,
      linksTop: expected.offsetTop + expected.offsetHeight,
      linksBottom: played.offsetTop,
      playedBottom: played.offsetTop + played.offsetHeight,
    })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(roll)
    return () => observer.disconnect()
  }, [timing.misaligned])

  if (timing.misaligned) {
    return <p className="chart-note">We couldn't follow the timing of this recording, so there is no rhythm view for it.</p>
  }

  const start = events[0].start_seconds
  const end = events[events.length - 1].end_seconds
  const position = (seconds: number) => ((seconds - start) / (end - start)) * 100
  const width = (seconds: number) => `calc(${(seconds / (end - start)) * 100}% - 2px)`
  const score = timing.rhythmScore === null ? null : Math.round(timing.rhythmScore * 100)

  // Only events that were actually played get a pair; missing notes keep their expected block alone.
  const pairs: Pair[] = events.flatMap((event, index) => {
    const point = timing.points[index]
    if (point.timing === null || point.expectedSeconds === null) return []
    // Both blocks are drawn with the event's length, so their centres sit the same
    // distance from their starts and the slant still shows the timing difference.
    const halfBlock = ((event.end_seconds - event.start_seconds) / (end - start)) * 50
    const expectedAt = position(point.expectedSeconds)
    const playedAt = position(event.start_seconds)
    return [{
      index,
      event,
      point,
      expectedAt,
      playedAt,
      expectedCenter: expectedAt + halfBlock,
      playedCenter: playedAt + halfBlock,
      offsetMs: Math.round((event.start_seconds - point.expectedSeconds) * 1000),
    }]
  })
  const pairFor = new Map(pairs.map((pair) => [pair.index, pair]))
  const activePair = active === null ? undefined : pairFor.get(active)
  const details = activePair && describe(activePair)

  // Mouse hover previews a pair; a tap or click (for touch screens) selects it.
  const hoverProps = (index: number) => ({
    onPointerEnter: (event: PointerEvent) => { if (event.pointerType === 'mouse') setActive(index) },
    onPointerLeave: (event: PointerEvent) => { if (event.pointerType === 'mouse') setActive((current) => (current === index ? null : current)) },
    onClick: () => setActive(index),
  })
  const pairClass = (index: number) => (active === index ? 'is-active' : '')

  let tooltipStyle: CSSProperties | undefined
  if (activePair && geometry) {
    const shift = activePair.playedCenter < 15 ? 'none' : activePair.playedCenter > 85 ? 'translateX(-100%)' : 'translateX(-50%)'
    tooltipStyle = {
      left: geometry.left + (activePair.playedCenter / 100) * geometry.width,
      top: geometry.playedBottom + 6,
      transform: shift,
    }
  }

  return <>
    <div className="feedback-legend">
      <span className="legend-blue">■</span> On time <span className="legend-orange">■</span> Early / late <span className="legend-gray">■</span> Expected
      {score !== null && <em>{score}% of notes on time</em>}
    </div>
    <div
      ref={rollRef}
      className={`rhythm-roll${active !== null ? ' has-active' : ''}`}
      onClick={(event) => { if (event.target === event.currentTarget) setActive(null) }}
    >
      <strong>Time → whole recording</strong>
      <b>EXPECTED</b>
      <div ref={expectedRef} className="expected-row" style={rowStyle}>
        {events.map((e, i) => {
          const point = timing.points[i]
          const at = point.expectedSeconds ?? e.start_seconds
          const paired = pairFor.has(i)
          return <i
            key={e.event}
            className={paired ? pairClass(i) : ''}
            style={{ position: 'absolute', left: `${position(at)}%`, width: width(e.end_seconds - e.start_seconds) }}
            {...(paired ? hoverProps(i) : {})}
          />
        })}
      </div>
      <b className="rhythm-label">ACTUALLY PLAYED</b>
      <div ref={playedRef} className="played-row" style={rowStyle}>
        {events.map((e, i) => {
          const pair = pairFor.get(i)
          // No block where nothing reliable was played, so missing notes show as gaps.
          if (!pair) return null
          const { title, pitches } = describe(pair)
          return <i
            key={e.event}
            role="button"
            tabIndex={0}
            aria-label={`${title}. ${pitches}`}
            className={`${pair.point.timing === 'on time' ? '' : 'late'} ${pairClass(i)}`.trim()}
            style={{ position: 'absolute', left: `${pair.playedAt}%`, width: width(e.end_seconds - e.start_seconds) }}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((current) => (current === i ? null : current))}
            {...hoverProps(i)}
          />
        })}
      </div>
      {geometry && <svg
        className="rhythm-links"
        style={{ left: geometry.left, top: geometry.linksTop, width: geometry.width, height: Math.max(geometry.linksBottom - geometry.linksTop, 1) }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {pairs.map((pair) => <g key={pair.event.event}>
          <line
            className={`${pair.point.timing === 'on time' ? 'on-time' : 'off-time'} ${pairClass(pair.index)}`.trim()}
            x1={pair.expectedCenter} y1={0} x2={pair.playedCenter} y2={100}
          />
          <line className="hit" x1={pair.expectedCenter} y1={0} x2={pair.playedCenter} y2={100} {...hoverProps(pair.index)} />
        </g>)}
      </svg>}
      <div className="timing-labels" style={labelRowStyle}>
        {timing.points.map((point, i) => point.timing === 'early' || point.timing === 'late'
          ? <span key={point.event} style={{ position: 'absolute', left: `${position(events[i].start_seconds)}%` }}>{point.timing === 'early' ? 'E' : 'L'}</span>
          : null)}
      </div>
      {details && tooltipStyle && <div className="rhythm-tooltip" style={tooltipStyle} aria-hidden="true">
        <strong>{details.title}</strong>
        <span>{details.pitches}</span>
      </div>}
    </div>
    <p className="chart-note">
      Each block is a moment where notes start, and each line joins when it was expected to when it was played: straight means on time, slanted means early or late. Orange marks timing that is noticeably off; gaps are notes that weren't detected. Hover over or tap a block for details.
    </p>
  </>
}

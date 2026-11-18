'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  formatTime,
  positionAt,
  type Hand,
  type Issue,
  type IssueId,
  type ReviewData,
} from '@/lib/performance'
import type { LoopRange } from '@/hooks/use-playback'
import { cn } from '@/lib/utils'
import { IssueAnnotation } from './issue-annotation'

const CARD_WIDTH = 256
const EDGE = 8

const RH = { top: 150, bottom: 520 }
const LH = { top: 690, bottom: 870 }

type Lane = { top: number; bottom: number; low: number; high: number }

const laneFor = (data: ReviewData, hand: Hand): Lane => {
  const values = data.notes.filter((note) => note.hand === hand).map((note) => note.midi)
  const fallback = hand === 'rh' ? { top: RH.top, bottom: RH.bottom, low: 60, high: 72 } : { top: LH.top, bottom: LH.bottom, low: 48, high: 60 }
  if (!values.length) return fallback
  const low = Math.min(...values) - 1
  const high = Math.max(...values) + 1
  return {
    top: hand === 'rh' ? RH.top : LH.top,
    bottom: hand === 'rh' ? RH.bottom : LH.bottom,
    low,
    high: high === low ? low + 1 : high,
  }
}

const noteMarkerTop = (hand: Hand) => (hand === 'rh' ? 8.5 : 62.5)
const passageMarkerTop = (hand: Hand) => (hand === 'rh' ? 8.5 : 94.5)

type PerformanceTimelineProps = {
  time: number
  duration: number
  view: [number, number]
  loop: LoopRange | null
  selected: IssueId | null
  data: ReviewData
  onSelect: (id: IssueId | null) => void
  onScrubStart: () => void
  onScrub: (t: number) => void
  onScrubEnd: (t: number) => void
  onPlayMoment: (issue: Issue) => void
  onLoop: () => void
}

export function PerformanceTimeline({
  time,
  duration,
  view,
  loop,
  selected,
  data,
  onSelect,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onPlayMoment,
  onLoop,
}: PerformanceTimelineProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(358)
  const scrubbing = useRef(false)

  useEffect(() => {
    const element = plotRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const [viewStart, viewEnd] = view
  const span = Math.max(viewEnd - viewStart, 0.01)
  const safeDuration = Math.max(duration, 0.1)
  const zoomed = span < safeDuration * 0.6
  const pct = (t: number) => ((t - viewStart) / span) * 100
  const sx = (t: number) => pct(t) * 10
  const { bar, beat } = positionAt(time, data.secondsPerBeat, data.beatsPerBar)
  const rhLane = laneFor(data, 'rh')
  const lhLane = laneFor(data, 'lh')

  const pitchY = (midi: number, hand: Hand) => {
    const lane = hand === 'rh' ? rhLane : lhLane
    const k = (midi - lane.low) / (lane.high - lane.low)
    return lane.bottom - k * (lane.bottom - lane.top)
  }

  const timeFromPointer = (clientX: number) => {
    const rect = plotRef.current!.getBoundingClientRect()
    const k = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return viewStart + k * span
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubbing.current = true
    onSelect(null)
    onScrubStart()
    onScrub(timeFromPointer(event.clientX))
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    onScrub(timeFromPointer(event.clientX))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    onScrubEnd(timeFromPointer(event.clientX))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1
    const map: Record<string, number> = {
      ArrowRight: time + step,
      ArrowLeft: time - step,
      Home: 0,
      End: duration,
    }
    if (!(event.key in map)) return
    event.preventDefault()
    onScrubStart()
    onScrubEnd(map[event.key])
  }

  const labelStep = zoomed ? 2 : Math.max(4, Math.ceil(safeDuration / 6))
  const timeLabels = Array.from(
    { length: Math.floor(safeDuration / labelStep) + 1 },
    (_, index) => index * labelStep,
  )
  const inView = (t: number) => t >= viewStart - 0.5 && t <= viewEnd + 0.5

  const activeIssue = data.issues.find((issue) => issue.id === selected)
  const anchorPx = activeIssue ? (pct(activeIssue.anchor) / 100) * width : 0
  const annotationLayout = (() => {
    if (!activeIssue) return null
    if (activeIssue.hand === 'rh') {
      const fitsRight = anchorPx + 16 + CARD_WIDTH <= width - EDGE
      const left = fitsRight ? anchorPx + 16 : Math.max(EDGE, anchorPx - 16 - CARD_WIDTH)
      return {
        style: { left, top: 'calc(8.5% - 14px)' },
        caret: 'left' as const,
        caretOffset: 4,
        connector: { from: Math.min(anchorPx, left + CARD_WIDTH), to: Math.max(anchorPx, left) },
      }
    }
    const left = Math.min(Math.max(anchorPx - CARD_WIDTH / 2, EDGE), width - CARD_WIDTH - EDGE)
    return {
      style: { left, bottom: '35%' },
      caret: 'bottom' as const,
      caretOffset: Math.min(Math.max(anchorPx - left - 12, 8), CARD_WIDTH - 32),
      connector: null,
    }
  })()

  return (
    <section aria-label="Performance timeline" className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-6 overflow-hidden" aria-hidden>
        {data.barLines.map(({ bar: barNumber, seconds }) => {
          const x = pct(seconds)
          if (x < -5 || x > 100) return null
          const phrase = (barNumber - 1) % 4 === 0
          const focused = seconds >= data.focusRange[0] - 0.2 && seconds <= data.focusRange[1] + 0.2
          return (
            <span
              key={barNumber}
              className={cn(
                'absolute top-1 font-mono text-[10px] tabular-nums',
                phrase ? 'text-foreground/60' : 'text-foreground/25',
                focused && (selected || loop) && 'text-foreground',
              )}
              style={{ left: `calc(${x}% + 3px)` }}
            >
              {barNumber}
            </span>
          )
        })}
      </div>

      <div ref={plotRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Scrub through recording"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={Math.round(time * 10) / 10}
          aria-valuetext={`${formatTime(time)}, bar ${bar} beat ${beat}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 cursor-ew-resize touch-none overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 focus-visible:ring-inset"
        >
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden
          >
            {loop && (
              <rect
                x={sx(loop.start)}
                width={sx(loop.end) - sx(loop.start)}
                y={0}
                height={1000}
                className="fill-foreground/[0.035]"
              />
            )}

            {data.barLines.map(({ bar: barNumber, seconds }) => {
              if (!inView(seconds)) return null
              const phrase = (barNumber - 1) % 4 === 0
              return (
                <line
                  key={`bar-${barNumber}`}
                  x1={sx(seconds)}
                  x2={sx(seconds)}
                  y1={0}
                  y2={1000}
                  vectorEffect="non-scaling-stroke"
                  className={phrase ? 'stroke-foreground/15' : 'stroke-foreground/[0.07]'}
                />
              )
            })}

            <line
              x1={0}
              x2={1000}
              y1={605}
              y2={605}
              vectorEffect="non-scaling-stroke"
              className="stroke-foreground/[0.07]"
            />

            {data.notes.map((note) => {
              if (!inView(note.start)) return null
              const x = sx(note.start)
              const y = pitchY(note.midi, note.hand)
              const half = 22 + note.velocity * 34
              const played = note.start <= time
              const sounding = played && time < note.start + note.duration
              const signal = note.flagged
              return (
                <g key={note.id}>
                  {signal && zoomed && (
                    <>
                      <line
                        x1={sx(note.idealStart)}
                        x2={sx(note.idealStart)}
                        y1={y - half}
                        y2={y + half}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="2 3"
                        className="stroke-foreground/40"
                      />
                      <line
                        x1={sx(note.idealStart)}
                        x2={x}
                        y1={y}
                        y2={y}
                        vectorEffect="non-scaling-stroke"
                        className="stroke-signal"
                      />
                    </>
                  )}
                  <line
                    x1={x}
                    x2={x}
                    y1={y - half}
                    y2={y + half}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="square"
                    strokeWidth={sounding ? 3 : signal ? 2 : 1.5}
                    strokeDasharray={note.status === 'missing' ? '3 3' : undefined}
                    className={cn(
                      'transition-[stroke-opacity] duration-300',
                      signal ? 'stroke-signal' : 'stroke-foreground',
                    )}
                    strokeOpacity={sounding ? 1 : signal ? (played ? 1 : 0.8) : played ? 0.85 : 0.28}
                  />
                </g>
              )
            })}
          </svg>

          <span className="pointer-events-none absolute top-[2.5%] left-0 font-mono text-[10px] tracking-[0.14em] text-foreground/35 uppercase">
            Right hand
          </span>
          <span className="pointer-events-none absolute top-[62.5%] left-0 font-mono text-[10px] tracking-[0.14em] text-foreground/35 uppercase">
            Left hand
          </span>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground"
            style={{ left: `${pct(time)}%` }}
          >
            <span className="absolute -top-px -left-[3.5px] size-2 bg-foreground" />
          </div>
        </div>

        {data.issues.map((issue) => {
          if (!inView(issue.anchor)) return null
          const expanded = selected === issue.id

          if (issue.kind === 'passage') {
            const left = pct(issue.range[0])
            const right = pct(issue.range[1])
            const top = passageMarkerTop(issue.hand)
            return (
              <button
                key={issue.id}
                type="button"
                aria-label={`${issue.bars}, ${issue.title.toLowerCase()}`}
                aria-expanded={expanded}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelect(expanded ? null : issue.id)}
                className="group absolute z-20 h-8 -translate-y-1/2 focus-visible:outline-none"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(right - left, 1)}%`,
                  top: `${top}%`,
                }}
              >
                <span
                  className={cn(
                    'absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 border-x border-signal transition-all group-focus-visible:ring-2 group-focus-visible:ring-signal/50',
                    expanded ? 'border-x-2' : '',
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-x-0 top-1/2 -translate-y-1/2 bg-signal transition-all',
                      expanded ? 'h-0.5' : 'h-px group-hover:h-0.5',
                    )}
                  />
                </span>
              </button>
            )
          }

          const top = noteMarkerTop(issue.hand)
          const issueNote =
            issue.midi === undefined
              ? undefined
              : data.notes.find(
                  (note) =>
                    note.midi === issue.midi && Math.abs(note.start - issue.anchor) < 0.3,
                )
          const noteTop = issueNote
            ? (pitchY(issueNote.midi, issueNote.hand) - (22 + issueNote.velocity * 34)) / 10
            : top

          return (
            <div key={issue.id}>
              {issueNote && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute w-px bg-signal/60"
                  style={{
                    left: `${pct(issue.anchor)}%`,
                    top: `${top}%`,
                    height: `${Math.max(noteTop - top, 0)}%`,
                  }}
                />
              )}
              <button
                type="button"
                aria-label={`${issue.eyebrow}, ${issue.title.toLowerCase()}`}
                aria-expanded={expanded}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelect(expanded ? null : issue.id)}
                className="group absolute z-20 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:outline-none"
                style={{ left: `${pct(issue.anchor)}%`, top: `${top}%` }}
              >
                <span
                  className={cn(
                    'size-2.5 rotate-45 border border-signal transition-all group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-signal/50 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                    expanded ? 'scale-125 bg-signal' : 'bg-background',
                  )}
                />
              </button>
            </div>
          )
        })}

        {activeIssue && annotationLayout && (
          <>
            {annotationLayout.connector && (
              <span
                aria-hidden
                className="pointer-events-none absolute z-20 h-px bg-signal/60"
                style={{
                  top: '8.5%',
                  left: annotationLayout.connector.from + 6,
                  width: Math.max(
                    annotationLayout.connector.to - annotationLayout.connector.from - 6,
                    0,
                  ),
                }}
              />
            )}
            <IssueAnnotation
              key={activeIssue.id}
              issue={activeIssue}
              style={annotationLayout.style}
              caret={annotationLayout.caret}
              caretOffset={annotationLayout.caretOffset}
              onPlayMoment={() => onPlayMoment(activeIssue)}
              onLoop={onLoop}
              onClose={() => onSelect(null)}
            />
          </>
        )}
      </div>

      <div className="relative h-6 overflow-hidden" aria-hidden>
        {timeLabels.map((t) => {
          const x = pct(t)
          if (x < -2 || x > 96) return null
          return (
            <span
              key={t}
              className="absolute top-1.5 font-mono text-[10px] text-foreground/35 tabular-nums"
              style={{ left: `${x}%` }}
            >
              {formatTime(t)}
            </span>
          )
        })}
      </div>
    </section>
  )
}

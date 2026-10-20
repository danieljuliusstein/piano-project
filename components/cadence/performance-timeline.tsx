'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  DURATION,
  FOCUS_RANGE,
  ISSUES,
  NOTES,
  SECONDS_PER_BAR,
  SECONDS_PER_BEAT,
  TAKE,
  formatTime,
  positionAt,
  type Issue,
  type IssueId,
} from '@/lib/performance'
import type { LoopRange } from '@/hooks/use-playback'
import { cn } from '@/lib/utils'
import { IssueAnnotation } from './issue-annotation'

const CARD_WIDTH = 256
const EDGE = 8

const RH = { top: 150, bottom: 520, low: 55, high: 67 }
const LH = { top: 690, bottom: 870, low: 43, high: 55 }
const RH_MARKER_Y = 8.5
const LH_BRACKET_Y = 94.5

const pitchY = (midi: number, hand: 'rh' | 'lh') => {
  const lane = hand === 'rh' ? RH : LH
  const k = (midi - lane.low) / (lane.high - lane.low)
  return lane.bottom - k * (lane.bottom - lane.top)
}

type PerformanceTimelineProps = {
  time: number
  view: [number, number]
  loop: LoopRange | null
  selected: IssueId | null
  onSelect: (id: IssueId | null) => void
  onScrubStart: () => void
  onScrub: (t: number) => void
  onScrubEnd: (t: number) => void
  onPlayMoment: (issue: Issue) => void
  onLoop: () => void
}

export function PerformanceTimeline({
  time,
  view,
  loop,
  selected,
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
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [viewStart, viewEnd] = view
  const span = viewEnd - viewStart
  const zoomed = span < DURATION * 0.6
  const pct = (t: number) => ((t - viewStart) / span) * 100
  const sx = (t: number) => pct(t) * 10

  const timeFromPointer = (clientX: number) => {
    const rect = plotRef.current!.getBoundingClientRect()
    const k = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return viewStart + k * span
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbing.current = true
    onSelect(null)
    onScrubStart()
    onScrub(timeFromPointer(e.clientX))
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    onScrub(timeFromPointer(e.clientX))
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    onScrubEnd(timeFromPointer(e.clientX))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1
    const map: Record<string, number> = {
      ArrowRight: time + step,
      ArrowLeft: time - step,
      Home: 0,
      End: DURATION,
    }
    if (!(e.key in map)) return
    e.preventDefault()
    onScrubStart()
    onScrubEnd(map[e.key])
  }

  const bars = Array.from({ length: TAKE.bars }, (_, i) => i + 1)
  const beats = Array.from({ length: TAKE.bars * TAKE.beatsPerBar }, (_, i) => i * SECONDS_PER_BEAT)
  const labelStep = zoomed ? 2 : 8
  const timeLabels = Array.from({ length: Math.floor(DURATION / labelStep) + 1 }, (_, i) => i * labelStep)
  const { bar, beat } = positionAt(time)

  const rhIssue = ISSUES.find((i) => i.id === 'rh-late')!
  const lhIssue = ISSUES.find((i) => i.id === 'lh-uneven')!
  const lateNote = NOTES.find((n) => n.hand === 'rh' && n.flagged)!
  const lhSelected = selected === 'lh-uneven'
  const activeIssue = ISSUES.find((i) => i.id === selected)
  const inView = (t: number) => t >= viewStart - 0.5 && t <= viewEnd + 0.5

  const lateHalf = 22 + lateNote.velocity * 34
  const lateNoteTopPct = (pitchY(lateNote.midi, 'rh') - lateHalf) / 10

  const anchorPx = activeIssue ? (pct(activeIssue.anchor) / 100) * width : 0
  const annotationLayout = (() => {
    if (!activeIssue) return null
    if (activeIssue.hand === 'rh') {
      const fitsRight = anchorPx + 16 + CARD_WIDTH <= width - EDGE
      const left = fitsRight ? anchorPx + 16 : Math.max(EDGE, anchorPx - 16 - CARD_WIDTH)
      return {
        style: { left, top: `calc(${RH_MARKER_Y}% - 14px)` },
        caret: 'left' as const,
        caretOffset: 4,
        connector: { from: Math.min(anchorPx, left + CARD_WIDTH), to: Math.max(anchorPx, left) },
      }
    }
    const left = Math.min(Math.max(anchorPx - CARD_WIDTH / 2, EDGE), width - CARD_WIDTH - EDGE)
    return {
      style: { left, bottom: `${100 - LH.top / 10 + 4}%` },
      caret: 'bottom' as const,
      caretOffset: Math.min(Math.max(anchorPx - left - 12, 8), CARD_WIDTH - 32),
      connector: null,
    }
  })()

  return (
    <section aria-label="Performance timeline" className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-6 overflow-hidden" aria-hidden>
        {bars.map((b) => {
          const x = pct((b - 1) * SECONDS_PER_BAR)
          if (x < -5 || x > 100) return null
          const phrase = (b - 1) % 4 === 0
          return (
            <span
              key={b}
              className={cn(
                'absolute top-1 font-mono text-[10px] tabular-nums',
                phrase ? 'text-foreground/60' : 'text-foreground/25',
                (b === 5 || b === 6) && (selected || loop) && 'text-foreground',
              )}
              style={{ left: `calc(${x}% + 3px)` }}
            >
              {b}
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
          aria-valuemax={DURATION}
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

            {zoomed &&
              beats.map((t) =>
                inView(t) ? (
                  <line
                    key={`beat-${t}`}
                    x1={sx(t)}
                    x2={sx(t)}
                    y1={0}
                    y2={1000}
                    vectorEffect="non-scaling-stroke"
                    className="stroke-foreground/[0.05]"
                    strokeDasharray="1 5"
                  />
                ) : null,
              )}

            {bars.map((b) => {
              const t = (b - 1) * SECONDS_PER_BAR
              if (!inView(t)) return null
              const phrase = (b - 1) % 4 === 0
              return (
                <line
                  key={`bar-${b}`}
                  x1={sx(t)}
                  x2={sx(t)}
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

            {NOTES.map((note) => {
              if (!inView(note.start)) return null
              const x = sx(note.start)
              const y = pitchY(note.midi, note.hand)
              const half = 22 + note.velocity * 34
              const played = note.start <= time
              const sounding = played && time < note.start + note.duration
              const isLate = note.hand === 'rh' && note.flagged
              const lhFlag = note.hand === 'lh' && note.flagged && lhSelected
              const signal = isLate || lhFlag
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

          {inView(rhIssue.anchor) && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute w-px bg-signal/60"
                style={{
                  left: `${pct(rhIssue.anchor)}%`,
                  top: `${RH_MARKER_Y}%`,
                  height: `${Math.max(lateNoteTopPct - RH_MARKER_Y, 0)}%`,
                }}
              />
              <button
                type="button"
                aria-label="Bar 5, right hand E4 landed 180 milliseconds late"
                aria-expanded={selected === 'rh-late'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(selected === 'rh-late' ? null : 'rh-late')}
                className="group absolute z-20 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:outline-none"
                style={{ left: `${pct(rhIssue.anchor)}%`, top: `${RH_MARKER_Y}%` }}
              >
                <span
                  className={cn(
                    'size-2.5 rotate-45 border border-signal transition-all group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-signal/50 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                    selected === 'rh-late' ? 'scale-125 bg-signal' : 'bg-background',
                  )}
                />
              </button>
            </>
          )}

          {inView(FOCUS_RANGE[0]) && (
            <button
              type="button"
              aria-label="Bars 5 to 6, uneven left-hand timing"
              aria-expanded={lhSelected}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect(lhSelected ? null : 'lh-uneven')}
              className="group absolute z-20 h-8 -translate-y-1/2 focus-visible:outline-none"
              style={{
                left: `${pct(FOCUS_RANGE[0])}%`,
                width: `${pct(FOCUS_RANGE[1]) - pct(FOCUS_RANGE[0])}%`,
                top: `${LH_BRACKET_Y}%`,
              }}
            >
              <span
                className={cn(
                  'absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 border-x border-signal transition-all group-focus-visible:ring-2 group-focus-visible:ring-signal/50',
                  lhSelected ? 'border-x-2' : '',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-x-0 top-1/2 -translate-y-1/2 bg-signal transition-all',
                    lhSelected ? 'h-0.5' : 'h-px group-hover:h-0.5',
                  )}
                />
              </span>
            </button>
          )}

          {activeIssue && annotationLayout && (
            <>
              {annotationLayout.connector && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute z-20 h-px bg-signal/60"
                  style={{
                    top: `${RH_MARKER_Y}%`,
                    left: annotationLayout.connector.from + 6,
                    width: Math.max(annotationLayout.connector.to - annotationLayout.connector.from - 6, 0),
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

'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePracticeLoop, type HandFilter } from '@/hooks/use-practice-loop'
import type { Hand, PracticeSection } from '@/lib/performance'
import { cn } from '@/lib/utils'

const HANDS: { id: HandFilter; label: string }[] = [
  { id: 'both', label: 'Both hands' },
  { id: 'rh', label: 'Right' },
  { id: 'lh', label: 'Left' },
]

const MIN_BPM = 40
const MAX_BPM = 132

const laneFor = (practice: PracticeSection, hand: Hand) => {
  const values = practice.notes.filter((note) => note.hand === hand).map((note) => note.midi)
  const fallback = hand === 'rh' ? [60, 72] : [48, 60]
  const low = values.length ? Math.min(...values) - 1 : fallback[0]
  const high = values.length ? Math.max(...values) + 1 : fallback[1]
  return hand === 'rh'
    ? { top: 150, bottom: 520, low, high: high === low ? low + 1 : high }
    : { top: 690, bottom: 870, low, high: high === low ? low + 1 : high }
}

export function PracticeSheet({ practice, onClose }: { practice: PracticeSection; onClose: () => void }) {
  const [bpm, setBpm] = useState(() => Math.min(MAX_BPM, Math.max(MIN_BPM, practice.bpm)))
  const [hands, setHands] = useState<HandFilter>('both')
  const [metronome, setMetronome] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  const loopBeats = Math.max(1, practice.loopBeats)
  const { running, beatPosition, pass, start, stop } = usePracticeLoop({
    bpm,
    hands,
    metronome,
    notes: practice.notes,
    loopBeats,
  })

  const rhLane = laneFor(practice, 'rh')
  const lhLane = laneFor(practice, 'lh')
  const laneY = (midi: number, hand: Hand) => {
    const lane = hand === 'rh' ? rhLane : lhLane
    return lane.bottom - ((midi - lane.low) / (lane.high - lane.low)) * (lane.bottom - lane.top)
  }

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counting = running && beatPosition < 0
  const loopPos = beatPosition < 0 ? 0 : beatPosition % loopBeats
  const currentBeat = running && !counting ? Math.floor(loopPos) : -1
  const countIn = counting ? Math.ceil(-beatPosition) : null
  const adjust = (delta: number) => setBpm((value) => Math.min(MAX_BPM, Math.max(MIN_BPM, value + delta)))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-title"
      className="practice-sheet animate-in fade-in-0 slide-in-from-bottom-6 fixed inset-x-0 top-0 z-50 mx-auto flex h-dvh max-w-[390px] flex-col bg-background text-foreground duration-300"
    >
      <div className="practice-topbar flex h-13 items-center justify-between px-4 pt-3">
        <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">
          Focused practice
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="-mr-2 grid size-10 place-items-center text-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close practice</span>
        </button>
      </div>

      <div className="practice-heading px-4">
        <h2 id="practice-title" className="practice-title text-[34px] leading-none font-semibold tracking-[-0.03em]">
          {practice.title}
        </h2>
        <p className="practice-description mt-2.5 text-[14px] leading-snug text-foreground/60 text-pretty">
          {practice.description}
        </p>
      </div>

      <div className="practice-notation relative mx-4 mt-6 min-h-0 flex-1">
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          {Array.from({ length: loopBeats + 1 }, (_, index) => (
            <line
              key={index}
              x1={(index / loopBeats) * 1000}
              x2={(index / loopBeats) * 1000}
              y1={0}
              y2={1000}
              vectorEffect="non-scaling-stroke"
              className={index % 4 === 0 ? 'stroke-foreground/20' : 'stroke-foreground/[0.06]'}
            />
          ))}
          <line x1={0} x2={1000} y1={580} y2={580} vectorEffect="non-scaling-stroke" className="stroke-foreground/[0.07]" />
          {practice.notes.map((note) => {
            const x = (note.loopBeat / loopBeats) * 1000 + 6
            const y = laneY(note.midi, note.hand)
            const half = 30 + note.velocity * 40
            const muted = hands !== 'both' && note.hand !== hands
            const played = running && !counting && note.loopBeat <= loopPos
            const sounding = played && loopPos < note.loopBeat + note.beats * 0.9
            return (
              <line
                key={note.id}
                x1={x}
                x2={x}
                y1={y - half}
                y2={y + half}
                vectorEffect="non-scaling-stroke"
                strokeWidth={sounding ? 3.5 : 2}
                className={note.flagged ? 'stroke-signal' : 'stroke-foreground'}
                strokeOpacity={muted ? 0.1 : sounding ? 1 : played ? 0.8 : note.flagged ? 0.9 : 0.4}
              />
            )
          })}
        </svg>
        {!practice.notes.length && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="max-w-[220px] text-center text-[13px] text-foreground/45">
              No notes landed in this passage. Pick another moment from the timeline.
            </p>
          </div>
        )}
        <span className="pointer-events-none absolute top-0 left-1.5 font-mono text-[10px] text-foreground/50">
          {practice.startLabel}
        </span>
        <span className="pointer-events-none absolute top-0 right-1.5 font-mono text-[10px] text-foreground/50">
          {practice.endLabel}
        </span>
        {running && !counting && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${(loopPos / loopBeats) * 100}%` }}
          />
        )}
        {countIn !== null && (
          <div className="absolute inset-0 grid place-items-center">
            <span key={countIn} className="animate-in fade-in-0 zoom-in-95 font-mono text-[64px] font-light tabular-nums">
              {countIn}
            </span>
          </div>
        )}
      </div>

      <div
        className="practice-beats mx-4 mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${loopBeats}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {Array.from({ length: loopBeats }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-0.5 transition-colors duration-75',
              index === currentBeat
                ? index % 4 === 0
                  ? 'bg-signal'
                  : 'bg-foreground'
                : 'bg-foreground/15',
            )}
          />
        ))}
      </div>
      <p className="practice-status mx-4 mt-2 font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase tabular-nums" aria-live="polite">
        {running ? (counting ? 'Count-in' : `Pass ${pass}`) : 'Ready · 1 bar count-in'}
      </p>

      <div className="practice-tempo mt-5 flex items-end justify-between px-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">Tempo</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="practice-bpm text-[56px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{bpm}</span>
            <span className="font-mono text-[11px] text-foreground/50">BPM</span>
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-foreground/40 tabular-nums">
            Your take ~{practice.averageBpm ?? bpm} BPM
          </p>
        </div>
        <div className="flex items-center gap-1 pb-6">
          <button
            type="button"
            onClick={() => adjust(-4)}
            disabled={bpm <= MIN_BPM}
            className="grid size-11 place-items-center rounded-full border border-foreground/20 transition-colors hover:border-foreground/60 disabled:opacity-30 focus-visible:border-foreground focus-visible:outline-none"
          >
            <Minus className="size-4" aria-hidden />
            <span className="sr-only">Slower</span>
          </button>
          <button
            type="button"
            onClick={() => adjust(4)}
            disabled={bpm >= MAX_BPM}
            className="grid size-11 place-items-center rounded-full border border-foreground/20 transition-colors hover:border-foreground/60 disabled:opacity-30 focus-visible:border-foreground focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden />
            <span className="sr-only">Faster</span>
          </button>
        </div>
      </div>

      <div className="practice-options mt-4 flex items-center justify-between border-t border-foreground/10 px-4 pt-1">
        <div role="radiogroup" aria-label="Hands" className="flex gap-5">
          {HANDS.map((hand) => (
            <button
              key={hand.id}
              type="button"
              role="radio"
              aria-checked={hands === hand.id}
              onClick={() => setHands(hand.id)}
              className={cn(
                'h-11 border-t text-[13px] transition-colors focus-visible:outline-none focus-visible:text-foreground',
                hands === hand.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-foreground/45 hover:text-foreground/80',
              )}
            >
              {hand.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={metronome}
          onClick={() => setMetronome((value) => !value)}
          className={cn(
            'h-11 text-[13px] transition-colors focus-visible:outline-none focus-visible:underline',
            metronome ? 'text-foreground' : 'text-foreground/45',
          )}
        >
          Click {metronome ? 'on' : 'off'}
        </button>
      </div>

      <div className="practice-action px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          onClick={running ? stop : start}
          variant={running ? 'outline' : 'default'}
          className={cn(
            'practice-start h-12 w-full rounded-full text-[15px] font-medium',
            running && 'border-foreground/30 bg-transparent dark:bg-transparent',
          )}
          disabled={!practice.notes.length}
        >
          {running ? 'Stop loop' : 'Start loop'}
        </Button>
      </div>
    </div>
  )
}

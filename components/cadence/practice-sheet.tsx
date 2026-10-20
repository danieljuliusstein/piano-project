'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePracticeLoop, type HandFilter } from '@/hooks/use-practice-loop'
import { LOOP_BEATS, PRACTICE_NOTES, TAKE } from '@/lib/performance'
import { cn } from '@/lib/utils'

const HANDS: { id: HandFilter; label: string }[] = [
  { id: 'both', label: 'Both hands' },
  { id: 'rh', label: 'Right' },
  { id: 'lh', label: 'Left' },
]

const MIN_BPM = 40
const MAX_BPM = 132

const laneY = (midi: number, hand: 'rh' | 'lh') =>
  hand === 'rh' ? 470 - ((midi - 55) / 12) * 360 : 930 - ((midi - 43) / 12) * 260

export function PracticeSheet({ onClose }: { onClose: () => void }) {
  const [bpm, setBpm] = useState(72)
  const [hands, setHands] = useState<HandFilter>('both')
  const [metronome, setMetronome] = useState(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { running, beatPosition, pass, start, stop } = usePracticeLoop({ bpm, hands, metronome })

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counting = running && beatPosition < 0
  const loopPos = beatPosition < 0 ? 0 : beatPosition % LOOP_BEATS
  const currentBeat = running && !counting ? Math.floor(loopPos) : -1
  const countIn = counting ? Math.ceil(-beatPosition) : null
  const adjust = (delta: number) => setBpm((b) => Math.min(MAX_BPM, Math.max(MIN_BPM, b + delta)))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-title"
      className="animate-in fade-in-0 slide-in-from-bottom-6 fixed inset-x-0 top-0 z-50 mx-auto flex h-dvh max-w-[390px] flex-col bg-background duration-300"
    >
      <div className="flex h-13 items-center justify-between px-4 pt-3">
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

      <div className="px-4">
        <h2 id="practice-title" className="text-[34px] leading-none font-semibold tracking-[-0.03em]">
          Bars 5–6
        </h2>
        <p className="mt-2.5 text-[14px] leading-snug text-foreground/60 text-pretty">
          Place the E4 squarely on beat one. Let the left hand hold the pulse.
        </p>
      </div>

      <div className="relative mx-4 mt-6 min-h-0 flex-1">
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          {Array.from({ length: LOOP_BEATS + 1 }, (_, i) => (
            <line
              key={i}
              x1={(i / LOOP_BEATS) * 1000}
              x2={(i / LOOP_BEATS) * 1000}
              y1={0}
              y2={1000}
              vectorEffect="non-scaling-stroke"
              className={i % 4 === 0 ? 'stroke-foreground/20' : 'stroke-foreground/[0.06]'}
            />
          ))}
          <line x1={0} x2={1000} y1={580} y2={580} vectorEffect="non-scaling-stroke" className="stroke-foreground/[0.07]" />
          {PRACTICE_NOTES.map((n) => {
            const x = (n.loopBeat / LOOP_BEATS) * 1000 + 6
            const y = laneY(n.midi, n.hand)
            const half = 30 + n.velocity * 40
            const muted = hands !== 'both' && n.hand !== hands
            const played = running && !counting && n.loopBeat <= loopPos
            const sounding = played && loopPos < n.loopBeat + n.beats * 0.9
            const target = n.flagged && n.hand === 'rh'
            return (
              <line
                key={n.id}
                x1={x}
                x2={x}
                y1={y - half}
                y2={y + half}
                vectorEffect="non-scaling-stroke"
                strokeWidth={sounding ? 3.5 : 2}
                className={target ? 'stroke-signal' : 'stroke-foreground'}
                strokeOpacity={muted ? 0.1 : sounding ? 1 : played ? 0.8 : target ? 0.9 : 0.4}
              />
            )
          })}
        </svg>
        <span className="pointer-events-none absolute top-0 left-1.5 font-mono text-[10px] text-foreground/50">5</span>
        <span className="pointer-events-none absolute top-0 left-[calc(50%+6px)] font-mono text-[10px] text-foreground/50">
          6
        </span>
        {running && !counting && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${(loopPos / LOOP_BEATS) * 100}%` }}
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

      <div className="mx-4 mt-3 grid grid-cols-8 gap-1" aria-hidden>
        {Array.from({ length: LOOP_BEATS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-0.5 transition-colors duration-75',
              i === currentBeat ? (i % 4 === 0 ? 'bg-signal' : 'bg-foreground') : 'bg-foreground/15',
            )}
          />
        ))}
      </div>
      <p className="mx-4 mt-2 font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase tabular-nums" aria-live="polite">
        {running ? (counting ? 'Count-in' : `Pass ${pass}`) : 'Ready · 1 bar count-in'}
      </p>

      <div className="mt-5 flex items-end justify-between px-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">Tempo</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[56px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{bpm}</span>
            <span className="font-mono text-[11px] text-foreground/50">BPM</span>
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-foreground/40 tabular-nums">Your take ~{TAKE.bpm}</p>
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

      <div className="mt-4 flex items-center justify-between border-t border-foreground/10 px-4 pt-1">
        <div role="radiogroup" aria-label="Hands" className="flex gap-5">
          {HANDS.map((h) => (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={hands === h.id}
              onClick={() => setHands(h.id)}
              className={cn(
                'h-11 border-t text-[13px] transition-colors focus-visible:outline-none focus-visible:text-foreground',
                hands === h.id ? 'border-foreground text-foreground' : 'border-transparent text-foreground/45 hover:text-foreground/80',
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={metronome}
          onClick={() => setMetronome((m) => !m)}
          className={cn(
            'h-11 text-[13px] transition-colors focus-visible:outline-none focus-visible:underline',
            metronome ? 'text-foreground' : 'text-foreground/45',
          )}
        >
          Click {metronome ? 'on' : 'off'}
        </button>
      </div>

      <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          onClick={running ? stop : start}
          variant={running ? 'outline' : 'default'}
          className={cn(
            'h-12 w-full rounded-full text-[15px] font-medium',
            running && 'border-foreground/30 bg-transparent dark:bg-transparent',
          )}
        >
          {running ? 'Stop loop' : 'Start loop'}
        </Button>
      </div>
    </div>
  )
}

'use client'

import { Pause, Play, Repeat, X } from 'lucide-react'
import { DURATION, formatTime, positionAt } from '@/lib/performance'
import type { LoopRange } from '@/hooks/use-playback'

type TransportProps = {
  time: number
  playing: boolean
  loop: LoopRange | null
  zoomed: boolean
  onToggle: () => void
  onClearLoop: () => void
  onFullTake: () => void
}

export function Transport({ time, playing, loop, zoomed, onToggle, onClearLoop, onFullTake }: TransportProps) {
  const { bar, beat } = positionAt(time)

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {playing ? (
          <Pause className="size-4.5 fill-current" aria-hidden />
        ) : (
          <Play className="ml-0.5 size-4.5 fill-current" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[20px] leading-none tracking-tight tabular-nums">
          {formatTime(time, true)}
          <span className="text-foreground/30"> / {formatTime(DURATION)}</span>
        </p>
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase tabular-nums" aria-live="off">
          Bar {bar} · Beat {beat}
        </p>
      </div>

      {loop ? (
        <button
          type="button"
          onClick={onClearLoop}
          className="flex h-9 items-center gap-1.5 border-b border-foreground/40 text-[12px] font-medium transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-none"
        >
          <Repeat className="size-3.5" aria-hidden />
          Looping 5–6
          <X className="size-3 text-foreground/50" aria-hidden />
          <span className="sr-only">, stop looping</span>
        </button>
      ) : zoomed ? (
        <button
          type="button"
          onClick={onFullTake}
          className="h-9 border-b border-foreground/40 text-[12px] font-medium transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-none"
        >
          Full take
        </button>
      ) : null}
    </div>
  )
}

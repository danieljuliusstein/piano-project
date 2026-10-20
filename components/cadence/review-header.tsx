import { ChevronLeft } from 'lucide-react'
import { DURATION, TAKE, formatTime } from '@/lib/performance'

export function ReviewHeader() {
  return (
    <header className="px-4 pt-3">
      <div className="flex h-10 items-center justify-between">
        <button
          type="button"
          className="-ml-2 flex h-10 items-center gap-0.5 pr-2 text-[13px] text-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Takes
        </button>
        <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">
          {TAKE.take} · Review
        </span>
      </div>
      <h1 className="mt-3 text-[34px] leading-none font-semibold tracking-[-0.03em]">{TAKE.title}</h1>
      <p className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-foreground/45 tabular-nums">
        <time dateTime="2026-03-10">{TAKE.recordedAt}</time>
        <span aria-hidden className="size-0.5 bg-foreground/40" />
        <span>{formatTime(DURATION)}</span>
        <span aria-hidden className="size-0.5 bg-foreground/40" />
        <span>~{TAKE.bpm} BPM</span>
      </p>
      <p className="mt-4 text-[14px] leading-snug text-foreground/70 text-pretty">
        A steady take. Two moments in <span className="text-foreground">bars 5–6</span> are worth tightening.
      </p>
    </header>
  )
}

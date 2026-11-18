import { ChevronLeft } from 'lucide-react'
import { formatTime } from '@/lib/performance'

type ReviewHeaderProps = {
  title: string
  fileName: string
  recordedAt: string
  duration: number
  bpm: number
  summary: string
  takeLabel: string
  onBack: () => void
}

export function ReviewHeader({
  title,
  fileName,
  recordedAt,
  duration,
  bpm,
  summary,
  takeLabel,
  onBack,
}: ReviewHeaderProps) {
  return (
    <header className="review-header px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="review-topbar flex h-10 items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="review-back -ml-2 flex h-10 items-center gap-0.5 pr-2 text-[13px] text-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </button>
        <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">
          {takeLabel} · Review
        </span>
      </div>
      <h1 className="review-title mt-3 text-[34px] leading-none font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="review-meta mt-2.5 flex items-center gap-2 font-mono text-[11px] text-foreground/45 tabular-nums">
        <time>{recordedAt}</time>
        <span aria-hidden className="size-0.5 bg-foreground/40" />
        <span>{formatTime(duration)}</span>
        <span aria-hidden className="size-0.5 bg-foreground/40" />
        <span>~{bpm} BPM</span>
      </p>
      <p className="review-file mt-1 truncate font-mono text-[10px] text-foreground/35">{fileName}</p>
      <p className="review-summary mt-4 text-[14px] leading-snug text-foreground/70 text-pretty">{summary}</p>
    </header>
  )
}

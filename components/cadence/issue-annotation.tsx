'use client'

import { Play, Repeat, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Issue } from '@/lib/performance'
import { cn } from '@/lib/utils'

type IssueAnnotationProps = {
  issue: Issue
  style: CSSProperties
  caret: 'left' | 'bottom'
  caretOffset: number
  onPlayMoment: () => void
  onLoop: () => void
  onClose: () => void
}

export function IssueAnnotation({
  issue,
  style,
  caret,
  caretOffset,
  onPlayMoment,
  onLoop,
  onClose,
}: IssueAnnotationProps) {
  return (
    <div
      role="dialog"
      aria-labelledby={`${issue.id}-title`}
      onPointerDown={(e) => e.stopPropagation()}
      className="animate-in fade-in-0 zoom-in-[0.98] absolute z-30 w-64 border border-foreground/15 bg-ink-raised duration-200"
      style={style}
    >
      <span
        aria-hidden
        className={cn(
          'absolute bg-signal',
          caret === 'left' ? '-left-px h-6 w-0.5' : '-bottom-px h-0.5 w-6',
        )}
        style={caret === 'left' ? { top: caretOffset } : { left: caretOffset }}
      />
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <p className="font-mono text-[10px] tracking-[0.14em] text-signal uppercase">{issue.eyebrow}</p>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-2 grid size-7 place-items-center text-foreground/50 transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground/40 focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">Close annotation</span>
        </button>
      </div>
      <h3 id={`${issue.id}-title`} className="px-4 pt-1 text-[17px] leading-tight font-medium tracking-tight text-balance">
        {issue.title}
      </h3>
      <p className="px-4 pt-1.5 text-[13px] leading-snug text-foreground/60 text-pretty">{issue.detail}</p>
      <div className="mt-3 grid grid-cols-2 border-t border-foreground/10">
        <button
          type="button"
          onClick={onPlayMoment}
          className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap px-3 text-[13px] font-medium transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none"
        >
          <Play className="size-3.5 fill-current" aria-hidden />
          Play
        </button>
        <button
          type="button"
          onClick={onLoop}
          className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap border-l border-foreground/10 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none"
        >
          <Repeat className="size-3.5" aria-hidden />
          Loop 5–6
        </button>
      </div>
    </div>
  )
}

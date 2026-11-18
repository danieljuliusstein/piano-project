import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Recommendation({
  title,
  detail,
  onStart,
}: {
  title: string
  detail?: string
  onStart: () => void
}) {
  return (
    <footer className="review-recommendation border-t border-foreground/10 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <p className="font-mono text-[10px] tracking-[0.14em] text-foreground/40 uppercase">Next session</p>
      <p className="review-rec-title mt-1.5 text-[22px] leading-tight font-medium tracking-[-0.02em]">{title}</p>
      {detail && <p className="mt-1.5 text-[12px] leading-snug text-foreground/45 text-pretty">{detail}</p>}
      <Button
        onClick={onStart}
        className="review-cta mt-4 h-12 w-full justify-between rounded-full px-5 text-[15px] font-medium"
      >
        Start focused practice
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </footer>
  )
}

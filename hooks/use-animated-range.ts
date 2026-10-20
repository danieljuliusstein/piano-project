'use client'

import { useEffect, useRef, useState } from 'react'

const ease = (t: number) => 1 - (1 - t) ** 4

export function useAnimatedRange(target: [number, number], duration = 520) {
  const [range, setRange] = useState(target)
  const current = useRef(target)
  const [targetStart, targetEnd] = target

  useEffect(() => {
    const from = current.current
    if (from[0] === targetStart && from[1] === targetEnd) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const began = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - began) / duration)
      const k = ease(p)
      const next: [number, number] = [
        from[0] + (targetStart - from[0]) * k,
        from[1] + (targetEnd - from[1]) * k,
      ]
      current.current = next
      setRange(next)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [targetStart, targetEnd, duration])

  return range
}

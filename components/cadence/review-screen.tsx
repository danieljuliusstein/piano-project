'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnimatedRange } from '@/hooks/use-animated-range'
import { usePlayback } from '@/hooks/use-playback'
import { FOCUS_RANGE, FOCUS_VIEW, FULL_VIEW, type Issue, type IssueId } from '@/lib/performance'
import { PerformanceTimeline } from './performance-timeline'
import { PracticeSheet } from './practice-sheet'
import { Recommendation } from './recommendation'
import { ReviewHeader } from './review-header'
import { Transport } from './transport'

export function ReviewScreen() {
  const playback = usePlayback()
  const [selected, setSelected] = useState<IssueId | null>(null)
  const [focused, setFocused] = useState(false)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const resumeAfterScrub = useRef(false)

  const zoomed = focused || selected !== null || playback.loop !== null
  const view = useAnimatedRange(zoomed ? FOCUS_VIEW : FULL_VIEW)

  const { pause, seek, playMoment, startLoop, clearLoop, toggle } = playback

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const handleSelect = useCallback((id: IssueId | null) => {
    setSelected(id)
    if (id) setFocused(true)
  }, [])

  const handlePlayMoment = useCallback(
    (issue: Issue) => {
      if (issue.id === 'rh-late') playMoment(issue.range[0] - 1, issue.range[1] + 1.4)
      else playMoment(FOCUS_RANGE[0] - 0.3, FOCUS_RANGE[1] + 0.2)
    },
    [playMoment],
  )

  const handleLoop = useCallback(() => {
    setSelected(null)
    startLoop({ start: FOCUS_RANGE[0] - 0.15, end: FOCUS_RANGE[1] - 0.05 })
  }, [startLoop])

  const openPractice = useCallback(() => {
    pause()
    setSelected(null)
    setPracticeOpen(true)
  }, [pause])

  const closePractice = useCallback(() => setPracticeOpen(false), [])

  return (
    <main className="mx-auto flex h-dvh max-h-[1000px] min-h-[700px] w-full max-w-[390px] flex-col overflow-hidden">
      <ReviewHeader />
      <div className="mt-5 flex min-h-0 flex-1 flex-col px-4">
        <PerformanceTimeline
          time={playback.time}
          view={view}
          loop={playback.loop}
          selected={selected}
          onSelect={handleSelect}
          onScrubStart={() => {
            resumeAfterScrub.current = playback.playing
            pause()
          }}
          onScrub={(t) => seek(t, false)}
          onScrubEnd={(t) => seek(t, resumeAfterScrub.current)}
          onPlayMoment={handlePlayMoment}
          onLoop={handleLoop}
        />
      </div>
      <Transport
        time={playback.time}
        playing={playback.playing}
        loop={playback.loop}
        zoomed={zoomed}
        onToggle={toggle}
        onClearLoop={() => {
          clearLoop()
          setFocused(false)
        }}
        onFullTake={() => {
          setSelected(null)
          setFocused(false)
        }}
      />
      <Recommendation onStart={openPractice} />
      {practiceOpen && <PracticeSheet onClose={closePractice} />}
    </main>
  )
}

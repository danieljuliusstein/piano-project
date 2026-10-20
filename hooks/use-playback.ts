'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DURATION, NOTES } from '@/lib/performance'
import { getAudio, playPianoNote, type Voice } from '@/lib/piano-audio'

export type LoopRange = { start: number; end: number }

type PlayOptions = { until?: number; loop?: LoopRange | null }

const PRE_ROLL = 0.04

export function usePlayback() {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoopState] = useState<LoopRange | null>(null)

  const timeRef = useRef(0)
  const voices = useRef<Voice[]>([])
  const frame = useRef<number | null>(null)
  const anchor = useRef({ ctx: 0, pos: 0 })
  const options = useRef<PlayOptions>({})
  const playRef = useRef<(from: number, opts?: PlayOptions) => void>(() => {})

  const updateTime = useCallback((t: number) => {
    timeRef.current = t
    setTime(t)
  }, [])

  const silence = useCallback(() => {
    voices.current.forEach((v) => v.stop())
    voices.current = []
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const pause = useCallback(() => {
    silence()
    setPlaying(false)
  }, [silence])

  const play = useCallback(
    (from: number, opts: PlayOptions = options.current) => {
      silence()
      options.current = opts
      const { ctx } = getAudio()
      const segmentStart = opts.loop ? opts.loop.start : 0
      const segmentEnd = opts.loop ? opts.loop.end : (opts.until ?? DURATION)
      let position = from
      if (position >= segmentEnd - 0.02 || position < segmentStart) position = segmentStart

      anchor.current = { ctx: ctx.currentTime + PRE_ROLL, pos: position }

      for (const note of NOTES) {
        if (note.start < position - 0.001 || note.start >= segmentEnd) continue
        const when = anchor.current.ctx + (note.start - position)
        const length = Math.min(note.duration, segmentEnd - note.start + 0.15)
        voices.current.push(playPianoNote(note.midi, when, length, note.velocity))
      }

      setPlaying(true)

      const tick = () => {
        const elapsed = Math.max(0, ctx.currentTime - anchor.current.ctx)
        const t = anchor.current.pos + elapsed
        if (t >= segmentEnd) {
          if (opts.loop) {
            updateTime(opts.loop.start)
            playRef.current(opts.loop.start, opts)
            return
          }
          updateTime(segmentEnd)
          pause()
          return
        }
        updateTime(t)
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
    },
    [pause, silence, updateTime],
  )

  useEffect(() => {
    playRef.current = play
  }, [play])

  useEffect(() => silence, [silence])

  const toggle = useCallback(() => {
    if (playing) pause()
    else play(timeRef.current, { loop })
  }, [loop, pause, play, playing])

  const seek = useCallback(
    (t: number, resume = playing) => {
      const clamped = Math.min(Math.max(t, 0), DURATION)
      updateTime(clamped)
      if (resume) play(clamped, { loop })
    },
    [loop, play, playing, updateTime],
  )

  const playMoment = useCallback(
    (start: number, end: number) => {
      updateTime(start)
      play(start, { until: end, loop: null })
    },
    [play, updateTime],
  )

  const startLoop = useCallback(
    (range: LoopRange) => {
      setLoopState(range)
      updateTime(range.start)
      play(range.start, { loop: range })
    },
    [play, updateTime],
  )

  const clearLoop = useCallback(() => {
    setLoopState(null)
    options.current = {}
    if (playing) play(timeRef.current, { loop: null })
  }, [play, playing])

  return { time, playing, loop, toggle, pause, seek, playMoment, startLoop, clearLoop }
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type LoopRange = { start: number; end: number }

type PlayOptions = { until?: number; loop?: LoopRange | null }

/**
 * Drives the uploaded recording rather than synthesizing notes. The review
 * timeline, annotations, and transport all read from this one clock.
 */
export function usePlayback(source: string | null) {
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoopState] = useState<LoopRange | null>(null)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const frame = useRef<number | null>(null)
  const options = useRef<PlayOptions>({})
  const playingRef = useRef(false)

  const updatePlaying = useCallback((value: boolean) => {
    playingRef.current = value
    setPlaying(value)
  }, [])

  const stopFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const tick = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const current = options.current
    if (current.loop && audio.currentTime >= current.loop.end) {
      audio.currentTime = current.loop.start
      setTime(current.loop.start)
    } else if (
      !current.loop &&
      current.until !== undefined &&
      audio.currentTime >= current.until
    ) {
      audio.pause()
      updatePlaying(false)
      options.current = {}
      return
    }

    setTime(audio.currentTime)

    if (audio.paused) {
      updatePlaying(false)
      return
    }
    frame.current = requestAnimationFrame(tick)
  }, [updatePlaying])

  useEffect(() => {
    if (!source) {
      audioRef.current = null
      return
    }

    const audio = new Audio(source)
    audio.preload = 'auto'
    audioRef.current = audio
    setTime(0)
    setDuration(0)
    setError(null)

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
    }
    const onError = () => setError('This recording could not be played.')
    const onEnded = () => {
      updatePlaying(false)
      stopFrame()
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('durationchange', onLoadedMetadata)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('durationchange', onLoadedMetadata)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEnded)
      audio.src = ''
      audioRef.current = null
      stopFrame()
      updatePlaying(false)
    }
  }, [source, stopFrame, updatePlaying])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (audio) audio.pause()
    stopFrame()
    updatePlaying(false)
  }, [stopFrame, updatePlaying])

  const play = useCallback(
    (from: number, nextOptions: PlayOptions = {}) => {
      const audio = audioRef.current
      if (!audio) return

      options.current = nextOptions
      const segmentStart = nextOptions.loop?.start ?? 0
      const segmentEnd =
        nextOptions.loop?.end ??
        nextOptions.until ??
        (Number.isFinite(audio.duration) ? audio.duration : 0)
      let position = from
      if (
        !Number.isFinite(position) ||
        position < segmentStart ||
        (segmentEnd > 0 && position >= segmentEnd - 0.02)
      ) {
        position = segmentStart
      }

      audio.currentTime = Math.max(0, position)
      setTime(audio.currentTime)
      setError(null)
      stopFrame()

      void audio
        .play()
        .then(() => {
          updatePlaying(true)
          frame.current = requestAnimationFrame(tick)
        })
        .catch(() => {
          updatePlaying(false)
          setError('This recording could not be played.')
        })
    },
    [stopFrame, tick, updatePlaying],
  )

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause()
      return
    }
    const audio = audioRef.current
    const atEnd =
      audio !== null && Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.02
    play(atEnd ? 0 : time, { loop })
  }, [loop, pause, play, time])

  const seek = useCallback(
    (nextTime: number, resume = playingRef.current) => {
      const audio = audioRef.current
      const maximum = duration > 0 ? duration : (audio?.duration ?? 0)
      const clamped = Math.max(0, Math.min(nextTime, maximum || nextTime))
      if (audio) audio.currentTime = clamped
      setTime(clamped)
      if (resume) play(clamped, { loop })
    },
    [duration, loop, play],
  )

  const playMoment = useCallback(
    (start: number, end: number) => {
      setLoopState(null)
      play(start, { until: end, loop: null })
    },
    [play],
  )

  const startLoop = useCallback(
    (range: LoopRange) => {
      setLoopState(range)
      play(range.start, { loop: range })
    },
    [play],
  )

  const clearLoop = useCallback(() => {
    setLoopState(null)
    options.current = { ...options.current, loop: null }
  }, [])

  return {
    time,
    duration,
    playing,
    loop,
    error,
    toggle,
    pause,
    seek,
    playMoment,
    startLoop,
    clearLoop,
  }
}

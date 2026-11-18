'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hand, PracticeNote } from '@/lib/performance'
import { getAudio, playClick, playPianoNote, type Voice } from '@/lib/piano-audio'

export type HandFilter = 'both' | Hand

type Settings = {
  bpm: number
  hands: HandFilter
  metronome: boolean
  notes: PracticeNote[]
  loopBeats: number
}

const LOOKAHEAD = 0.12
const COUNT_IN_BEATS = 4

export function usePracticeLoop(settings: Settings) {
  const [running, setRunning] = useState(false)
  const [beatPosition, setBeatPosition] = useState(-COUNT_IN_BEATS)
  const [pass, setPass] = useState(0)

  const settingsRef = useRef(settings)
  const voices = useRef<Voice[]>([])
  const timer = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const nextBeat = useRef({ index: -COUNT_IN_BEATS, time: 0 })
  const beatLog = useRef<{ index: number; time: number }[]>([])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    timer.current = null
    frame.current = null
    voices.current.forEach((voice) => voice.stop())
    voices.current = []
    beatLog.current = []
    setRunning(false)
    setBeatPosition(-COUNT_IN_BEATS)
    setPass(0)
  }, [])

  const start = useCallback(() => {
    stop()
    const { ctx } = getAudio()
    nextBeat.current = { index: -COUNT_IN_BEATS, time: ctx.currentTime + 0.1 }
    setRunning(true)

    const schedule = () => {
      const { bpm, hands, metronome, notes, loopBeats: configuredBeats } = settingsRef.current
      const loopBeats = Math.max(1, configuredBeats)
      const secondsPerBeat = 60 / bpm
      while (nextBeat.current.time < ctx.currentTime + LOOKAHEAD) {
        const { index, time } = nextBeat.current
        const loopBeat = ((index % loopBeats) + loopBeats) % loopBeats
        const counting = index < 0

        if (metronome || counting) {
          voices.current.push(playClick(time, loopBeat % 4 === 0))
        }

        if (!counting) {
          for (const note of notes) {
            if (hands !== 'both' && note.hand !== hands) continue
            if (note.loopBeat < loopBeat || note.loopBeat >= loopBeat + 1) continue
            const when = time + (note.loopBeat - loopBeat) * secondsPerBeat
            voices.current.push(
              playPianoNote(note.midi, when, note.beats * secondsPerBeat * 0.92, note.velocity),
            )
          }
        }

        beatLog.current.push({ index, time })
        if (beatLog.current.length > 32) beatLog.current.shift()
        nextBeat.current = { index: index + 1, time: time + secondsPerBeat }
      }
      if (voices.current.length > 200) voices.current = voices.current.slice(-80)
    }

    schedule()
    timer.current = window.setInterval(schedule, 25)

    const tick = () => {
      const now = ctx.currentTime
      const log = beatLog.current
      let current = log[0]
      for (const entry of log) if (entry.time <= now) current = entry
      if (current) {
        const loopBeats = Math.max(1, settingsRef.current.loopBeats)
        const secondsPerBeat = 60 / settingsRef.current.bpm
        const progressed =
          current.index + Math.min(1, Math.max(0, (now - current.time) / secondsPerBeat))
        setBeatPosition(now < current.time ? current.index : progressed)
        setPass(progressed < 0 ? 0 : Math.floor(progressed / loopBeats) + 1)
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [stop])

  useEffect(() => stop, [stop])

  return { running, beatPosition, pass, start, stop }
}

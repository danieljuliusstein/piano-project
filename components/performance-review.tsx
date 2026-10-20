'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, ChevronLeft, ChevronRight, Headphones, Pause, Play, Repeat2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PerformanceTimeline } from './performance-timeline'

const melody = [64,64,65,67,67,65,64,62,60,60,62,64,64,62,62,64,64,65,67,67,65,64,62,60,60,62,64,62,60,60,62,62,64,60,62,64,65,64,60,62,64,65,64,62,60,62,55,64,64,65,67,67,65,64,62,60,60,62,64,62,60,60,60,60]
const formatTime = (time: number) => `0:${Math.floor(time).toString().padStart(2, '0')}`

export function PerformanceReview() {
  const [time, setTime] = useState(16.18)
  const [playing, setPlaying] = useState(false)
  const [issue, setIssue] = useState<0 | 1 | null>(0)
  const [practice, setPractice] = useState(false)
  const [library, setLibrary] = useState(false)
  const [speed, setSpeed] = useState(1)
  const audio = useRef<AudioContext | null>(null)
  const lastNote = useRef(-1)
  const momentEnd = useRef<number | null>(null)

  function enableAudio() {
    audio.current ??= new AudioContext()
    void audio.current.resume()
  }

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    const interval = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - previous) / 1000
      previous = now
      setTime(current => {
        const next = current + delta * (practice ? 0.6 : speed)
        if (momentEnd.current !== null && next >= momentEnd.current) {
          momentEnd.current = null
          setPlaying(false)
          return next
        }
        if (practice && next >= 24) return 16
        if (next >= 32) { setPlaying(false); return 32 }
        return next
      })
    }, 40)
    return () => window.clearInterval(interval)
  }, [playing, practice, speed])

  useEffect(() => {
    if (!playing || !audio.current) { lastNote.current = -1; return }
    const note = Math.min(63, Math.floor(time * 2))
    if (lastNote.current === note) return
    lastNote.current = note
    const context = audio.current
    const gain = context.createGain()
    const oscillator = context.createOscillator()
    oscillator.type = 'triangle'
    oscillator.frequency.value = 440 * 2 ** ((melody[note] - 69) / 12)
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.65)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }, [time, playing])

  useEffect(() => () => { void audio.current?.close() }, [])

  function startPractice() {
    enableAudio(); momentEnd.current = null; setTime(16); setPractice(true); setIssue(null); setPlaying(true)
  }
  function togglePlayback() {
    enableAudio(); momentEnd.current = null
    if (time >= 32) setTime(practice ? 16 : 0)
    setPlaying(value => !value)
  }

  return <main className="cadence-app">
    <header className="topbar">
      <button className="back-button" aria-label={practice ? 'Exit focused practice' : library ? 'Back to review' : 'Back to recordings'} onClick={() => { setPlaying(false); practice ? setPractice(false) : setLibrary(!library) }}><ArrowLeft size={19} /></button>
      <span className="wordmark">cadence<span className="brand-dot">.</span></span>
      <AudioLines size={19} strokeWidth={1.4} className="brand-wave" />
    </header>
    {library ? <section className="recordings"><span className="eyebrow">YOUR PIANO, OVER TIME</span><h1>Recordings</h1><button className="recording-link" onClick={() => setLibrary(false)}><span>Ode to Joy<small>Today, 10:42 AM · 32 seconds</small></span><ArrowRight size={20}/></button></section> : <>
      <section className="piece-heading">
        <div className="eyebrow">{practice ? 'FOCUSED PRACTICE' : 'YOUR PERFORMANCE'}<span className="take-number">{practice ? 'LOOP 01' : 'TAKE 01'}</span></div>
        <h1>Ode to Joy<span className="title-dot">.</span></h1>
        <p className="composer">Ludwig van Beethoven</p>
        <div className="recording-meta"><span>{practice ? 'Bars 5–6' : 'Today, 10:42 AM'}</span><span className="meta-dot">·</span><span>{practice ? '72 BPM' : '32 seconds'}</span><span className="recording-indicator" /> </div>
      </section>
      <section className="performance" aria-label="Performance playback">
        <div className="timeline-heading"><span>{practice ? 'A LITTLE SLOWER. A LITTLE STEADIER.' : 'LISTEN CLOSELY'}</span><span className="moment-count"><i />{practice ? 'Looping bars 5–6' : '2 moments to explore'}</span></div>
        <PerformanceTimeline time={time} issue={issue} practice={practice} onSeek={value => { momentEnd.current = null; setTime(practice ? Math.max(16, Math.min(23.99, value)) : value) }} onIssue={value => { setIssue(issue === value ? null : value); setTime(value === 0 ? 16.18 : 20.4) }} />
        <div className="annotation-space">
          {issue !== null && !practice ? <div className={`annotation annotation-${issue}`}>
            <div className="annotation-top"><span className="annotation-label">{issue === 0 ? 'BAR 5 · RIGHT HAND' : 'BARS 5–6 · LEFT HAND'}</span><button aria-label="Close annotation" onClick={() => setIssue(null)}><X size={14}/></button></div>
            <p>{issue === 0 ? <>An E4 arrived <span>180 ms late.</span></> : <>A little uneven <span>between beats.</span></>}</p>
            <div className="annotation-actions"><button onClick={() => { enableAudio(); setTime(issue === 0 ? 15.5 : 19.5); momentEnd.current = issue === 0 ? 18 : 24; setPlaying(true) }}><Play size={11} fill="currentColor"/>Play moment</button><button onClick={startPractice}><Repeat2 size={13}/>Loop bars 5–6</button></div>
          </div> : <div className="timeline-hint">{practice ? <><Repeat2 size={15}/><span>Room to find your rhythm.<br/>Listen, then play along.</span></> : <><span className="hint-dot"/><span>Tap a coral mark to hear the detail.</span></>}</div>}
        </div>
        <div className="transport">
          <span className="elapsed">{formatTime(time)}<span> / 0:32</span></span>
          <div className="transport-buttons"><button aria-label="Rewind 5 seconds" onClick={() => setTime(Math.max(practice ? 16 : 0, time - 5))}><RotateCcw size={19}/></button><button className="play-button" aria-label={playing ? 'Pause playback' : 'Play recording'} onClick={togglePlayback}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor" className="play-icon"/>}</button><button aria-label="Forward 5 seconds" onClick={() => setTime(Math.min(practice ? 23.99 : 32, time + 5))}><RotateCcw size={19} className="forward-icon"/></button></div>
          <button className="speed-button" aria-label={practice ? 'Practice speed 72 BPM' : `Playback speed ${speed} times`} disabled={practice} onClick={() => setSpeed(speed === 1 ? 0.75 : speed === 0.75 ? 0.5 : 1)}>{practice ? '72' : `${speed}×`}</button>
        </div>
        <div className="listening-note"><Headphones size={12}/><span>Synthesized piano preview</span></div>
      </section>
      <footer className="practice-footer">
        <div className="recommendation-eyebrow"><span className="little-line"/>{practice ? 'ONE PHRASE. YOUR FULL ATTENTION.' : 'YOUR NEXT SMALL STEP'}</div>
        <h2>{practice ? 'Find the space between notes.' : <>Work bars 5–6 at <span>72 BPM.</span></>}</h2>
        <p>{practice ? 'Keep the left hand steady. Let the melody follow.' : 'Slow it down. Let both hands find each other.'}</p>
        <Button className="practice-cta" onClick={practice ? () => { setPractice(false); setPlaying(false); setTime(16.18); setIssue(0) } : startPractice}>{practice ? 'Back to your performance' : 'Start focused practice'}{practice ? <ChevronLeft data-icon="inline-end"/> : <ArrowRight data-icon="inline-end"/>}</Button>
        <div className="footer-caption">{practice ? 'Listen. Repeat. Make it yours.' : 'Progress is in the listening.'}</div>
      </footer>
    </>}
  </main>
}

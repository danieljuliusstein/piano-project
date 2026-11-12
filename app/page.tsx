'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Info,
  Music2,
  Upload,
} from 'lucide-react'
import { playPianoNote } from '../lib/piano-audio'
import { analyzeTiming, type AnalysisResult } from '@/lib/timing'
import sampleJson from '@/lib/fixtures/fur-elise-both-hands.sample.json'
import { TempoChart } from '@/components/tempo-chart'
import { RhythmChart } from '@/components/rhythm-chart'
import { UploadScreen } from '@/components/cadence/upload-screen'

const sample = sampleJson as AnalysisResult
type Evaluation = AnalysisResult & {
  reference_bpm: number
  pitch: {
    score: number
    precision: number
    recall: number
    f1: number
    correct: number
    expected: number
    missing: number
    wrong: number
    insertions: number
  }
}

type Screen = 'new' | 'upload' | 'feedback' | 'progress'
type Song = 'elise' | 'joy'

const songs = {
  elise: {
    title: 'Für Elise',
    artist: 'Ludwig van Beethoven',
    level: 'Intermediate',
    detail: 'Opening section · 16 bars · 72 BPM',
  },
  joy: {
    title: 'Ode to Joy',
    artist: 'Ludwig van Beethoven',
    level: 'Beginner',
    detail: 'Main theme · 16 bars · 90 BPM',
  },
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>('new')
  const [song, setSong] = useState<Song>('elise')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState(false)

  const selectedSong = songs[song]
  const fileName = audioFile?.name ?? 'für-elise-practice.wav'

  const evaluate = async () => {
    if (!audioFile) {
      setEvaluationError('Choose an audio file before evaluating.')
      return
    }
    setEvaluating(true)
    setEvaluationError(null)
    try {
      const body = new FormData()
      body.append('file', audioFile)
      body.append('model', song === 'elise' ? 'fur_elise_with_harmony' : 'ode_to_joy_with_harmony')
      const response = await fetch('/api/evaluate', { method: 'POST', body })
      const payload = await response.json() as Evaluation | { error?: string }
      if (!response.ok || !('pitch' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Evaluation failed.')
      }
      setEvaluation(payload)
      setScreen('feedback')
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : 'Evaluation failed.')
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setScreen('new')} aria-label="Piano Review home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>Piano Review</span>
        </button>
        <nav className="top-nav">
          <button className={screen === 'new' || screen === 'upload' ? 'active' : ''} onClick={() => setScreen('new')}>New evaluation</button>
          <button className={screen === 'progress' ? 'active' : ''} onClick={() => setScreen('progress')}>My progress</button>
          <button onClick={() => setScreen('feedback')}>How it works</button>
          <span className="wireframe">WIREFRAME</span>
        </nav>
      </header>

      {screen !== 'progress' && <StepBar screen={screen} />}

      {screen === 'new' && (
        <main className="page-content">
          <Eyebrow>NEW EVALUATION</Eyebrow>
          <h1>What would you like to play?</h1>
          <p className="lede">Choose a song, then add a recording. We’ll compare your performance with the reference score.</p>

          <section className="form-section">
            <h2>1. Choose your song</h2>
            <div className="song-grid">
              {(Object.keys(songs) as Song[]).map((id) => (
                <button key={id} className={`song-card ${song === id ? 'selected' : ''}`} onClick={() => setSong(id)}>
                  <span className="song-icon"><Music2 size={22} /></span>
                  <span className="song-info"><strong>{songs[id].title}</strong><small>{songs[id].artist}</small></span>
                  <span className="radio">{song === id && <span />}</span>
                  <span className={`tag ${id === 'elise' ? 'orange' : ''}`}>{songs[id].level}</span>
                  <small className="song-detail">{songs[id].detail}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="form-section">
            <h2>2. Upload your performance</h2>
            <div className="upload-prompt">
              <div className="prompt-heading"><Upload size={21} /><strong>Upload a recording</strong></div>
              <p>Already recorded your practice? Add an audio file from your device to get feedback.</p>
              <button className="primary" onClick={() => setScreen('upload')}>Choose an audio file</button>
              <span className="format-note">MP3, WAV or M4A</span>
            </div>
          </section>

          <div className="info-note"><Info size={19} /> Your feedback covers note accuracy on the score, tempo as a graph, and rhythm as expected-versus-played piano rolls.</div>

          <section className="form-section progress-promo">
            <h2>3. Review your progress</h2>
            <div className="upload-prompt">
              <strong>Progress Tracker</strong>
              <p>Track note accuracy, tempo, and rhythm across Für Elise and Ode to Joy, and revisit past recordings.</p>
              <button className="primary" onClick={() => setScreen('progress')}>Progress Tracker</button>
              <span className="format-note">Separate overview</span>
            </div>
          </section>
        </main>
      )}

      {screen === 'upload' && (
        <UploadScreen
          song={selectedSong}
          file={audioFile}
          onFileChange={setAudioFile}
          onBack={() => setScreen('new')}
          onEvaluate={evaluate}
          evaluating={evaluating}
          error={evaluationError}
        />
      )}
      {screen === 'feedback' && <FeedbackScreen evaluation={evaluation} file={audioFile} fileName={fileName} song={selectedSong} onNew={() => setScreen('new')} />}
      {screen === 'progress' && <ProgressScreen onBack={() => setScreen('new')} />}

      <footer><span>Concept wireframe · Recording and evaluation are illustrative only.</span><span>Your practice, at your pace.</span></footer>
    </div>
  )
}

function StepBar({ screen }: { screen: Screen }) {
  const active = screen === 'new' ? 1 : screen === 'upload' ? 2 : 3
  return <div className="step-bar">{['Choose a song', 'Add a recording', 'View feedback'].map((label, index) => {
    const number = index + 1
    return <span className="step-wrap" key={label}><span className={`step ${number <= active ? 'current' : ''}`}>{number < active ? <Check size={14} /> : number}</span><span className={number === active ? 'step-label current-label' : 'step-label'}>{label}</span>{number < 3 && <i />}</span>
  })}</div>
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div> }

const furEliseOpening = [
  { note: 'E5', midi: 76, level: 4 },
  { note: 'D♯5', midi: 75, level: 3, sharp: true },
  { note: 'E5', midi: 76, level: 4 },
  { note: 'D♯5', midi: 75, level: 3, sharp: true },
  { note: 'E5', midi: 76, level: 4 },
  { note: 'B4', midi: 71, level: 0 },
  { note: 'D5', midi: 74, level: 2 },
  { note: 'C5', midi: 72, level: 1 },
  { note: 'A4', midi: 69, level: -1 },
]

function FurEliseScale() {
  const [activeNote, setActiveNote] = useState<number | null>(null)

  const playNote = (midi: number, index: number) => {
    playPianoNote(midi, 0, 0.65, 0.86)
    setActiveNote(index)
    window.setTimeout(() => setActiveNote((current) => current === index ? null : current), 650)
  }

  return <section className="elise-scale" aria-labelledby="elise-scale-title">
    <div className="elise-scale-heading"><div><Eyebrow>HOW IT WORKS · NOTE MAP</Eyebrow><h2 id="elise-scale-title">Play the Für Elise opening</h2><p>Each note on the staff is mapped to its pitch. Click a note to hear it.</p></div><Music2 size={26} aria-hidden="true" /></div>
    <div className="music-staff" role="group" aria-label="Playable opening notes from Für Elise">
      {Array.from({ length: 5 }, (_, index) => <i className="staff-line" key={index} />)}
      <span className="treble-clef" aria-hidden="true">𝄞</span>
      {furEliseOpening.map((note, index) => <button
        key={`${note.note}-${index}`}
        className={`staff-note ${activeNote === index ? 'playing' : ''}`}
        style={{ left: `${17 + index * 9.5}%`, bottom: `${37 + note.level * 7}%` }}
        onClick={() => playNote(note.midi, index)}
        aria-label={`Play ${note.note.replace('♯', ' sharp')}`}
      >{note.sharp && <b>♯</b>}<span /><i /><small>{note.note}</small></button>)}
    </div>
    <p className="scale-help">Opening phrase: E5 · D♯5 · E5 · D♯5 · E5 · B4 · D5 · C5 · A4</p>
  </section>
}

function FeedbackScreen({ evaluation, file, fileName, song, onNew }: { evaluation: Evaluation | null; file: File | null; fileName: string; song: typeof songs.elise; onNew: () => void }) {
  const [tab, setTab] = useState<'accuracy' | 'tempo' | 'rhythm'>('accuracy')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const result = evaluation ?? {
    ...sample,
    reference_bpm: 72,
    pitch: { score: 89, precision: 0.89, recall: 0.89, f1: 0.89, correct: 57, expected: 64, missing: 3, wrong: 4, insertions: 1 },
  }
  const timing = analyzeTiming(result.events)
  useEffect(() => {
    if (!file || !audioRef.current) return
    const audio = audioRef.current
    const url = URL.createObjectURL(file)
    audio.src = url
    audio.load()
    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const toggleRecording = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setPlaying(false)
      }
    } else {
      audio.pause()
    }
  }
  const tabs = [['accuracy', 'Note accuracy'], ['tempo', 'Tempo'], ['rhythm', 'Rhythm']] as const
  const recommendations = [['Restore the 3 missed notes', 'Rehearse the highlighted gaps on the score slowly, hands separately. The dashed circles mark where expected notes were not played—focus on landing each one cleanly before increasing tempo.', 'Note accuracy'], ['Keep a steady tempo', 'Your average is 70 BPM against the 72 BPM reference, and the tempo graph shows you slow toward the end. Start practice at 60 BPM with a metronome, then build back toward 72 BPM once the notes feel secure.', 'Tempo'], ['Tighten note timing', 'Use the expected/played rhythm rolls in the Rhythm tab and count aloud while you play.', 'Rhythm']]
  return <main className="page-content feedback-page">
    <div className="feedback-heading"><div><Eyebrow>EVALUATION COMPLETE</Eyebrow><h1>Here's how you played.</h1><p className="lede">{song.title} · {song.detail.split(' · ')[0]} · {fileName}</p></div><button className="secondary" onClick={onNew}>New evaluation</button></div>
    <FurEliseScale />
    <div className="metric-grid">{[[`${result.pitch.score}%`, 'Note accuracy', `${result.pitch.correct} of ${result.pitch.expected} reference notes matched`], [`${result.pitch.missing + result.pitch.wrong + result.pitch.insertions}`, 'Note errors', `${result.pitch.wrong} wrong · ${result.pitch.missing} missing · ${result.pitch.insertions} extra`], [timing.averageBpm === null ? '–' : String(Math.round(timing.averageBpm)), 'Average tempo', 'BPM · whole recording'], [timing.rhythmScore === null ? '–' : `${Math.round(timing.rhythmScore * 100)}%`, 'Rhythm accuracy', 'Notes on time']].map(([value, title, detail]) => <div className="metric" key={title}><strong>{value}</strong><span><b>{title}</b><small>{detail}</small></span></div>)}</div>
    <section className="feedback-card">
      <div className="card-title"><div><h2>Review your performance</h2><p>{tab === 'rhythm' ? 'Compare expected note timing with your actual performance. Time moves left to right.' : tab === 'tempo' ? 'Switch tabs to see note accuracy, tempo, and rhythm detail.' : 'Switch tabs to see note accuracy, tempo, and rhythm detail.'}</p></div><div className="segmented">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div></div>
      {tab === 'tempo' && <TempoChart timing={timing} />}
      {tab === 'rhythm' && <RhythmChart events={result.events} timing={timing} />}
      {tab === 'accuracy' && <AccuracyScore />}
      <div className="feedback-player"><small>{fileName} · Playback position is shared across all views</small><span>Switching tabs keeps your position</span><div><button className="play-button" onClick={toggleRecording} disabled={!file}>{playing ? 'Ⅱ  Pause recording' : '▷  Play recording'}</button><span className="time">{formatAudioTime(currentTime)}</span><div className="player-line"><i style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} /></div><span className="time">{formatAudioTime(duration)}</span></div><audio ref={audioRef} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0) }} /></div>
    </section>
    <h2 className="work-title">Your top 3 things to work on</h2>{recommendations.map(([title, detail, tag], i) => <button className="work-item" key={title} onClick={() => setTab(tag === 'Tempo' ? 'tempo' : tag === 'Rhythm' ? 'rhythm' : 'accuracy')}><span className="rank">{i + 1}</span><div><h3>{title} <em>{tag}</em></h3><p>{detail}</p></div><ChevronRight /></button>)}<button className="record-button" onClick={onNew}>♩ &nbsp; Record another take</button>
  </main>
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00'
  const wholeSeconds = Math.floor(seconds)
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function AccuracyScore() {
  return <><div className="feedback-legend"><span>◯ Wrong note (4)</span><span>◌ Missing note (3)</span><span>× Extra note (1)</span></div><div className="score-grid accuracy-view">{Array.from({ length: 32 }, (_, i) => <span key={i} style={{ left: `${3 + i * 3}%`, bottom: `${20 + ((i * 17) % 43)}%` }} />)}</div><div className="callout"><CircleHelp size={17} /> Missing note: E. Practise the dashed gap slowly, then add the surrounding notes.<span>1 of 3 missing</span></div></>
}

function ProgressScreen({ onBack }: { onBack: () => void }) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const data = [['2 Oct', '78%', '80%', '76%'], ['7 Oct', '84%', '86%', '82%'], ['13 Oct', '88%', '90%', '86%'], ['21 Oct', '92%', '94%', '90%']]
  return <main className="page-content progress-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Progress Tracker</button><div className="progress-heading"><div><Eyebrow>SONG PROGRESS</Eyebrow><h1>Ode to Joy</h1><p className="lede">Main theme · 16 bars · Reference: 90 BPM</p></div><div className="latest"><small>Latest-play accuracy</small><strong>92%</strong><span>21 Oct 2026 · 18:00</span></div></div><p className="fine-print">Illustrative sample data · Overall accuracy = (note accuracy + rhythm accuracy) ÷ 2.</p><div className="section-heading"><h2>Progress over time</h2><span>All 4 logged plays · October 2026</span></div><div className="chart-grid">{[['Note accuracy', '94%', [80, 86, 90, 94]], ['Tempo', '88 BPM', [76, 82, 86, 88]], ['Rhythm accuracy', '90%', [76, 82, 86, 90]]].map(([title, value, points]) => <div className="chart-card" key={title}><h3>{title}<strong>{value}</strong></h3><div className="mini-chart">{(points as number[]).map((point, i) => <span key={i} style={{ left: `${12 + i * 27}%`, bottom: `${point - 50}%` }}>{point}</span>)}</div><small>October 2026 · Date played</small></div>)}</div><section className="logged"><div className="section-heading"><h2>Logged plays</h2><span>Oldest to newest · Same sessions as the graphs</span></div><div className="table-head"><span>Date & time</span><span>Method</span><span>Overall accuracy</span><span>Note accuracy</span><span>Rhythm accuracy</span></div>{data.map(([date, overall, note, rhythm]) => <div className="table-row" key={date}><span>{date} 2026 · 18:00</span><span>Upload</span><b>{overall}</b><span>{note}</span><span>{rhythm}</span></div>)}</section><h2 className="work-title">Past recordings</h2>{data.slice().reverse().map(([date, overall, note, rhythm]) => <div className="recording-row" key={date}><div><b>{date} 2026 · 18:00</b><small>Upload · 00:43</small></div><strong>{overall} overall accuracy<small>Notes {note} · Rhythm {rhythm}</small></strong><button className="primary" onClick={() => setReport(date)}>View detailed report</button><button className="secondary" onClick={() => setPlaying(playing === date ? null : date)}><Play size={15} /> {playing === date ? 'Pause recording' : 'Play recording'}</button>{report === date && <small className="report-note">Demo report selected</small>}</div>)}</main>
}

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Info,
  Music2,
  Upload,
} from 'lucide-react'
import { analyzeTiming, type AlgorithmEvent, type AnalysisResult } from '@/lib/timing'
import sampleJson from '@/lib/fixtures/fur-elise-both-hands.sample.json'
import { TempoChart } from '@/components/tempo-chart'
import { RhythmChart } from '@/components/rhythm-chart'
import { UploadScreen } from '@/components/cadence/upload-screen'
import { ProgressScreen } from '@/components/progress-screen'
import { midiNoteName } from '@/lib/performance'
import { playPianoNote } from '@/lib/piano-audio'
import { evaluateRecording, type Evaluation } from '@/lib/evaluation-client'
import { defaultScoreCatalog, scoreCatalogFromBackend, type BackendScore, type Score } from '@/lib/score-catalog'

const sample = sampleJson as AnalysisResult
type Screen = 'new' | 'upload' | 'feedback' | 'progress' | 'how'
type Song = string

export default function Page() {
  const [screen, setScreen] = useState<Screen>('new')
  const [song, setSong] = useState<Song>('ode_melody')
  const [songs, setSongs] = useState<Record<string, Score>>(defaultScoreCatalog)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState(false)

  const selectedSong = songs[song]
  const fileName = audioFile?.name ?? 'practice-recording.wav'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/scores', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { scores?: BackendScore[]; error?: string }
        if (!response.ok || !Array.isArray(payload.scores)) {
          throw new Error(payload.error ?? 'Unable to load supported scores.')
        }
        return scoreCatalogFromBackend(payload.scores)
      })
      .then((catalog) => {
        if (Object.keys(catalog).length === 0) return
        setSongs(catalog)
        setSong((current) => catalog[current] ? current : Object.keys(catalog)[0])
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Unable to load backend score catalog:', error)
      })
    return () => controller.abort()
  }, [])

  const evaluate = async () => {
    if (!audioFile) {
      setEvaluationError('Choose an audio file before evaluating.')
      return
    }
    setEvaluating(true)
    setEvaluationError(null)
    try {
      setEvaluation(await evaluateRecording(audioFile, song))
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
          <button className={screen === 'new' || screen === 'upload' || screen === 'feedback' ? 'active' : ''} onClick={() => setScreen('new')}>New evaluation</button>
          <button className={screen === 'progress' ? 'active' : ''} onClick={() => setScreen('progress')}>My progress</button>
          <button className={screen === 'how' ? 'active' : ''} onClick={() => setScreen('how')}>How it works</button>
        </nav>
      </header>

      {(screen === 'new' || screen === 'upload' || screen === 'feedback') && <StepBar screen={screen} />}

      {screen === 'new' && (
        <main className="page-content new-page">
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
                  <span className={`tag ${id.includes('canon') ? 'orange' : ''}`}>{songs[id].level}</span>
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
              <button className="primary" onClick={() => setScreen('upload')}>Choose file</button>
              <span className="format-note">MP3, WAV or M4A</span>
            </div>
          </section>

          <div className="info-note"><Info size={19} /> Feedback covers note accuracy, tempo, and rhythm.</div>
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
      {screen === 'progress' && <ProgressScreen song={song} songs={songs} onSongChange={setSong} onBack={() => setScreen('new')} />}
      {screen === 'how' && <HowItWorksScreen onStart={() => setScreen('new')} />}

      <footer><span>Saved on this device.</span><span>Your practice, at your pace.</span></footer>
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

const howItWorks = [
  {
    number: '01',
    title: 'Choose a piece',
    body: 'Pick Für Elise or Ode to Joy and load its reference score.',
  },
  {
    number: '02',
    title: 'Add your take',
    body: 'Upload an MP3, WAV, or M4A. Cadence aligns it to the score.',
  },
  {
    number: '03',
    title: 'Review and practise',
    body: 'See note, tempo, and rhythm detail, then loop the weak spot.',
  },
]

function HowItWorksScreen({ onStart }: { onStart: () => void }) {
  return <main className="page-content how-page">
    <Eyebrow>HOW IT WORKS</Eyebrow>
    <h1>From recording to next step.</h1>
    <p className="lede">One take becomes a precise picture of what to keep and what to practise next.</p>
    <div className="how-grid">
      {howItWorks.map((step) => <section className="how-card" key={step.number}>
        <span className="how-number">{step.number}</span>
        <div><h2>{step.title}</h2><p>{step.body}</p></div>
      </section>)}
    </div>
    <div className="how-actions">
      <p>No microphone or setup needed. Start with a recording you already have.</p>
      <button className="primary" onClick={onStart}>Start a new evaluation</button>
    </div>
  </main>
}

function FeedbackScreen({ evaluation, file, fileName, song, onNew }: { evaluation: Evaluation | null; file: File | null; fileName: string; song: Score; onNew: () => void }) {
  const [tab, setTab] = useState<'accuracy' | 'tempo' | 'rhythm' | 'notes'>('accuracy')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const result = evaluation ?? {
    ...sample,
    // Same as REFERENCE_BPM in python/score_models.py, which uploaded results report.
    reference_bpm: 60 / 0.44,
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
  const tabs = [['accuracy', 'Accuracy'], ['tempo', 'Tempo'], ['rhythm', 'Rhythm'], ['notes', 'Notes']] as const
  return <main className="page-content feedback-page">
    <div className="feedback-heading">
      <div>
        <Eyebrow>EVALUATION COMPLETE</Eyebrow>
        <h1>Here&apos;s how you played.</h1>
        <p className="lede">{song.title} · {song.detail.split(' · ')[0]} · {fileName}</p>
      </div>
    </div>

    <div className="metric-grid">
      {[
        [`${result.pitch.score}%`, 'Note accuracy', `${result.pitch.correct} of ${result.pitch.expected} reference notes matched`],
        [`${result.pitch.missing + result.pitch.wrong + result.pitch.insertions}`, 'Note errors', `${result.pitch.wrong} wrong · ${result.pitch.missing} missing · ${result.pitch.insertions} extra`],
        [timing.averageBpm === null ? '–' : String(Math.round(timing.averageBpm)), 'Average tempo', `${song.beatSymbol} per minute · target ${Math.round(result.reference_bpm)}`],
        [timing.rhythmScore === null ? '–' : `${Math.round(timing.rhythmScore * 100)}%`, 'Rhythm accuracy', 'Notes on time'],
      ].map(([value, title, detail]) => <div className="metric" key={title}><strong>{value}</strong><span><b>{title}</b><small>{detail}</small></span></div>)}
    </div>

    <section className="feedback-card">
      <div className="card-title">
        <div><h2>Review your performance</h2><p>{tab === 'rhythm' ? 'Expected timing versus what you played.' : tab === 'tempo' ? 'Your tempo across the whole take.' : tab === 'notes' ? 'The reference score and the notes you played.' : 'Where the notes matched the score.'}</p></div>
        <div className="segmented">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      </div>
      <div className="feedback-view">
        {tab === 'tempo' && <TempoChart timing={timing} events={result.events} targetBpm={result.reference_bpm} song={song} />}
        {tab === 'rhythm' && <RhythmChart events={result.events} timing={timing} />}
        {tab === 'accuracy' && <AccuracySummary pitch={result.pitch} />}
        {tab === 'notes' && <NotesView events={result.events} pitch={result.pitch} />}
      </div>
      <div className="feedback-player">
        <small>{fileName} · Playback position is shared across all views</small>
        <span>Switching tabs keeps your position</span>
        <div>
          <button className="play-button" onClick={toggleRecording} disabled={!file}>{playing ? 'Ⅱ  Pause recording' : '▷  Play recording'}</button>
          <span className="time">{formatAudioTime(currentTime)}</span>
          <div className="player-line"><i style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} /></div>
          <span className="time">{formatAudioTime(duration)}</span>
        </div>
        <audio ref={audioRef} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0) }} />
      </div>
    </section>

    <div className="feedback-actions">
      <button className="secondary" onClick={onNew}>New evaluation</button>
    </div>
  </main>
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00'
  const wholeSeconds = Math.floor(seconds)
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function AccuracySummary({ pitch }: { pitch: Evaluation['pitch'] }) {
  const score = Math.max(0, Math.min(100, pitch.score))
  return <div className="accuracy-summary">
    <div className="accuracy-meter"><i style={{ width: `${score}%` }} /></div>
    <div className="accuracy-counts">
      <span><b>{pitch.correct}</b>matched</span>
      <span><b>{pitch.wrong}</b>wrong</span>
      <span><b>{pitch.missing}</b>missing</span>
      <span><b>{pitch.insertions}</b>extra</span>
    </div>
    <p className="accuracy-note">{pitch.correct} of {pitch.expected} reference notes matched.</p>
  </div>
}

function NotesView({ events, pitch }: { events: AlgorithmEvent[]; pitch: Evaluation['pitch'] }) {
  return <div className="notes-view">
    <section className="note-panel" aria-label="Score note map">
      <div className="note-panel-title"><span>Score note map</span><small>Tap · orange = error</small></div>
      <NoteStaff events={events} />
    </section>
    <section className="note-panel" aria-label="Note accuracy grid">
      <div className="note-panel-title"><span>Note accuracy grid</span><small>{pitch.correct} of {pitch.expected} matched</small></div>
      <NoteGrid events={events} />
    </section>
  </div>
}

const fallbackStaffNotes: { midi: number; status: AlgorithmEvent['status'] }[] = [
  { midi: 76, status: 'ok' },
  { midi: 75, status: 'ok' },
  { midi: 76, status: 'ok' },
  { midi: 75, status: 'ok' },
  { midi: 76, status: 'ok' },
  { midi: 71, status: 'ok' },
  { midi: 74, status: 'ok' },
  { midi: 72, status: 'ok' },
  { midi: 69, status: 'ok' },
]

function NoteStaff({ events }: { events: AlgorithmEvent[] }) {
  const [active, setActive] = useState<string | null>(null)
  const eventNotes = events.slice(0, 9).map((event, index) => {
    const midi = [...event.expected, ...event.observed].find((pitch) => pitch > 0) ?? 60
    return {
      key: `event-${event.event}-${index}`,
      midi,
      status: event.status,
      label: midiNoteName(midi),
    }
  })
  const notes = eventNotes.length
    ? eventNotes
    : fallbackStaffNotes.map((note, index) => ({
        key: `fallback-${index}`,
        midi: note.midi,
        status: note.status,
        label: midiNoteName(note.midi),
      }))
  const low = Math.min(...notes.map((note) => note.midi))
  const high = Math.max(...notes.map((note) => note.midi))
  const range = high - low || 1

  const play = (note: typeof notes[number]) => {
    try {
      playPianoNote(note.midi, 0, 0.65, 0.86)
    } catch {
      // Audio is an enhancement; the note map still works without it.
    }
    setActive(note.key)
    window.setTimeout(() => setActive((current) => current === note.key ? null : current), 650)
  }

  return <svg className="note-staff-svg" viewBox="0 0 400 100" role="group" aria-label="Reference notes on the staff">
    {[26, 38, 50, 62, 74].map((y) => <line key={y} className="note-staff-line" x1={30} x2={391} y1={y} y2={y} />)}
    <text className="note-clef" x={7} y={70} aria-hidden="true">𝄞</text>
    {notes.map((note, index) => {
      const x = notes.length === 1 ? 80 : 64 + (index / (notes.length - 1)) * 300
      const y = 63 - ((note.midi - low) / range) * 34
      const statusLabel = note.status === 'wrong'
        ? 'wrong note'
        : note.status === 'missing'
          ? 'missing note'
          : note.status === 'unscored'
            ? 'unscored note'
            : 'note'
      return <g
        key={note.key}
        className={`note-mark ${note.status === 'wrong' ? 'wrong' : ''} ${note.status === 'missing' ? 'missing' : ''} ${active === note.key ? 'playing' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Play ${note.label}, ${statusLabel}`}
        onClick={() => play(note)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            play(note)
          }
        }}
      >
        <title>{note.label} · {statusLabel}</title>
        <line className="note-stem" x1={x + 5.2} x2={x + 5.2} y1={y - 1} y2={y - 25} />
        <ellipse className="note-head" cx={x} cy={y} rx={6.2} ry={4.4} transform={`rotate(-20 ${x} ${y})`} />
        <text className="note-name" x={x} y={94}>{note.label}</text>
      </g>
    })}
  </svg>
}

function NoteGrid({ events }: { events: AlgorithmEvent[] }) {
  const notes = events.map((event) => {
    const midi = [...event.expected, ...event.observed].find((pitch) => pitch > 0) ?? 60
    return { event, midi }
  })
  if (!notes.length) return <p className="chart-note">No note positions were available for this take.</p>
  const low = Math.min(...notes.map((note) => note.midi))
  const high = Math.max(...notes.map((note) => note.midi))
  const range = high - low || 1

  return <div className="note-grid" role="img" aria-label="Note accuracy grid: one bar per note event">
    {notes.map(({ event, midi }, index) => {
      const ratio = (midi - low) / range
      const left = 2 + (index / Math.max(1, notes.length - 1)) * 96
      const height = 12 + Math.min(Math.max(event.beats, 1), 4) * 4
      const state = event.status === 'wrong'
        ? 'wrong'
        : event.status === 'missing'
          ? 'missing'
          : event.status === 'unscored'
            ? 'unscored'
            : ''
      return <span
        key={`${event.event}-${index}`}
        className={`note-bar ${state}`}
        title={`${midiNoteName(midi)} · ${event.status}`}
        style={{ left: `${left}%`, bottom: `${12 + ratio * 70}%`, height: `${height}%` }}
      />
    })}
  </div>
}

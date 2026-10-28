'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  FileAudio,
  Info,
  Music2,
  Play,
  Upload,
} from 'lucide-react'

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
  const [fileName, setFileName] = useState('für-elise-practice.wav')

  const selectedSong = songs[song]

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
        <UploadScreen song={selectedSong} fileName={fileName} onFileChange={setFileName} onBack={() => setScreen('new')} onEvaluate={() => setScreen('feedback')} />
      )}
      {screen === 'feedback' && <FeedbackScreen onNew={() => setScreen('new')} />}
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

function UploadScreen({ song, fileName, onFileChange, onBack, onEvaluate }: { song: typeof songs.elise; fileName: string; onFileChange: (value: string) => void; onBack: () => void; onEvaluate: () => void }) {
  const [mode, setMode] = useState<'upload' | 'record'>('upload')
  const [playing, setPlaying] = useState(false)
  return <main className="page-content upload-page">
    <Eyebrow>UPLOAD A RECORDING</Eyebrow>
    <h1>Your performance is ready to review.</h1>
    <p className="lede">Check your audio, then submit it for note accuracy, tempo, and rhythm feedback.</p>
    <div className="upload-layout">
      <aside className="selected-song"><Eyebrow>SELECTED SONG</Eyebrow><h2>{song.title}</h2><p>{song.artist}</p><span className="outline-tag">{song.detail.split(' · ')[0]} · 16 bars</span><hr /><dl><dt>Difficulty</dt><dd>{song.level}</dd><dt>Reference tempo</dt><dd>72 BPM</dd><dt>Time signature</dt><dd>3/8</dd></dl><button className="text-button" onClick={onBack}>Change song</button></aside>
      <section className="file-area">
        <div className="tabs"><button className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}><Upload size={17} /> Upload a recording</button><button className={`tab ${mode === 'record' ? 'active' : ''}`} onClick={() => setMode('record')}><span>♟</span> Record in the app</button></div>
        <div className="audio-card"><div className="file-row"><span className="file-icon"><FileAudio /></span><span><strong>{mode === 'record' ? 'New in-app recording' : fileName}</strong><small>{mode === 'record' ? 'Microphone ready · 00:42 max' : 'WAV · 8.4 MB · 00:42'}</small></span><span className="complete">{mode === 'record' ? 'Demo ready' : 'Upload complete'}</span><button className="icon-button" onClick={() => onFileChange('practice-take.wav')} aria-label="Replace file">×</button></div><hr /><strong>{mode === 'record' ? 'Record before submitting' : 'Listen before submitting'}</strong><div className="waveform">{Array.from({ length: 60 }, (_, i) => <i key={i} style={{ height: `${18 + ((i * 19) % 46)}px` }} />)}</div><button className="play-button" onClick={() => setPlaying(!playing)}><Play size={16} /> {playing ? 'Pause' : mode === 'record' ? 'Start recording' : 'Play'}</button><span className="time">00:00 / 00:42</span><button className="replace text-button" onClick={() => onFileChange('practice-take.wav')}>Replace file</button></div>
        <label className="drop-zone" htmlFor="audio-file"><Upload size={18} /> Drop a different file here or browse files <small>MP3, WAV, M4A · Max. 25 MB</small><input id="audio-file" type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFileChange(file.name) }} /></label>
        <div className="actions"><button className="secondary" onClick={onBack}>Back to songs</button><button className="primary" onClick={onEvaluate}>Evaluate performance <ArrowRight size={17} /></button></div>
        <p className="fine-print">We’ll compare this recording with {song.title}, bars 1–16. Analysis usually takes about 30 seconds.</p>
      </section>
    </div>
  </main>
}

function FeedbackScreen({ onNew }: { onNew: () => void }) {
  const [tab, setTab] = useState<'accuracy' | 'tempo' | 'rhythm'>('accuracy')
  const [playing, setPlaying] = useState(false)
  const tabs = [['accuracy', 'Note accuracy'], ['tempo', 'Tempo'], ['rhythm', 'Rhythm']] as const
  const recommendations = [['Restore the 3 missed notes', 'Rehearse the highlighted gaps on the score slowly, hands separately. The dashed circles mark where expected notes were not played—focus on landing each one cleanly before increasing tempo.', 'Note accuracy'], ['Keep a steady tempo', 'Your average is 70 BPM against the 72 BPM reference, and the tempo graph shows you slow toward the end. Start practice at 60 BPM with a metronome, then build back toward 72 BPM once the notes feel secure.', 'Tempo'], ['Tighten note timing', 'Use the expected/played rhythm rolls in the Rhythm tab and count aloud while you play.', 'Rhythm']]
  return <main className="page-content feedback-page">
    <div className="feedback-heading"><div><Eyebrow>EVALUATION COMPLETE</Eyebrow><h1>Here's how you played.</h1><p className="lede">Für Elise · Opening section, bars 1–16 · fur-elise-practice.wav · 00:42</p></div><button className="secondary" onClick={onNew}>New evaluation</button></div>
    <div className="metric-grid">{[['89%', 'Note accuracy', '57 of 64 reference notes correct'], ['8', 'Note errors', '4 wrong · 3 missing · 1 extra'], ['70', 'Average tempo', 'BPM · Reference: 72 BPM'], ['85%', 'Rhythm accuracy', 'Note timing · illustrative score']].map(([value, title, detail]) => <div className="metric" key={title}><strong>{value}</strong><span><b>{title}</b><small>{detail}</small></span></div>)}</div>
    <section className="feedback-card">
      <div className="card-title"><div><h2>Review your performance</h2><p>{tab === 'rhythm' ? 'Compare expected note timing with your actual performance. Time moves left to right.' : tab === 'tempo' ? 'Switch tabs to see note accuracy, tempo, and rhythm detail.' : 'Switch tabs to see note accuracy, tempo, and rhythm detail.'}</p></div><div className="segmented">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div></div>
      {tab === 'tempo' && <TempoChart />}
      {tab === 'rhythm' && <RhythmRoll />}
      {tab === 'accuracy' && <AccuracyScore />}
      <div className="feedback-player"><small>fur-elise-practice.wav · Playback position is shared across all views</small><span>Switching tabs keeps your position</span><div><button className="play-button" onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ  Pause recording' : '▷  Play recording'}</button><span className="time">00:12</span><div className="player-line"><i /></div><span className="time">00:42</span></div></div>
    </section>
    <h2 className="work-title">Your top 3 things to work on</h2>{recommendations.map(([title, detail, tag], i) => <button className="work-item" key={title} onClick={() => setTab(tag === 'Tempo' ? 'tempo' : tag === 'Rhythm' ? 'rhythm' : 'accuracy')}><span className="rank">{i + 1}</span><div><h3>{title} <em>{tag}</em></h3><p>{detail}</p></div><ChevronRight /></button>)}<button className="record-button" onClick={onNew}>♩ &nbsp; Record another take</button>
  </main>
}

function AccuracyScore() {
  return <><div className="feedback-legend"><span>◯ Wrong note (4)</span><span>◌ Missing note (3)</span><span>× Extra note (1)</span></div><div className="score-grid accuracy-view">{Array.from({ length: 32 }, (_, i) => <span key={i} style={{ left: `${3 + i * 3}%`, bottom: `${20 + ((i * 17) % 43)}%` }} />)}</div><div className="callout"><CircleHelp size={17} /> Missing note: E. Practise the dashed gap slowly, then add the surrounding notes.<span>1 of 3 missing</span></div></>
}

function TempoChart() {
  return <><div className="chart-caption"><strong>Tempo over time</strong><span>Beats per minute</span></div><div className="chart-legend"><span className="tempo-line" /> Your tempo <span className="reference-line" /> Reference · 72 BPM</div><div className="tempo-chart"><span>84</span><span>72</span><span>60</span><svg viewBox="0 0 1000 220" preserveAspectRatio="none" aria-label="Illustrative tempo chart"><path d="M0 75 L45 70 L90 73 L135 80 L180 65 L225 70 L270 82 L315 80 L360 88 L405 83 L450 78 L495 85 L540 95 L585 82 L630 92 L675 104 L720 95 L765 86 L810 90 L855 101 L900 106 L945 99 L1000 111" /></svg><div className="chart-axis"><span>0:00</span><span>0:10</span><span>0:20</span><span>0:30</span><span>0:42</span></div></div><p className="chart-note">Your pace slows slightly in the last 10 seconds. Aim for an even 72 BPM.</p></>
}

function RhythmRoll() {
  return <><div className="feedback-legend"><span className="legend-blue">■</span> On time <span className="legend-orange">■</span> Early / late (labeled below) <span className="legend-gray">■</span> Reference (expected) <em>Illustrative sample</em></div><div className="rhythm-roll"><strong>Beat → illustrative excerpt</strong><b>EXPECTED</b><div className="expected-row">{Array.from({ length: 16 }, (_, i) => <i key={i} />)}</div><b>ACTUALLY PLAYED</b><div className="played-row">{Array.from({ length: 16 }, (_, i) => <i className={i % 5 === 0 || i % 7 === 0 ? 'late' : ''} key={i} />)}</div><div className="timing-labels"><span>Early</span><span>Late</span><span>Early</span><span>Late</span></div></div><p className="chart-note">Compare note onsets and durations with the expected roll. Early / Late labels mark timing deviations; the Tempo tab shows changes in playing speed.</p></>
}

function ProgressScreen({ onBack }: { onBack: () => void }) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const data = [['2 Oct', '78%', '80%', '76%'], ['7 Oct', '84%', '86%', '82%'], ['13 Oct', '88%', '90%', '86%'], ['21 Oct', '92%', '94%', '90%']]
  return <main className="page-content progress-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Progress Tracker</button><div className="progress-heading"><div><Eyebrow>SONG PROGRESS</Eyebrow><h1>Ode to Joy</h1><p className="lede">Main theme · 16 bars · Reference: 90 BPM</p></div><div className="latest"><small>Latest-play accuracy</small><strong>92%</strong><span>21 Oct 2026 · 18:00</span></div></div><p className="fine-print">Illustrative sample data · Overall accuracy = (note accuracy + rhythm accuracy) ÷ 2.</p><div className="section-heading"><h2>Progress over time</h2><span>All 4 logged plays · October 2026</span></div><div className="chart-grid">{[['Note accuracy', '94%', [80, 86, 90, 94]], ['Tempo', '88 BPM', [76, 82, 86, 88]], ['Rhythm accuracy', '90%', [76, 82, 86, 90]]].map(([title, value, points]) => <div className="chart-card" key={title}><h3>{title}<strong>{value}</strong></h3><div className="mini-chart">{(points as number[]).map((point, i) => <span key={i} style={{ left: `${12 + i * 27}%`, bottom: `${point - 50}%` }}>{point}</span>)}</div><small>October 2026 · Date played</small></div>)}</div><section className="logged"><div className="section-heading"><h2>Logged plays</h2><span>Oldest to newest · Same sessions as the graphs</span></div><div className="table-head"><span>Date & time</span><span>Method</span><span>Overall accuracy</span><span>Note accuracy</span><span>Rhythm accuracy</span></div>{data.map(([date, overall, note, rhythm]) => <div className="table-row" key={date}><span>{date} 2026 · 18:00</span><span>Upload</span><b>{overall}</b><span>{note}</span><span>{rhythm}</span></div>)}</section><h2 className="work-title">Past recordings</h2>{data.slice().reverse().map(([date, overall, note, rhythm]) => <div className="recording-row" key={date}><div><b>{date} 2026 · 18:00</b><small>Upload · 00:43</small></div><strong>{overall} overall accuracy<small>Notes {note} · Rhythm {rhythm}</small></strong><button className="primary" onClick={() => setReport(date)}>View detailed report</button><button className="secondary" onClick={() => setPlaying(playing === date ? null : date)}><Play size={15} /> {playing === date ? 'Pause recording' : 'Play recording'}</button>{report === date && <small className="report-note">Demo report selected</small>}</div>)}</main>
}

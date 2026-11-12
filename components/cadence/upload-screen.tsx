'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, FileAudio, Play, Upload } from 'lucide-react'

type Song = {
  title: string
  artist: string
  level: string
  detail: string
}

export function UploadScreen({ song, file, onFileChange, onBack, onEvaluate, evaluating, error }: { song: Song; file: File | null; onFileChange: (value: File | null) => void; onBack: () => void; onEvaluate: () => void; evaluating: boolean; error: string | null }) {
  const [mode, setMode] = useState<'upload' | 'record'>('upload')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioReady, setAudioReady] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) {
      setCurrentTime(0)
      setDuration(0)
      setPlaying(false)
      setAudioReady(false)
      setAudioError(null)
      return
    }

    const audio = audioRef.current
    if (!audio) return
    const url = URL.createObjectURL(file)
    audio.src = url
    audio.load()
    setCurrentTime(0)
    setDuration(0)
    setPlaying(false)
    setAudioReady(false)
    setAudioError(null)

    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio || !file) return
    if (audio.paused) {
      try {
        if (!audioReady && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          await new Promise<void>((resolve, reject) => {
            const ready = () => {
              cleanup()
              resolve()
            }
            const failed = () => {
              cleanup()
              reject(new Error('Audio could not be loaded.'))
            }
            const cleanup = () => {
              audio.removeEventListener('canplay', ready)
              audio.removeEventListener('error', failed)
            }
            audio.addEventListener('canplay', ready, { once: true })
            audio.addEventListener('error', failed, { once: true })
            audio.load()
          })
        }
        await audio.play()
      } catch {
        setPlaying(false)
        setAudioError('This recording could not be played in the browser. You can still submit it for evaluation.')
      }
    } else {
      audio.pause()
    }
  }

  const selectFile = (selected: File | undefined) => {
    if (selected) onFileChange(selected)
  }

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00'
    const wholeSeconds = Math.floor(seconds)
    return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
  }

  return <main className="page-content upload-page">
    <div className="eyebrow">UPLOAD A RECORDING</div>
    <h1>Your performance is ready to review.</h1>
    <p className="lede">Check your audio, then submit it for note accuracy, tempo, and rhythm feedback.</p>
    <div className="upload-layout">
      <aside className="selected-song"><div className="eyebrow">SELECTED SONG</div><h2>{song.title}</h2><p>{song.artist}</p><span className="outline-tag">{song.detail.split(' · ')[0]} · 16 bars</span><hr /><dl><dt>Difficulty</dt><dd>{song.level}</dd><dt>Reference tempo</dt><dd>72 BPM</dd><dt>Time signature</dt><dd>3/8</dd></dl><button className="text-button" onClick={onBack}>Change song</button></aside>
      <section className="file-area">
        <div className="tabs"><button className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}><Upload size={17} /> Upload a recording</button><button className={`tab ${mode === 'record' ? 'active' : ''}`} onClick={() => setMode('record')}><span>♟</span> Record in the app</button></div>
        <div className="audio-card"><div className="file-row"><span className="file-icon"><FileAudio /></span><span><strong>{mode === 'record' ? 'New in-app recording' : file?.name ?? 'No recording selected'}</strong><small>{mode === 'record' ? 'Microphone ready · 00:42 max' : file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${file.type || 'audio file'}` : 'Choose an MP3, WAV, or M4A file below'}</small></span><span className="complete">{mode === 'record' ? 'Demo ready' : file ? 'Ready to review' : 'Waiting for file'}</span><button className="icon-button" onClick={() => onFileChange(null)} aria-label="Remove file" disabled={!file}>×</button></div><hr /><strong>{mode === 'record' ? 'Record before submitting' : file ? 'Listen before submitting' : 'Your recording preview will appear here'}</strong><audio ref={audioRef} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onCanPlay={() => setAudioReady(true)} onError={() => { setAudioReady(false); setAudioError('This recording could not be decoded by the browser. You can still submit it for evaluation.') }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCurrentTime(0) }} /><div className="audio-controls"><button className="play-button" onClick={togglePlayback} disabled={!file || !!audioError}><Play size={16} /> {playing ? 'Pause' : mode === 'record' ? 'Start recording' : audioReady ? 'Play recording' : 'Loading recording…'}</button><span className="time">{formatTime(currentTime)} / {formatTime(duration)}</span></div><input className="audio-seek" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); setCurrentTime(Number(event.target.value)) }} disabled={!file || !duration} aria-label="Seek through recording" />{audioError && <p className="audio-error">{audioError}</p>}</div>
        <div className="upload-picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]) }}>
          <div><Upload size={20} /><strong>{file ? 'Want to use a different recording?' : 'Add your recording'}</strong><small>Choose a file from your device, or drag it here.</small></div>
          <button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>{file ? 'Choose another file' : 'Choose audio file'}</button>
          <input ref={fileInputRef} id="audio-file" type="file" accept=".mp3,.wav,.m4a,audio/*" onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
          <span>MP3, WAV, or M4A · Max. 25 MB</span>
        </div>
        {error && <p className="chart-note">{error}</p>}
        <div className="actions"><button className="secondary" onClick={onBack}>Back to songs</button><button className="primary" onClick={onEvaluate} disabled={evaluating || !file}>{evaluating ? 'Evaluating…' : 'Evaluate performance'} {!evaluating && <ArrowRight size={17} />}</button></div>
        <p className="fine-print">We’ll compare this recording with {song.title}, bars 1–16. Analysis usually takes about 30 seconds.</p>
      </section>
    </div>
  </main>
}

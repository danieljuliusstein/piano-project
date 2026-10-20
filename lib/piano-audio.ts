export type Voice = { stop: () => void }

let context: AudioContext | null = null
let master: GainNode | null = null

export function getAudio() {
  if (!context) {
    context = new AudioContext()
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 3
    master = context.createGain()
    master.gain.value = 0.55
    master.connect(compressor)
    compressor.connect(context.destination)
  }
  if (context.state === 'suspended') void context.resume()
  return { ctx: context, out: master! }
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export function playPianoNote(midi: number, when: number, duration: number, velocity: number): Voice {
  const { ctx, out } = getAudio()
  const start = Math.max(when, ctx.currentTime)
  const freq = midiToHz(midi)
  const peak = 0.28 * velocity
  const release = start + Math.max(duration, 0.25) + 0.5

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(peak, start + 0.006)
  amp.gain.exponentialRampToValueAtTime(peak * 0.32, start + 0.35)
  amp.gain.exponentialRampToValueAtTime(0.0001, release)

  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(1200 + velocity * 3200, start)
  tone.frequency.exponentialRampToValueAtTime(700, release)

  const partials: [ratio: number, gain: number, type: OscillatorType][] = [
    [1, 1, 'triangle'],
    [2, 0.28, 'sine'],
    [3, 0.08, 'sine'],
  ]

  const oscillators = partials.map(([ratio, gain, type]) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq * ratio
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g).connect(tone)
    osc.start(start)
    osc.stop(release + 0.05)
    return osc
  })

  tone.connect(amp).connect(out)

  return {
    stop() {
      const now = ctx.currentTime
      amp.gain.cancelScheduledValues(now)
      amp.gain.setTargetAtTime(0, now, 0.015)
      oscillators.forEach((osc) => {
        try {
          osc.stop(now + 0.08)
        } catch {
          /* already stopped */
        }
      })
    },
  }
}

export function playClick(when: number, accent: boolean): Voice {
  const { ctx, out } = getAudio()
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = accent ? 1760 : 1180
  amp.gain.setValueAtTime(0, when)
  amp.gain.linearRampToValueAtTime(accent ? 0.22 : 0.12, when + 0.002)
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(amp).connect(out)
  osc.start(when)
  osc.stop(when + 0.06)
  return {
    stop() {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    },
  }
}

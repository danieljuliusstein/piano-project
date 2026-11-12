"""Score-informed note grading with a split representation.

The previous system used one constant-Q transform for everything. That failed
in a specific, measured way: because CQT bins are spaced in semitones, the
filter width scales with frequency and the gap between semitone neighbours is
the same number of bins at every octave. Energy from a struck key therefore
bleeds into its neighbour's bin by a constant ~20 dB no matter which partial
you look at, so a written pitch reads "present" even when a different key was
struck. Measured on 82 recordings: struck notes 39.5 dB, unplayed semitone
neighbours 19.0 dB, and a fixed decision boundary between them discards 15% of
genuine strikes while still admitting a third of the leakage.

This version splits the two jobs:

  ALIGNMENT  uses the CQT. Alignment needs onset timing and coarse pitch
             identity, and it benefits from tolerance -- a razor-sharp
             representation would lose the thread when a wrong note is played.
             Log-spaced bins are the right choice here.

  EMISSIONS  use an STFT. Deciding whether THIS pitch sounded, rather than its
             neighbour, is exactly the discrimination constant-Q throws away.
             STFT bins are a fixed width in Hz, so semitone neighbours grow
             further apart with frequency: at E4 they are under two bins apart,
             but at the fifth partial about nine. Upper partials become
             resolvable, which is where pitch identity is actually decidable.

No decision threshold is a hand-set constant. Every one is derived from the
recording being analysed:

  * the noise floor is a low percentile per frequency bin, so steady hum and
    hiss from a raw recorder are removed at whatever level they happen to sit
  * the local spectral background is a median across neighbouring bins, so a
    partial is judged against its own surroundings
  * presence is split from absence by Otsu's method [Otsu 1979] on the
    recording's own distribution of fingerprint scores
  * pitch identity is settled by a local-maximum test across the semitone
    neighbourhood, which is a comparison rather than a level
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field

import av
import librosa
import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d

from score_models import get_score_model, midi_note_name


@dataclass(frozen=True)
class Config:
    sample_rate: int = 22_050
    hop_length: int = 512

    # --- STFT, for emissions -------------------------------------------
    # 4096 at 22.05 kHz gives 5.4 Hz per bin. A semitone at E4 is 19.6 Hz
    # (3.6 bins); at its fifth partial 98 Hz (18 bins). The upper partials are
    # what make pitch identity decidable.
    n_fft: int = 4096
    # Partials are searched within +/-25 cents, which admits ordinary detuning
    # and stretched piano tuning while excluding the neighbouring semitone at
    # 100 cents. Expressed in cents rather than bins so the window narrows
    # automatically at low frequencies, where bins are coarse relative to pitch.
    partial_tolerance_cents: float = 25.0
    # Harmonics 1,3,5 are weighted above 2,4,6: the pitch an octave up supplies
    # exactly the even partials of the pitch below, so even-harmonic energy
    # cannot distinguish p from p+12. Odd partials are the honest evidence.
    harmonics: tuple[int, ...] = (1, 2, 3, 4, 5, 6)
    harmonic_weights: tuple[float, ...] = (1.0, 0.4, 0.8, 0.3, 0.6, 0.2)

    # --- adaptive background estimation --------------------------------
    # Per-bin noise floor: a low percentile over time. Stationary noise sits
    # near a bin's minimum; a note raises it only briefly.
    noise_floor_percentile: float = 10.0
    # Local spectral background: median across this many neighbouring bins
    # (~275 Hz here). Wide enough to span the gaps between partials, narrow
    # enough to track broadband spectral tilt.
    background_bins: int = 51

    # --- CQT, for alignment --------------------------------------------
    bins_per_octave: int = 36
    fmin_midi: int = 36                       # C2
    cqt_octaves: int = 6

    # --- alignment ------------------------------------------------------
    # Weight on the CQT onset envelope when entering a new event, relative to
    # the emission scale. Both are in log units; the emission scale is itself
    # derived from the data, so this is a ratio rather than an absolute level.
    onset_weight: float = 2.0
    duration_weight: float = 1.0
    # A state may not be left before this fraction of its notated duration has
    # elapsed. Without it the path advances a state per frame wherever the
    # emission dips, producing one-frame windows whose evidence is meaningless.
    # This is the standard minimum-duration constraint of a semi-Markov model;
    # it is a fraction of the SCORE's own duration, not an absolute level, so
    # it holds across the corpus tempo range.
    minimum_duration_fraction: float = 0.35
    neighbourhood_semitones: int = 2

    # --- per-pitch attack detection -------------------------------------
    # A pitch's rise is measured over this many frames (~46 ms at hop 512),
    # long enough to span a piano attack and short enough not to smear into
    # the next note at the fastest tempo in the corpus.
    attack_lag_frames: int = 2
    attack_smooth_frames: int = 3
    # Attacks occur at the START of a note, so the rise is sought in the
    # opening fraction of the event's own span rather than across all of it.
    # Expressed as a fraction so it scales with tempo.
    attack_window_fraction: float = 0.5
    attack_lookback_frames: int = 2

    # --- performance extent ---------------------------------------------
    # The recording contains lead-in before the first key press and tail
    # after the last. Pinning the first event to frame 0 grades it against
    # handling noise and silence; letting the last event run to the end of the
    # file grades it against the room. Both produced systematic false alarms
    # (events 0, 1 and the final events accounted for ~45% of them), so the
    # analysis is cropped to the span that actually contains playing.
    # The cut is an Otsu split of the recording's own onset envelope, not a
    # level, so it adapts to how loudly the take was recorded.
    tail_frames: int = 8                      # allow the last note to decay

    def seconds_per_frame(self) -> float:
        return self.hop_length / self.sample_rate


@dataclass
class Evidence:
    """Per-pitch fingerprint scores plus the alignment onset envelope."""

    pitches: np.ndarray                       # (pitch,) MIDI numbers
    fingerprint: np.ndarray                   # (pitch, frame) dB above background
    onset: np.ndarray                         # (frame,) CQT onset strength, 0..1
    attack: np.ndarray                        # (pitch, frame) per-pitch rise, dB
    threshold: np.ndarray                     # (pitch,) adaptive presence threshold, dB
    attack_threshold: np.ndarray              # (pitch,) adaptive attack threshold, dB
    scale: np.ndarray                         # (pitch,) adaptive decision width, dB
    index_of: dict = field(default_factory=dict)


def load_audio(path: str, sample_rate: int) -> np.ndarray:
    """Load common piano formats, including M4A when libsndfile cannot."""
    try:
        waveform, _ = librosa.load(path, sr=sample_rate, mono=True)
        return waveform
    except Exception as soundfile_error:
        try:
            container = av.open(path)
            stream = next((stream for stream in container.streams if stream.type == "audio"), None)
            if stream is None:
                raise ValueError("The file contains no audio stream.")
            resampler = av.audio.resampler.AudioResampler(
                format="flt",
                layout="mono",
                rate=sample_rate,
            )
            chunks = []
            for frame in container.decode(stream):
                for converted in resampler.resample(frame):
                    chunks.append(converted.to_ndarray().reshape(-1))
            for converted in resampler.resample(None):
                chunks.append(converted.to_ndarray().reshape(-1))
            if not chunks:
                raise ValueError("The audio stream contains no decodable samples.")
            return np.concatenate(chunks).astype(np.float32, copy=False)
        except Exception as decoder_error:
            raise RuntimeError(
                f"Unable to decode audio file {path!r}. "
                "Install a supported decoder for MP3, WAV, or M4A."
            ) from decoder_error


# ----------------------------------------------------------------------
# Adaptive thresholding
# ----------------------------------------------------------------------

def otsu_threshold(values: np.ndarray, bins: int = 256) -> float:
    """Split a distribution into two classes by maximising between-class
    variance [Otsu 1979].

    Used instead of a hand-set dB cutoff. The threshold follows the recording:
    a quietly played take and a loud one produce different distributions and
    get different cutoffs, with no constant to tune.
    """
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return 0.0
    counts, edges = np.histogram(finite, bins=bins)
    centers = (edges[:-1] + edges[1:]) / 2.0
    weight = np.cumsum(counts)
    total = weight[-1]
    if total == 0:
        return float(np.median(finite))
    weight_background = weight / total
    weight_foreground = 1.0 - weight_background
    cumulative = np.cumsum(counts * centers)
    mean_background = np.divide(cumulative, weight, out=np.zeros_like(cumulative),
                                where=weight > 0)
    mean_foreground = np.divide(cumulative[-1] - cumulative, total - weight,
                                out=np.zeros_like(cumulative),
                                where=(total - weight) > 0)
    between = weight_background * weight_foreground * (mean_background - mean_foreground) ** 2
    between[~np.isfinite(between)] = -np.inf
    return float(centers[int(np.argmax(between))])


# ----------------------------------------------------------------------
# Representations
# ----------------------------------------------------------------------

def stft_contrast(waveform: np.ndarray, config: Config) -> tuple[np.ndarray, np.ndarray]:
    """STFT magnitude in dB, with the recording's own background removed.

    Two adaptive stages, in this order and for different reasons:

    1. A per-bin noise floor, taken as a low percentile over time. This removes
       stationary content -- mains hum, recorder hiss, room rumble -- at
       whatever level it sits in this particular recording.

    2. A local spectral median across neighbouring bins. This asks whether a
       partial stands out from its own surroundings rather than whether it is
       loud, which is what makes the measure robust to overall level and to
       broadband spectral tilt.
    """
    spectrum = np.abs(librosa.stft(waveform, n_fft=config.n_fft,
                                   hop_length=config.hop_length))
    decibels = librosa.amplitude_to_db(spectrum, ref=np.max, top_db=120.0)

    noise_floor = np.percentile(decibels, config.noise_floor_percentile, axis=1)
    denoised = decibels - noise_floor[:, None]

    background = median_filter(denoised, size=(config.background_bins, 1),
                               mode="nearest")
    contrast = denoised - background

    frequencies = librosa.fft_frequencies(sr=config.sample_rate,
                                          n_fft=config.n_fft)
    return contrast, frequencies


def cqt_onset(waveform: np.ndarray, config: Config) -> np.ndarray:
    """Onset strength from the CQT, normalised to 0..1.

    Kept on the CQT because onset timing is what alignment needs and the
    log-spaced representation emphasises note attacks across the register.
    """
    spectrum = np.abs(librosa.cqt(
        y=waveform, sr=config.sample_rate, hop_length=config.hop_length,
        fmin=float(librosa.midi_to_hz(config.fmin_midi)),
        bins_per_octave=config.bins_per_octave,
        n_bins=config.bins_per_octave * config.cqt_octaves,
    ))
    envelope = librosa.onset.onset_strength(
        S=librosa.amplitude_to_db(spectrum, ref=np.max),
        sr=config.sample_rate, hop_length=config.hop_length,
    )
    peak = float(envelope.max())
    return envelope / peak if peak > 0 else envelope


def build_evidence(waveform: np.ndarray, pitches: np.ndarray,
                   config: Config) -> Evidence:
    """Harmonic fingerprint score per pitch per frame, read from the STFT."""
    contrast, frequencies = stft_contrast(waveform, config)
    onset = cqt_onset(waveform, config)

    frames = min(contrast.shape[1], onset.shape[0])
    contrast, onset = contrast[:, :frames], onset[:frames]

    nyquist = config.sample_rate / 2.0
    ratio = 2.0 ** (config.partial_tolerance_cents / 1200.0)
    fingerprint = np.zeros((len(pitches), frames))

    for row, pitch in enumerate(pitches):
        fundamental = float(librosa.midi_to_hz(pitch))
        found, weights = [], []
        for harmonic, weight in zip(config.harmonics, config.harmonic_weights):
            target = fundamental * harmonic
            if target >= nyquist:
                break
            low = np.searchsorted(frequencies, target / ratio, side="left")
            high = np.searchsorted(frequencies, target * ratio, side="right")
            if high <= low:                     # window narrower than one bin
                low = int(np.argmin(np.abs(frequencies - target)))
                high = low + 1
            found.append(contrast[low:high].max(axis=0))
            weights.append(weight)
        if found:
            fingerprint[row] = np.average(np.vstack(found), axis=0,
                                          weights=weights)

    # One threshold PER PITCH, over that pitch's own time series.
    #
    # A single global threshold fails here: at most a few of the candidate
    # pitches sound at any instant, so roughly 97% of (pitch, frame) cells are
    # silent and Otsu -- which assumes two classes of comparable mass --
    # drifts into the tail and rejects nearly everything. Restricted to one
    # pitch over time the two classes are far better balanced.
    #
    # It also removes a confound the global version could not: a piano's
    # partial structure and the recorder's response both vary with register,
    # so the level that means "sounding" is not the same for C3 as for E5.
    # This is the adaptive, pitch-dependent thresholding used in the
    # score-informed literature [Wang et al. 2017].
    global_threshold = otsu_threshold(fingerprint.ravel())
    # Per-pitch attack: the half-wave-rectified rise of the fingerprint.
    #
    # This is the quantity level cannot supply. A note still ringing from
    # earlier is DECAYING, so its rise is zero however loud it remains; a
    # freshly struck note is RISING, however quiet it is. Measured per pitch
    # rather than keyboard-wide, so a soft strike on one pitch is not masked
    # by a loud strike on another.
    smooth = uniform_filter1d(fingerprint, size=max(1, config.attack_smooth_frames),
                              axis=1, mode="nearest")
    lag = max(1, config.attack_lag_frames)
    attack = np.zeros_like(smooth)
    attack[:, lag:] = np.maximum(0.0, smooth[:, lag:] - smooth[:, :-lag])

    threshold = np.empty(len(pitches))
    attack_threshold = np.empty(len(pitches))
    scale = np.empty(len(pitches))
    for row in range(len(pitches)):
        series = fingerprint[row]
        cut = otsu_threshold(series)
        above = series[series > cut]
        # A pitch never played has no bimodality to find; fall back to the
        # corpus-wide split rather than thresholding its own noise.
        if above.size < max(3, 0.01 * series.size):
            cut = global_threshold
            above = series[series > cut]
        threshold[row] = cut
        spread = float(np.median(np.abs(above - cut))) if above.size else 1.0
        scale[row] = max(spread, 1e-3)

        # The attack threshold is derived the same adaptive way, over this
        # pitch's own rises. Most frames contain no attack, so restrict Otsu
        # to the non-zero rises, where the two classes are comparable.
        rises = attack[row][attack[row] > 0]
        attack_threshold[row] = otsu_threshold(rises) if rises.size > 8 else 0.0

    return Evidence(pitches=pitches, fingerprint=fingerprint, onset=onset,
                    attack=attack, threshold=threshold,
                    attack_threshold=attack_threshold, scale=scale,
                    index_of={int(p): i for i, p in enumerate(pitches)})


# ----------------------------------------------------------------------
# Alignment
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class Event:
    index: int
    start_beat: float
    beats: float
    pitches: tuple[int, ...]


def build_events(score) -> list[Event]:
    """One event per notated attack point, melody and harmony combined."""
    points: dict[float, set[int]] = {}
    for track in (score.melody, score.harmony):
        beat = 0.0
        for pitch, duration in zip(track.pitches, track.durations_beats):
            if pitch > 0:
                points.setdefault(round(beat, 6), set()).add(int(pitch))
            beat += duration
    ordered = sorted(points)
    events = []
    for index, start in enumerate(ordered):
        end = ordered[index + 1] if index + 1 < len(ordered) else start + 1.0
        events.append(Event(index, start, end - start,
                            tuple(sorted(points[start]))))
    return events


def log_emission(events: list[Event], evidence: Evidence,
                 config: Config) -> np.ndarray:
    """(event, frame) log-likelihood that an event's pitches are sounding.

    A logistic on (score - adaptive threshold) / adaptive scale. Both terms
    come from the recording, so the same code applies to a quiet take and a
    loud one without adjustment.
    """
    frames = evidence.fingerprint.shape[1]
    out = np.zeros((len(events), frames))
    for event in events:
        rows = [evidence.index_of[p] for p in event.pitches
                if p in evidence.index_of]
        if not rows:
            continue
        margin = ((evidence.fingerprint[rows] - evidence.threshold[rows, None])
                  / evidence.scale[rows, None])
        probability = 1.0 / (1.0 + np.exp(-np.clip(margin, -40.0, 40.0)))
        # Geometric mean over the event's pitches: a chord is only as well
        # evidenced as its weakest member, which keeps a loud melody note from
        # covering for a silent bass note.
        out[event.index] = np.mean(np.log(np.clip(probability, 1e-12, 1.0)),
                                   axis=0)
    return out


def viterbi(events: list[Event], evidence: Evidence,
            config: Config) -> list[tuple[int, int]]:
    """Frame-synchronous Viterbi over event states; returns a span per event.

    Transitions are stay-or-advance only. Advancing is rewarded by the CQT
    onset envelope, which is the signal alignment actually depends on, and
    penalised for departing from the notated duration ratio.
    """
    emission = log_emission(events, evidence, config)
    count, frames = emission.shape
    total_beats = sum(e.beats for e in events)
    expected = np.array([max(1.0, e.beats / total_beats * frames)
                         for e in events])

    best = np.full((count, frames), -np.inf)
    back = np.zeros((count, frames), dtype=np.int32)
    length = np.zeros((count, frames), dtype=np.int32)
    best[0, 0] = emission[0, 0]
    length[0, 0] = 1

    for frame in range(1, frames):
        advance = config.onset_weight * evidence.onset[frame]
        for state in range(count):
            stay = -np.inf
            if best[state, frame - 1] > -np.inf:
                run = length[state, frame - 1] + 1
                stay = best[state, frame - 1] - config.duration_weight * \
                    max(0.0, run / expected[state] - 1.0) ** 2
            step = -np.inf
            if state > 0 and best[state - 1, frame - 1] > -np.inf:
                run = length[state - 1, frame - 1]
                floor = config.minimum_duration_fraction * expected[state - 1]
                if run >= floor:
                    step = best[state - 1, frame - 1] + advance - \
                        config.duration_weight * \
                        (1.0 - min(1.0, run / expected[state - 1])) ** 2
            if stay >= step:
                best[state, frame] = stay + emission[state, frame]
                back[state, frame] = state
                length[state, frame] = length[state, frame - 1] + 1
            else:
                best[state, frame] = step + emission[state, frame]
                back[state, frame] = state - 1
                length[state, frame] = 1

    state = int(np.argmax(best[:, frames - 1]))
    path = np.zeros(frames, dtype=np.int32)
    for frame in range(frames - 1, -1, -1):
        path[frame] = state
        state = back[state, frame]

    spans = []
    for index in range(count):
        hit = np.flatnonzero(path == index)
        spans.append((int(hit[0]), int(hit[-1]) + 1) if hit.size else (0, 0))
    return spans


# ----------------------------------------------------------------------
# Grading
# ----------------------------------------------------------------------

@dataclass
class Verdict:
    event: int
    status: str
    expected: tuple[int, ...]
    observed: tuple[int, ...]
    start_seconds: float
    end_seconds: float
    margin_db: float


def grade(events: list[Event], spans: list[tuple[int, int]],
          evidence: Evidence, config: Config) -> list[Verdict]:
    """Per-event verdict from two adaptive tests, neither an absolute level.

    SOUNDING  the pitch's fingerprint over its span exceeds that pitch's own
              Otsu threshold. This answers "is anything there", and it is what
              catches an omitted note.

    STRUCK    the pitch's RISE in the opening of its span exceeds its own
              adaptive attack threshold, and is larger than the rise of every
              semitone neighbour in the same window.

    The second test is the one level cannot do. A note left ringing from
    earlier is decaying, so its rise is zero no matter how loud it still is; a
    freshly struck note is rising, no matter how quiet. Comparing rises rather
    than levels therefore separates "this key was pressed now" from "a louder
    neighbour is still sounding" -- the case that defeats a level comparison
    whenever the written note is played more softly than its neighbour was.
    """
    seconds = config.seconds_per_frame()
    frames = evidence.fingerprint.shape[1]
    out = []
    for event in events:
        start, end = spans[event.index]
        if end <= start:
            out.append(Verdict(event.index, "unscored", event.pitches, (),
                               start * seconds, end * seconds, -np.inf))
            continue
        span = slice(start, end)
        # Attacks sit at the start of a note. Look just before the boundary,
        # to tolerate alignment error, and into the opening fraction of the
        # note's own span, so the window scales with tempo.
        opening = max(1, int(round(config.attack_window_fraction * (end - start))))
        attack_window = slice(max(0, start - config.attack_lookback_frames),
                              min(frames, start + opening))

        present, substitutes, margins = [], [], []
        for pitch in event.pitches:
            if pitch not in evidence.index_of:
                continue
            row = evidence.index_of[pitch]
            level = float(evidence.fingerprint[row, span].max())
            rise = float(evidence.attack[row, attack_window].max())

            rivals = {}
            for offset in range(-config.neighbourhood_semitones,
                                config.neighbourhood_semitones + 1):
                other = pitch + offset
                if offset == 0 or other in event.pitches:
                    continue
                if other not in evidence.index_of:
                    continue
                rivals[other] = float(
                    evidence.attack[evidence.index_of[other], attack_window].max())
            loudest = max(rivals, key=rivals.get) if rivals else None

            sounding = level > evidence.threshold[row]
            struck = (rise > evidence.attack_threshold[row]
                      and (loudest is None or rise >= rivals[loudest]))
            # Reported margin is the quantity the verdict turned on.
            margins.append(rise - (rivals[loudest] if loudest is not None
                                   else evidence.attack_threshold[row]))

            if sounding and struck:
                present.append(pitch)
            elif loudest is not None and rivals[loudest] > \
                    evidence.attack_threshold[evidence.index_of[loudest]]:
                # Something adjacent was struck here and the written pitch was
                # not: a substitution, and we can name what was played.
                substitutes.append(loudest)

        if len(present) == len(event.pitches):
            status = "ok"
        elif substitutes:
            status = "wrong"
        elif present:
            status = "partial"
        else:
            status = "missing"
        out.append(Verdict(event.index, status, event.pitches,
                           tuple(sorted(present or substitutes)),
                           start * seconds, end * seconds,
                           min(margins) if margins else -np.inf))
    return out


def performance_extent(evidence: Evidence, config: Config) -> tuple[int, int]:
    """First and last frame that actually contain playing.

    Derived from the recording's own onset envelope by an Otsu split, so a
    quietly recorded take and a loud one are cropped by the same rule.
    """
    onset = evidence.onset
    cut = otsu_threshold(onset[onset > 0]) if (onset > 0).any() else 0.0
    active = np.flatnonzero(onset >= cut)
    if active.size == 0:
        return 0, onset.shape[0]
    first = int(active[0])
    last = min(onset.shape[0], int(active[-1]) + config.tail_frames)
    return first, max(first + 1, last)


def crop(evidence: Evidence, first: int, last: int) -> Evidence:
    return Evidence(pitches=evidence.pitches,
                    fingerprint=evidence.fingerprint[:, first:last],
                    onset=evidence.onset[first:last],
                    attack=evidence.attack[:, first:last],
                    threshold=evidence.threshold,
                    attack_threshold=evidence.attack_threshold,
                    scale=evidence.scale, index_of=evidence.index_of)


def analyse(path: str, model_name: str, config: Config | None = None):
    config = config or Config()
    score = get_score_model(model_name)
    waveform = load_audio(path, config.sample_rate)
    waveform, _ = librosa.effects.trim(waveform, top_db=55.0)

    events = build_events(score)
    span = range(min(min(e.pitches) for e in events) - config.neighbourhood_semitones,
                 max(max(e.pitches) for e in events) + config.neighbourhood_semitones + 1)
    pitches = np.array(sorted(span))

    evidence = build_evidence(waveform, pitches, config)
    first, last = performance_extent(evidence, config)
    inside = crop(evidence, first, last)
    spans = viterbi(events, inside, config)
    verdicts = grade(events, spans, inside, config)
    # Report times in the original recording's clock.
    offset = first * config.seconds_per_frame()
    for v in verdicts:
        v.start_seconds += offset
        v.end_seconds += offset
    return verdicts, inside


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    arguments = parser.parse_args()

    verdicts, evidence = analyse(arguments.audio, arguments.model)
    print(f"adaptive presence threshold : {evidence.threshold.min():5.1f} to "
          f"{evidence.threshold.max():5.1f} dB  (per-pitch Otsu)")
    print(f"adaptive attack threshold   : {evidence.attack_threshold.min():5.1f} to "
          f"{evidence.attack_threshold.max():5.1f} dB  (per-pitch Otsu on rises)")
    print(f"adaptive decision scale     : {evidence.scale.min():5.1f} to "
          f"{evidence.scale.max():5.1f} dB  (per-pitch MAD)")
    print(f"\n{'ev':>3} {'status':<9} {'expected':<16} {'heard':<16} "
          f"{'margin':>7}  time")
    for v in verdicts:
        expected = ",".join(midi_note_name(p) for p in v.expected)
        heard = ",".join(midi_note_name(p) for p in v.observed) or "-"
        print(f"{v.event:>3} {v.status:<9} {expected:<16} {heard:<16} "
              f"{v.margin_db:>7.1f}  {v.start_seconds:5.2f}-{v.end_seconds:5.2f}s")
    counts: dict[str, int] = {}
    for v in verdicts:
        counts[v.status] = counts.get(v.status, 0) + 1
    print("\n" + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main()

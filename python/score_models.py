"""Standalone score data for the iterative harmonic HMM."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreTrack:
    """One ordered musical line; MIDI 0 represents a written rest."""

    pitches: tuple[int, ...]
    durations_beats: tuple[float, ...]

    def __post_init__(self) -> None:
        if len(self.pitches) != len(self.durations_beats):
            raise ValueError("A track needs one duration for every pitch.")
        if any(not 0 <= pitch <= 127 for pitch in self.pitches):
            raise ValueError("MIDI pitches must be between 0 and 127.")
        if any(duration <= 0 for duration in self.durations_beats):
            raise ValueError("Every duration must be positive.")

    @property
    def total_beats(self) -> float:
        return float(sum(self.durations_beats))

    @property
    def is_empty(self) -> bool:
        return not self.pitches


@dataclass(frozen=True)
class ScoreModel:
    """The score information needed to initialize an HMM."""

    name: str
    reference_bpm: float
    melody: ScoreTrack
    harmony: ScoreTrack

    def __post_init__(self) -> None:
        if self.reference_bpm <= 0:
            raise ValueError("Reference BPM must be positive.")
        if self.melody.is_empty:
            raise ValueError("A score must contain a melody.")
        if not self.harmony.is_empty and self.harmony.total_beats > self.melody.total_beats + 1e-9:
            raise ValueError("Harmony cannot extend beyond the melody.")

    @property
    def has_harmony(self) -> bool:
        return not self.harmony.is_empty

    @property
    def total_beats(self) -> float:
        return self.melody.total_beats


EMPTY_TRACK = ScoreTrack((), ())
REFERENCE_BPM = 60.0 / 0.44  # Approximately 136.36 BPM.


def ode_to_joy_melody() -> ScoreTrack:
    """Bars 1-4. The phrase ends on a quarter note plus a quarter rest.

    Previously encoded as a half note. The attack points are identical either
    way, so this does not move a boundary -- an event runs to the next attack,
    not to the end of its notated value -- but the written score has the note
    released halfway through the bar and the model should say so.
    """
    pitches = (64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 0)
    durations = (1.0,) * 12 + (1.5, 0.5, 1.0, 1.0)
    return ScoreTrack(pitches, durations)


def ode_to_joy_harmony() -> ScoreTrack:
    """One whole note per bar, as written on the performers' sheet.

    Earlier this was encoded as a two-beat note followed by a two-beat rest.
    The attack points were right, but the bass was marked silent for the back
    half of every bar -- so a note the performer was still holding counted as
    absent, and the partials it was still contributing were treated as
    belonging to nothing.
    """
    return ScoreTrack((48, 55, 48, 55), (4.0,) * 4)  # C3 G3 C3 G3


def ode_to_joy_full_melody() -> ScoreTrack:
    """Both eight-bar phrases (32 beats).

    The second phrase is identical to the first until its final cadence, which
    settles on C4 instead of hanging on D4.
    """
    phrase_one = (64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 0)
    phrase_two = (64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, 0)
    durations = (1.0,) * 12 + (1.5, 0.5, 1.0, 1.0)
    return ScoreTrack(phrase_one + phrase_two, durations * 2)


def ode_to_joy_full_harmony() -> ScoreTrack:
    """Whole notes per bar, except the final bar, which is G then C.

    The sheet ends bar 8 with two half notes -- G resolving to C. The previous
    encoding stopped at G and left the last two beats as a rest, so the closing
    C3 was missing from the score entirely and could never be graded.
    """
    pitches =   (48, 55, 48, 55, 48, 55, 48,  55,  48)
    durations = (4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 2.0, 2.0)
    return ScoreTrack(pitches, durations)


def fur_elise_melody() -> ScoreTrack:
    pitches = (
        76, 75, 76, 75, 76, 71, 74, 72, 69,
        60, 64, 69, 71, 64, 68, 71, 72, 64,
        76, 75, 76, 75, 76, 71, 74, 72, 69,
        60, 64, 69, 71, 64, 72, 71, 69,
    )
    durations = (
        0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.0,
        0.5, 0.5, 0.5, 1.0, 0.5, 0.5, 0.5, 1.0, 0.5,
        0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.0,
        0.5, 0.5, 0.5, 1.0, 0.5, 0.5, 0.5, 1.0,
    )
    return ScoreTrack(pitches, durations)


def fur_elise_harmony() -> ScoreTrack:
    pitches = (0, 45, 52, 57, 40, 52, 56, 45, 52, 57, 0, 45, 52, 57, 40, 52, 56, 45)
    durations = (4.0, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5,
                 2.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 1.0)
    return ScoreTrack(pitches, durations)


ODE_TO_JOY_WITH_HARMONY = ScoreModel(
    "ode_to_joy_with_harmony", REFERENCE_BPM, ode_to_joy_melody(), ode_to_joy_harmony()
)
ODE_TO_JOY_WITHOUT_HARMONY = ScoreModel(
    "ode_to_joy_without_harmony", REFERENCE_BPM, ode_to_joy_melody(), EMPTY_TRACK
)
ODE_TO_JOY_FULL_WITH_HARMONY = ScoreModel(
    "ode_to_joy_full_with_harmony", REFERENCE_BPM,
    ode_to_joy_full_melody(), ode_to_joy_full_harmony()
)
ODE_TO_JOY_FULL_WITHOUT_HARMONY = ScoreModel(
    "ode_to_joy_full_without_harmony", REFERENCE_BPM,
    ode_to_joy_full_melody(), EMPTY_TRACK
)
FUR_ELISE_WITH_HARMONY = ScoreModel(
    "fur_elise_with_harmony", REFERENCE_BPM, fur_elise_melody(), fur_elise_harmony()
)
FUR_ELISE_WITHOUT_HARMONY = ScoreModel(
    "fur_elise_without_harmony", REFERENCE_BPM, fur_elise_melody(), EMPTY_TRACK
)

SCORE_MODELS = {
    model.name: model
    for model in (
        ODE_TO_JOY_WITH_HARMONY,
        ODE_TO_JOY_WITHOUT_HARMONY,
        ODE_TO_JOY_FULL_WITH_HARMONY,
        ODE_TO_JOY_FULL_WITHOUT_HARMONY,
        FUR_ELISE_WITH_HARMONY,
        FUR_ELISE_WITHOUT_HARMONY,
    )
}


def get_score_model(name: str) -> ScoreModel:
    try:
        return SCORE_MODELS[name]
    except KeyError as error:
        choices = ", ".join(sorted(SCORE_MODELS))
        raise ValueError(f"Unknown score {name!r}. Available: {choices}") from error


def midi_note_name(midi_note: int) -> str:
    if midi_note == 0:
        return "Rest"
    names = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    return f"{names[midi_note % 12]}{midi_note // 12 - 1}"


def describe_score(model: ScoreModel) -> str:
    harmony_events = len(model.harmony.pitches) if model.has_harmony else 0
    return (
        f"{model.name}: {model.total_beats:g} beats, "
        f"{len(model.melody.pitches)} melody events, "
        f"{harmony_events} harmony events, {model.reference_bpm:.2f} BPM"
    )


if __name__ == "__main__":
    for model in SCORE_MODELS.values():
        print(describe_score(model))

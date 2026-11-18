# Notes Feedback: VexFlow Implementation Contract

**Audience:** an AI coding agent or developer implementing score-following notes feedback in this repository.

**Status:** specification and build plan. The VexFlow dependency is installed, but no VexFlow UI has been built yet.

**Renderer decision:** VexFlow 5.2.0. Do not replace it with a custom staff, OSMD, abcjs, Verovio, or another renderer without explicit approval.

---

## Read This First

This feature must be built in the phases below, in order.

After each phase:

1. Run that phase's verification.
2. Record what was checked and what failed.
3. Stop and report at the phase gate.
4. Do not start the next phase until the current phase's Definition of Done is satisfied.

Do not implement the entire feature in one pass. Do not mark a phase complete because TypeScript compiles. UI phases require browser verification at the specified screen sizes. Timing phases require a real recording. Data phases require inspecting the actual API payload.

If a phase cannot be completed correctly, stop and explain the blocker. Do not fill gaps with hardcoded note names, fake playback positions, or cosmetic fallbacks.

---

## 1. What We Are Trying to Achieve

The Notes tab should become a real, playable score view.

A learner should be able to:

- See the notes they were supposed to play, in the correct octave and on the correct staff.
- See both hands at the same time, with chords kept together.
- Follow a playhead that moves with their uploaded recording.
- See which notes are currently sounding, including notes that are held through later attacks.
- Tell which individual notes were correct, wrong, missing, or extra.
- Tap a note or beat to jump to it in the recording.
- Understand the feedback on a phone without scrolling the page.

The important change is from a decorative diagram to a score-following practice view.

---

## 2. What We Need to Achieve

### Required outcomes

- The score comes from the analyzer's real score model, not from the first pitch of the first nine evaluation events.
- Pitch placement uses written note spelling and staff position, not linear MIDI spacing.
- Melody and harmony are assigned to treble and bass staves from the score tracks, not from `midi >= 60`.
- Chords display every note in the chord.
- Note duration comes from the score, not the gap until the next attack.
- The playhead is driven by the uploaded audio's clock.
- The visible page contains complete measures, not an arbitrary slice of note count.
- The layout fits the one-screen phone constraint at 375x553 and 320x568.
- The feature remains accessible without relying on color alone.

### Required data

The frontend cannot solve this correctly with the current event payload alone. The analyzer must expose:

- Score notes with pitch, spelling, hand, start beat, duration, measure, and beat within measure.
- Meter, key, pickup, and reference tempo metadata.
- Per-note match results, not only event-level results.
- Trusted timing anchors for audio-to-score synchronization.

### Explicit non-goals for this feature

- Building a general-purpose notation editor.
- Importing arbitrary MusicXML.
- Recording through the microphone.
- Changing the tempo, rhythm, accuracy, upload, or progress screens.
- Reintroducing the removed legacy review screen.
- Building a full piano-roll editor.
- Supporting every score in the world.

---

## 3. What We Currently Have

### UI

- The feedback screen has four tabs: Accuracy, Tempo, Rhythm, Notes.
- Notes currently contains two small side-by-side panels: a decorative staff map and an accuracy grid.
- The layout is intentionally compact but not musically correct.
- The old `Open take review` button, review route, and `components/cadence/review-screen.tsx` have been removed.
- Supporting legacy review components still exist on disk but are unreachable. Do not re-add the old screen.

### Current staff implementation

`NoteStaff` and `NoteGrid` live inside `app/page.tsx`.

The staff:

- Takes only `events.slice(0, 9)`.
- Picks one pitch per event with `[...event.expected, ...event.observed].find(...)`.
- Therefore picks the first sorted expected pitch. At the first chord, `[45, 69]` becomes `45` (A2) instead of `69` (A4).
- Uses one treble clef for all notes.
- Normalizes MIDI from the minimum to maximum of those nine notes.
- Uses linear semitone spacing instead of diatonic staff positions.
- Has no ledger lines, bass clef, rests, ties, or real durations.
- Spaces notes evenly by event index rather than time.

The grid:

- Also picks one pitch per event.
- Places bars by event index, not timestamp.
- Uses `event.beats` for bar height. `event.beats` is the time until the next attack, not the notated duration.

### Current analyzer data

The Python score models contain real melody and harmony tracks.

For Für Elise:

- 35 melody notes.
- 18 harmony notes.
- 40 combined attack events.
- Total score length: 20.5 beats.
- The first chord at beat 4 is `[45, 69]`: A2 in the left hand and A4 in the right hand.

`build_events()` combines melody and harmony attacks into events. It currently discards:

- Track/hand identity.
- Notated note duration.
- Measure and beat-within-measure.
- Note spelling and key context.

`AlgorithmEvent` exposes:

```ts
{
  event: number
  start_beat: number
  beats: number
  status: 'ok' | 'partial' | 'wrong' | 'missing' | 'unscored'
  expected: number[]
  observed: number[]
  start_seconds: number
  end_seconds: number
  margin_db: number | null
}
```

The grader returns event-level results. Its combined `observed` value cannot represent every case where one chord note is correct and another is wrong. That must be fixed before per-note coloring can be trustworthy.

### Current timing

- Every event has `start_seconds` and `end_seconds` from the analyzer.
- `start_seconds` includes the analyzer's trim/performance offsets and is intended to align with the uploaded audio.
- The feedback screen has an `<audio>` element and tracks `currentTime`.
- The Notes tab does not receive that clock today.
- The existing player says playback position is shared across tabs, but the note view is not using it.
- A fixed BPM must not be used for the playhead. The recording can have rubato and timing drift.

### Current metadata problem

The song card says `Opening section · 16 bars · 72 BPM`, but the Für Elise model is 20.5 beats at 136.36 BPM. That copy is not derived from the score. Do not rely on it for layout, measure counts, or cursor timing.

### Tooling

- React 19 / Next 16.
- pnpm.
- TypeScript.
- No automated test suite is configured.
- No MusicXML pipeline.
- VexFlow 5.2.0 is installed but not imported yet.
- Existing custom Web Audio helpers are in `lib/piano-audio.ts`.
- Existing custom MIDI naming is in `lib/performance.ts` and is sharp-only.

---

## 4. What We Are Trying to Have

| Area | Current | Target |
| --- | --- | --- |
| Score source | First pitch from first 9 events | Full analyzer score-note payload |
| Staff | One decorative treble staff | Real grand staff, with clefs and ledger lines |
| Pitch | Linear MIDI normalization | Diatonic staff placement with spelling and accidentals |
| Hands | Mixed and inferred badly | Explicit melody/treble and harmony/bass tracks |
| Chords | One pitch only | Every chord tone, grouped at one onset |
| Duration | Next-attack gap | Notated duration from the score |
| Measures | None | Real bar lines and measure numbers |
| Playhead | None | Audio-driven cursor with active-note highlighting |
| Sustained notes | Ignored | Highlighted for their full notated duration |
| Results | Event-level color | Per-note matched/wrong/missing/extra states |
| Navigation | Nine fixed notes | Complete measures, paged or auto-followed |
| Mobile | Two tiny panels | One full-width readable staff |
| Data fallback | Hardcoded fallback notes | No fake fallback when a real evaluation exists |

---

## 5. Chosen Technical Approach

### VexFlow for engraving

Use VexFlow 5.2.0 for:

- Staves and grand-staff systems.
- Clefs and key signatures.
- Notes, chords, rests, stems, beams, ties, and ledger lines.
- Accidentals.
- Per-note styling.

VexFlow is a renderer, not a playback engine. Keep the existing audio element and Web Audio helpers.

Implementation constraints:

- Import VexFlow dynamically in a client component so it is never server-rendered.
- Load the VexFlow fonts before drawing.
- Re-render on width changes with a `ResizeObserver`.
- Render the score once per visible page. Do not rebuild the VexFlow scene on every animation frame.
- Use an SVG/HTML overlay for the playhead, not a VexFlow note.
- Style individual noteheads with VexFlow's per-note/per-key styling APIs. Do not color an entire chord when only one note is wrong.

### Existing audio for playback

- Keep the existing uploaded audio as the source of truth for playback.
- Use `audio.currentTime` to drive the cursor.
- Use `requestAnimationFrame` while playing. Do not rely on `timeupdate` alone for a smooth cursor.
- Reuse the existing playback position when switching tabs.

### Custom timing layer

The frontend must map audio time to score beat using the analyzer's event timestamps.

Do not use:

```ts
beat = seconds * averageBpm / 60
```

That will drift on any expressive take.

Use trusted event anchors and piecewise interpolation:

```text
event 0: 0.441s @ beat 0
event 1: 0.673s @ beat 0.5
event 2: 0.998s @ beat 1
...
```

For a time between anchors, interpolate. Clamp before the first and after the last anchor. If the analyzer reports `misaligned`, do not present the cursor as authoritative.

### No new library for pitch theory in the first version

The score model should carry the intended spelling. Do not derive spelling from raw MIDI if the score already knows whether a note is D-sharp or E-flat. Tonal or similar can be considered later, but it is not required for this implementation.

---

## 6. Definitions

Use these definitions consistently in code and UI.

| Term | Meaning |
| --- | --- |
| Score note | A notated note in the reference score, with pitch, spelling, hand, start beat, and duration. |
| Event | An analyzer attack point, possibly containing a chord. Events are useful for grading and timing but are not the same as score notes. |
| Voice | A musical line. In this project: `melody` or `harmony`. |
| Staff | The five-line staff where a voice is drawn. Melody maps to treble; harmony maps to bass for the current scores. |
| Onset | The moment a note begins. |
| Duration | The notated length of a note in beats, independent of when the next note starts. |
| Anchor | A trusted event timestamp used to map audio time to score beat. |
| Playhead | The vertical cursor showing the current position in the score. |
| Active note | A score note whose start/duration range contains the current cursor beat. |
| Matched | The expected pitch was heard at this event. |
| Wrong | A different pitch was struck at this onset. |
| Missing | The expected note was not heard. |
| Extra | A pitch was heard that is not in the score at this point. |
| Page | A visible group of complete measures. Paging is not scrolling. |

---

## 7. Required Data Contract

The exact names can change, but the information cannot.

### 7.1 Score metadata

The evaluation response needs score metadata:

```ts
type ScoreMeter = {
  beatsPerBar: number
  beatUnit: number          // 4 = quarter, 8 = eighth
  pickupBeats: number       // 0 if there is no anacrusis
}

type ScoreInfo = {
  id: string                // stable score/model id
  title: string
  composer: string
  referenceBpm: number
  keySignature: string      // e.g. "Am" or "C"
  meter: ScoreMeter
  notes: ScoreNote[]
}
```

Do not infer the meter from a hardcoded song id in the React component. The score model must own it.

### 7.2 Score notes

```ts
type ScoreNote = {
  id: string
  midi: number
  spelling: string          // "A4", "D#5"
  voice: 'melody' | 'harmony'
  staff: 'treble' | 'bass'
  startBeat: number
  durationBeats: number
  measure: number
  beatInMeasure: number
}
```

Requirements:

- One entry per notated note. Do not collapse chords into one entry.
- `durationBeats` is the written duration, not the next-attack interval.
- `staff` comes from the score track. Do not use `midi >= 60`.
- `spelling` is authoritative for accidentals and staff placement.
- `measure` and `beatInMeasure` must be consistent with the meter and pickup.
- Rests may be represented separately or generated from gaps, but the renderer must fill each voice so measures are complete.

### 7.3 Performance results

```ts
type NoteStatus = 'matched' | 'wrong' | 'missing' | 'extra'

type NoteResult = {
  scoreNoteId: string | null  // null for an extra note
  status: NoteStatus
  expectedMidi?: number
  heardMidi?: number
  onsetSeconds: number
  releaseSeconds?: number
}
```

Requirements:

- `matched`: expected pitch was present.
- `wrong`: the onset occurred but the heard pitch differs from the expected pitch.
- `missing`: no acceptable strike for the expected note.
- `extra`: a heard pitch has no matching score note.
- For a chord with mixed results, return separate results per note. Do not collapse the whole chord to one status.
- Do not use event-level `partial` as a note color for every chord tone.

### 7.4 Timing anchors

```ts
type TimingAnchor = {
  beat: number
  seconds: number
  trusted: boolean
}
```

Use `trusted` anchors for the cursor. Untrusted/missing events can still display score notes, but must not distort the timing map.

### 7.5 Compatibility

The existing `events`, `pitch`, `noteAccuracy`, `rhythmAccuracy`, and BPM fields must remain available for the Accuracy, Tempo, Rhythm, and Progress screens. This feature must not break saved evaluations.

---

## 8. Rendering Requirements

### 8.1 Staff layout

- Use a grand staff: treble on top, bass below.
- Use the score's clefs and key signature.
- Draw real bar lines and measure numbers.
- Draw ledger lines outside the staff.
- Draw accidentals from `spelling`, not from raw MIDI.
- Group simultaneous notes into chords.
- Use separate voices where durations differ, especially when a bass note is sustained under moving melody notes.
- Split notes across bar lines and tie them when necessary.
- Generate rests where a voice has gaps, so VexFlow can justify each measure.

### 8.2 Visible page

- At 375px wide, show complete measures, not a fixed number of notes.
- Two measures is the expected default for the opening.
- At 320px, use two compact measures if readable; one measure is acceptable only if two cannot be legible without horizontal scrolling.
- At 390px and above, two to four measures are acceptable.
- On desktop, four measures are acceptable.
- Never cap the view at nine notes.
- Never make the user horizontally scroll the page to follow the cursor.

### 8.3 Note states

- Matched: normal or positive state.
- Wrong: expected note remains visible in its correct position; the heard pitch is shown separately.
- Missing: hollow/dashed expected note.
- Extra: separate marker or annotation; do not invent a score position.
- Current/sounding: clear highlight that is not solely a color change.
- Do not color every note in a chord because one note failed.

### 8.4 Playhead

- Draw a clear vertical playhead through the grand staff.
- Move it from `audio.currentTime`, not from a timer.
- Highlight all active notes at that beat, including sustained notes.
- Auto-advance to the next measure page when the playhead leaves the current page.
- Keep the cursor visually stable; do not restart the VexFlow scene for each frame.

### 8.5 Labels and legend

- Use a compact “Now: A2 + A4” readout for the current notes.
- Do not rely on labels under every notehead at phone width.
- Keep a legend for matched, wrong, missing, and extra states.
- At very narrow widths, the legend can collapse, but the text alternative must remain available.

---

## 9. Interaction and Accessibility

- Tapping a note seeks the recording to that note's onset.
- Tapping a wrong or missing note should make it easy to replay that moment. Looping is desirable but may be deferred to the final phase.
- Play/pause must remain usable on the Notes tab.
- Switching tabs must preserve playback position.
- The staff must have a text alternative summarizing the current page and active notes.
- Status must not be conveyed by color alone. Use shape, line style, labels, or a text summary.
- Keyboard users must be able to start playback and seek to the current page.
- Respect `prefers-reduced-motion` for page transitions; the audio-driven cursor is functional and may remain.

---

## 10. Non-Negotiable Build Order

Do not batch all phases into one implementation. Each phase is a checkpoint.

### Phase 0 — Baseline and guardrails

**Goal:** establish the current behavior and make sure the next change is measured against reality.

**Build:**

- Confirm VexFlow 5.2.0 is installed and locked.
- Confirm the old review route and `Open take review` button are still absent.
- Capture the current Notes tab at 375x553 and 320x568 using a real evaluation.
- Record current document height, card height, horizontal overflow, console errors, and note/event counts.
- Identify the real fixture/audio used for verification.
- Do not change the production UI in this phase.

**Verify:**

- `pnpm exec tsc --noEmit`
- `git diff --check`
- Browser loads with no console errors.
- Test records in `.data/evaluations.json` are restored after verification.

**Definition of Done:**

- [ ] Baseline measurements and screenshots exist.
- [ ] The agent can explain why the current staff is incorrect using the actual A2/A4 chord.
- [ ] No production behavior changed in this phase.

**Gate:** Stop and report the baseline before changing the Notes UI.

---

### Phase 1 — Score and result payload

**Goal:** make the analyzer provide enough correct information for a real score view.

**Build:**

- Add score metadata: meter, key, pickup, reference BPM, score id.
- Build `ScoreNote[]` from the melody and harmony tracks.
- Preserve each note's duration, voice, staff, measure, and beat position.
- Add per-note performance results, including expected and heard pitch.
- Add trusted timing anchors.
- Expose the new payload from the evaluation response without removing the existing event data.

**Verify:**

- Inspect a real Für Elise API response.
- Assert that beat 4 contains both A2 and A4.
- Assert that melody notes map to treble and harmony notes map to bass.
- Assert that note durations are written durations, not next-attack gaps.
- Test a mixed chord with one correct and one wrong note.
- Test a missing note and an extra note.
- Confirm existing Accuracy, Tempo, Rhythm, and Progress data still work.
- Run `pnpm exec tsc --noEmit`.

**Definition of Done:**

- [ ] The frontend can identify every intended note without choosing from an event array.
- [ ] The frontend can color individual chord notes independently.
- [ ] The frontend has trustworthy audio anchors.
- [ ] No old API field required by another tab has been removed.
- [ ] The response contains explicit meter and hand data; the frontend does not hardcode them.

**Gate:** Stop and report the payload shape and test output. Do not start VexFlow rendering with an incomplete payload.

---

### Phase 2 — Static VexFlow score

**Goal:** render the correct score, with no playhead yet.

**Build:**

- Add a client-side VexFlow component.
- Load VexFlow fonts before drawing.
- Render a grand staff from `ScoreNote[]`.
- Render complete measures, not note-count slices.
- Render chords with all pitches.
- Render correct spelling, accidentals, ledger lines, and note durations.
- Render bar lines and measure numbers.
- Add a visible page of two measures at phone width and a wider page at desktop.
- Replace the old decorative staff as the primary Notes view. Do not leave the old staff as a silent fallback.
- The old accuracy grid may be removed from the default view or moved behind an explicit secondary toggle. It must not remain side-by-side with the staff.
- Extract the Notes components out of `app/page.tsx` if that improves clarity.

**Verify:**

- At 375x553, the first chord shows A2 on the bass staff and A4 on the treble staff at the same horizontal position.
- D-sharp and G-sharp accidentals render where the score requires them.
- C4 and other ledger-line notes render correctly.
- Eighth-note and longer durations are visually distinct.
- No note is selected from `expected[0]`.
- No hardcoded fallback notes appear for a real evaluation.
- The staff fits without horizontal overflow.
- `pnpm exec tsc --noEmit`.

**Definition of Done:**

- [ ] The score is visually correct for the opening phrase.
- [ ] Both hands and all chord tones are present.
- [ ] Measure boundaries are correct.
- [ ] No current decorative placement logic remains in the rendered path.
- [ ] Screenshots at 375px and desktop have been reviewed.

**Gate:** Stop and report screenshots plus measured dimensions. Do not add the cursor until the static score is correct.

---

### Phase 3 — Audio clock, playhead, and paging

**Goal:** follow the recording.

**Build:**

- Pass the existing audio clock into the Notes view.
- Build a time-to-beat map from trusted anchors using piecewise interpolation.
- Drive the playhead with `requestAnimationFrame`.
- Determine active notes from `startBeat <= cursorBeat < startBeat + durationBeats`.
- Highlight sustained notes for their full duration.
- Auto-advance the visible measure page when the playhead leaves it.
- Keep playback position when switching tabs.
- Gate animation when timing is `misaligned`.

**Verify:**

- Play the real recording and check the cursor at known event timestamps.
- At the fixture's beat 4 event (approximately 2.856s), the cursor should be at the chord with A2 and A4.
- At the next anchor (approximately 3.204s), it should be at beat 4.5.
- Active notes should change at their onsets and remain active for their notated durations.
- Pause, resume, seek, and tab switching preserve the clock.
- The VexFlow scene is not rebuilt every frame.
- No console errors.

**Definition of Done:**

- [ ] The playhead follows the recording, not an assumed tempo.
- [ ] Sustained notes stay highlighted.
- [ ] The visible page follows the cursor without manual horizontal scrolling.
- [ ] Misaligned analyses are visibly qualified or have the cursor disabled.
- [ ] A browser test has verified the cursor at two known timestamps.

**Gate:** Stop and report the timing behavior. Do not add per-note error styling until the cursor is trustworthy.

---

### Phase 4 — Per-note performance states

**Goal:** make the score explain what happened.

**Build:**

- Render matched, wrong, missing, and extra states per note.
- Use per-note VexFlow styling, not whole-chord styling.
- Show the heard pitch separately for wrong notes.
- Show extra notes without inventing a score position.
- Add a “Now playing” readout.
- Add a legend and an accessible text summary.
- Make the current note/chord clearly distinguishable from correctness color.

**Verify:**

- A mixed chord with one correct and one wrong note colors only the wrong note.
- A missing chord tone is hollow/dashed while its neighboring correct notes remain normal.
- An extra note is visible and labeled as extra.
- The current chord is not confused with a wrong chord.
- Screen-reader text describes the current page and active notes.
- Color is not the only status signal.
- `pnpm exec tsc --noEmit`.

**Definition of Done:**

- [ ] Individual chord notes can have different statuses.
- [ ] Wrong and extra notes show the heard pitch, not just a color.
- [ ] Missing notes remain visible in the score.
- [ ] Status is understandable without color.
- [ ] No event-level color is applied to an entire chord as a shortcut.

**Gate:** Stop and report screenshots of each state. Do not proceed until the states are unambiguous.

---

### Phase 5 — Mobile paging, interaction, and final layout

**Goal:** make the feature usable on a phone and desktop.

**Build:**

- Finalize complete-measure paging.
- Add previous/next page controls if manual navigation is needed.
- Add tap-to-seek and, if scoped, loop-around-note behavior.
- Handle 320px width without horizontal page scroll.
- Keep the audio player visible and functional.
- Confirm the Notes tab still fits the one-screen feedback layout.
- Remove the broken two-panel default layout.
- Ensure the score is not clipped by the card.

**Verify at:**

- 375x553
- 320x568
- 390x844
- 1440x900

Checks:

- `document.documentElement.scrollWidth <= innerWidth`
- The feedback page does not gain vertical page scroll at the phone sizes.
- The staff remains legible.
- The playhead and active-note states still work after paging.
- The audio player still works after tab switching.
- No console errors.

**Definition of Done:**

- [ ] Notes fits the one-screen phone layout.
- [ ] Two-measure paging is automatic or clearly controllable.
- [ ] Tap-to-seek works.
- [ ] The score is readable at 375px and usable at 320px.
- [ ] Screenshots and numeric measurements are recorded.

**Gate:** Stop and report the full size matrix. Do not start final cleanup until mobile behavior is accepted.

---

### Phase 6 — Hardening and final verification

**Goal:** leave a reliable feature, not just a working demo.

**Build:**

- Remove the unused decorative note rendering if it is no longer reachable.
- Remove dead Notes code and unused imports.
- Confirm no old review screen or button has returned.
- Handle empty score data, missing anchors, and misaligned analyses.
- Keep all test data out of committed runtime data.
- Update this document if a decision changed during implementation.
- Do not add OSMD, abcjs, Tone, Tonal, or another dependency without approval.

**Verify:**

- `pnpm exec tsc --noEmit`
- `pnpm build`
- `git diff --check`
- Real evaluation on Für Elise both hands.
- Real evaluation on Ode to Joy if available.
- All four viewport sizes.
- Cursor timing at two anchors.
- Mixed-status, missing, and extra note cases.
- No console errors.
- No horizontal overflow.
- No vertical page scroll at 375x553 and 320x568.

**Definition of Done:**

- [ ] Every previous phase gate is still passing.
- [ ] The Notes tab uses the score payload and audio clock.
- [ ] No hardcoded note map or fake fallback is used for a real evaluation.
- [ ] The old review screen remains removed.
- [ ] The final verification log is complete.
- [ ] The implementation is ready for human review.

---

## 11. Overall Definition of Done

The feature is complete only when all of the following are true:

### Correctness

- [ ] Every score note in the visible phrase is represented.
- [ ] A2/A4 chord tones appear on the correct staves at the same onset.
- [ ] Accidentals and ledger lines are correct.
- [ ] Melody and harmony use explicit score-track assignment.
- [ ] Note durations are not derived from next-attack gaps.
- [ ] Missing, wrong, and extra notes are per-note results.
- [ ] Sustained notes remain active in the cursor state.

### Playback

- [ ] The cursor follows `audio.currentTime`.
- [ ] The cursor uses event anchors, not a fixed BPM.
- [ ] Play, pause, seek, and tab switching preserve position.
- [ ] Misaligned analyses are not presented as reliable.

### Layout

- [ ] One full-width score system replaces the two tiny side-by-side panels.
- [ ] The Notes tab fits at 375x553 and 320x568 without page scroll.
- [ ] The layout works at 390x844 and 1440x900.
- [ ] No horizontal overflow.

### Quality

- [ ] No hardcoded Für Elise notes in the production renderer.
- [ ] No fallback notes appear when real score data exists.
- [ ] No console errors.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] `pnpm build` passes.
- [ ] `git diff --check` passes.
- [ ] The verification log below is filled in.
- [ ] The old review button and screen remain removed.

---

## 12. Test Matrix

Use real analyzer output wherever possible. Fixtures are acceptable for isolated state tests, but they must not become production fallbacks.

### Score placement

- [ ] Für Elise first phrase: E5, D#5, E5, D#5, E5, B4, D5, C5, A4.
- [ ] First chord at beat 4: A2 on bass, A4 on treble, same horizontal onset.
- [ ] Subsequent C4 melody note renders with the correct ledger position.
- [ ] D# and G# accidentals render.
- [ ] Eighth-note groups are visually distinct from longer notes.
- [ ] Chords are not collapsed to one note.

### Timing

- [ ] At approximately 2.856s, the cursor is at beat 4.
- [ ] At approximately 3.204s, the cursor is at beat 4.5.
- [ ] A held bass note remains highlighted while melody notes change.
- [ ] Pausing the audio stops cursor movement.
- [ ] Resuming continues from the same position.
- [ ] Switching to Accuracy and back preserves the position.

### States

- [ ] Matched note.
- [ ] Wrong note with a different heard pitch.
- [ ] Missing note.
- [ ] Extra note.
- [ ] Mixed chord: one matched, one wrong.
- [ ] Current note vs. correct/wrong note are visually distinct.

### Responsive

- [ ] 375x553: Notes tab fits; no page scroll; no horizontal overflow.
- [ ] 320x568: Notes tab fits; no page scroll; no horizontal overflow.
- [ ] 390x844: readable layout.
- [ ] 1440x900: readable desktop layout.
- [ ] Tab labels and audio controls remain usable.

### Regression

- [ ] Accuracy tab still works.
- [ ] Tempo tab still works.
- [ ] Rhythm tab still works.
- [ ] Progress page still fits and paginates.
- [ ] Upload/evaluation flow still works.
- [ ] No old review screen is reachable.

---

## 13. Known Traps

Do not repeat these.

1. **Choosing the first expected pitch.** Chord arrays are sorted, so the first pitch may be the bass note. Render all notes.
2. **Using `midi >= 60` for hand assignment.** Use the score track.
3. **Using `event.beats` as note duration.** It is the next-attack interval.
4. **Using a fixed BPM for the cursor.** Use timing anchors.
5. **Using `timeupdate` only.** Use `requestAnimationFrame` for the playhead.
6. **Rebuilding VexFlow every frame.** Render the page once; move an overlay cursor.
7. **Trusting the grader's combined `observed` tuple for mixed chords.** Return per-note results.
8. **Treating the UI's “16 bars / 72 BPM” copy as score metadata.** It is inconsistent with the model.
9. **Inferring pickup or bar lines from beat zero.** Put meter and pickup in the score data.
10. **Shrinking the staff until it fits.** Page complete measures instead.
11. **Keeping the old two-panel layout.** It leaves too little width for real notation.
12. **Adding fake fallback notes to make the screen look full.** Show a clear empty state instead.
13. **Re-adding the old review screen.** It has been deliberately removed.
14. **Committing seeded evaluation records.** Restore `.data/evaluations.json` after browser tests.
15. **Claiming success from TypeScript alone.** UI and timing require browser verification.

---

## 14. Verification Log Template

The implementing agent must fill this in at every phase gate.

```text
Phase:
Status: PASS / FAIL / BLOCKED
Files changed:
Commands run:
  - pnpm exec tsc --noEmit:
  - pnpm build:
  - git diff --check:
Browser checks:
  - 375x553:
  - 320x568:
  - 390x844:
  - 1440x900:
Timing checks:
  - 2.856s -> beat 4:
  - 3.204s -> beat 4.5:
Functional checks:
  - chord:
  - accidentals:
  - sustained notes:
  - wrong note:
  - missing note:
  - extra note:
Console errors:
Known limitations:
Decision / next phase:
```

A phase is not complete until this log is filled in with actual results.

---

## 15. Suggested File Ownership

This is a guide, not a hard requirement.

- `app/page.tsx` — feedback tab wiring and audio clock.
- `components/notes/` — VexFlow score, playhead, note-state rendering, page controls.
- `lib/score.ts` or equivalent — score and result types, timing interpolation.
- `app/api/evaluate/route.ts` — expose the new payload without breaking existing fields.
- `python/analyze_recording.py` — serialize score notes and per-note results.
- `python/harmonic_stft_hmm.py` — preserve note identity, durations, and per-note grading.
- `python/score_models.py` — meter, key, pickup, spelling, and note metadata.
- `app/globals.css` — layout only; do not encode musical positions in CSS.

---

## 16. Handoff Rule

The next agent should start with Phase 0, not with Phase 2.

If the user asks for “the notes view fixed,” read this document first. The hard part is the score payload, per-note results, and timing map. Building a pretty staff on top of the current event data will reproduce the same wrong notes with better typography.

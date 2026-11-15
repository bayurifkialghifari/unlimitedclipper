# Editorial timeline

Status: implemented with scoped media validation; optional speech-pack runtime validation is pending.

## Source and output time

Base clips retain document version 2. The visual editor upgrades a document to version 3 when
identified scenes are submitted. Up to 32 disjoint source ranges form the output in any order.
Version 3 requires unique scene IDs and rejects repeated/overlapping source content. Version 2
retains chronological ordering, and version 1 remains a single source range. Both remain readable.
The output duration is the sum of scene lengths; the source envelope is their minimum start and
maximum end. The final output endpoint maps to the last output scene's source end, which can
differ from the envelope end. Every persisted time uses integer milliseconds.

Version 4 adds optional opening and closing cards, each lasting 300–10,000 milliseconds.
Adding a card explicitly promotes an edit and assigns stable scene IDs. Existing versions
1–3 are read without rewriting. Words, audio, video layers, crop anchors, and overlay hooks
remain on the content clock. content_duration_ms is the sum of scenes; duration_ms retains
that legacy meaning. final_duration_ms includes both cards. Source/content mapping retains
the endpoint convention above; version 4 source/output mapping returns no source throughout
cards or at the final endpoint. Scene reorder/trim preserves cards and remaps content only.

Cards have editable text, duration, bundled font, size, foreground/background colors,
vertical position, and None/Fade/Pop animation. They are silent until optional local narration
is applied. The live preview pauses the source decoder during cards and plays the registered
card WAV. Exact preview/export concatenate colored video and narration or silence around the
completed content mix. ASS/SRT/output VTT add the opening offset once; source VTT retains
source timing. Changing card text clears attached narration; applying generated speech is
revision checked and undoable. Indonesian/English M1 is the only supported voice in this slice.

The Source segments inspector applies range changes through the Rust timeline-preview endpoint.
Words retain their source timing and provenance. A word crossing a removed interval keeps its
largest surviving fragment. Visual/audio layers split across kept ranges; audio and B-roll source
offsets advance to preserve the selected material. Crop motion retains interpolated segment-start
anchors. Version 3 also anchors the last millisecond before each scene cut. Applying a remap
supports undo and uses normal revision-aware autosave. Extending into previously excluded source
coverage loads stored transcript words while preserving manual surviving edits and caption text
deleted from already covered material. Missing transcript coverage requires manual captions or
refinement. Layer fragment IDs remain stable across identical remaps.

Version 4 camera keyframes store normalized centers and zoom from 1 to 4. Text/note keyframes
store normalized position and opacity plus scale from 0.1 to 4. All use content-relative integer
milliseconds and explicit easing; cards do not shift their times. Scene remaps retain sampled
motion and easing across trim/reorder boundaries. A first manual camera keyframe converts legacy
crop-position anchors into the new track. Unedited legacy documents keep their original format.
Camera motion is available for portrait, square, and landscape; animated text/note layers are
limited to 120 seconds. Registered B-roll layers support center, zoom, and opacity motion for
up to 120 seconds and 24 anchors. Other visual layer kinds reject motion. Auto Motion can
propose camera keys from existing crop anchors or single-face samples and transcript emphasis.
The proposal is revision-bound, inspectable by time/value, and applied through Undo/Redo.

## Layers and local assets

Visual layers include text notes, punch-ins, split framing, camera corners, and local B-roll.
Each has an enabled state and output-relative timing. Text has position, size, and color controls;
framing layers expose normalized source crops. B-roll selects a registered project video and a
source offset, fills the output, and retains the original soundtrack. No footage is downloaded
automatically or fabricated. Maximum: 64 visual layers.

Audio layers select registered video audio, imported WAV/MP3/M4A/AAC/OGG/FLAC/Opus, or a synthesized
short tap. The library stores filenames, IDs, and durations in SQLite, with media kept separately.
Timing, source offset, and gain are editable. Taps start disabled and remain at most 500 ms.
Audio mixing preserves the original track and uses a limiter. Maximum: 16 audio layers.
Imports wait for heavy jobs to finish. Exports reject missing assets and offsets beyond media
duration. The current library has no standalone audio-deletion UI.

## Automatic proposals

Automatic editing freezes a clip revision and supports up to 60 seconds of output within a
ten-minute source envelope. Qwen chooses existing transcript word IDs for emphasis and notes.
Face samples can suggest a modest punch-in or a two-face split. Reaction mode adds camera corners.
No proposal silently replaces a saved edit. Apply requires the original revision and a clean draft.
Review the result; the model cannot guarantee editorial interest or identify people.

An optional camera-motion choice uses legacy crop anchors when present. Otherwise it follows
only single-face samples with bounded pan steps and skips ambiguous multi-face samples. Up to
four selected transcript words add 12-percent zoom pulses. A scene cut holds the prior framing
until its boundary. If there is no credible movement or emphasis, the proposal can contain no
camera keys. The persisted proposal shows its points and can be reopened after restart.

Verified silence removal requires the optional speech quality pack and supported Indonesian or
English captions. CTC timing is applied to the proposal while preserving manual corrections. VAD
and an energy guard protect audible reactions; surviving caption words also protect a gap. Only
interior gaps over 650 ms after 120 ms padding are candidates for removal. There is no automatic
leading/trailing silence removal. Speaker clusters are review evidence, not automatic face identity.
Overlapping speech, background music, and quiet laughter can defeat these heuristics.
Each proposal now lists the exact removed source-time gaps and total removed duration before
application. The quality pack was absent from the tested host, so an end-to-end native
silence-removal run is still pending; unit checks cover gap accounting and word protection.

## Preview and export

Render edited preview creates a 720p registered proxy from the same media composition as export.
Captions, titles, graphics, branding, audio, and cuts are baked into the proxy. Every document
change invalidates the exact render. The live canvas remains available while rendering and
when edits make the cached revision stale. See visual-editor.md for live composition limits.
Preview jobs create no export records. The preview cache is limited to 4 GiB and active asset
requests renew a two-minute lease. The open preview also renews its lease every 30 seconds.
Suspended tabs can expire; render again if their asset is unavailable. Export always uses an
immutable saved revision.

## API

- POST /api/v1/clips/{id}/timeline-preview
- POST /api/v1/clips/{id}/auto-edit
- POST /api/v1/clips/{id}/preview-render
- POST /api/v1/clips/{id}/preview-plan
- GET and POST /api/v1/assets/audio
- GET /api/v1/clips/{id}/subtitles?format=vtt&timeline=output

Android automatic editing and quality-pack installation are disabled. Android manual layer/render
behavior has not been tested. Windows native and browser validation must be recorded separately
in ../validation.md.

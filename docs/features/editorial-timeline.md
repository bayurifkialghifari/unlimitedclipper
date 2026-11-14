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

The Source segments inspector applies range changes through the Rust timeline-preview endpoint.
Words retain their source timing and provenance. A word crossing a removed interval keeps its
largest surviving fragment. Visual/audio layers split across kept ranges; audio and B-roll source
offsets advance to preserve the selected material. Crop motion retains interpolated segment-start
anchors. Version 3 also anchors the last millisecond before each scene cut. Applying a remap
supports undo and uses normal revision-aware autosave. Extending into previously excluded source
coverage loads stored transcript words while preserving manual surviving edits and caption text
deleted from already covered material. Missing transcript coverage requires manual captions or
refinement. Layer fragment IDs remain stable across identical remaps.

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

Verified silence removal requires the optional speech quality pack and supported Indonesian or
English captions. CTC timing is applied to the proposal while preserving manual corrections. VAD
and an energy guard protect audible reactions; surviving caption words also protect a gap. Only
interior gaps over 650 ms after 120 ms padding are candidates for removal. There is no automatic
leading/trailing silence removal. Speaker clusters are review evidence, not automatic face identity.
Overlapping speech, background music, and quiet laughter can defeat these heuristics.

## Preview and export

Render edited preview creates a 720p registered proxy from the same media composition as export.
Captions remain a live ASS overlay. Titles, graphics, branding, audio, and cuts are baked into the
proxy. Media changes show a stale-preview message; caption-only changes use the existing proxy.
Preview jobs create no export records. The preview cache is limited to 4 GiB and active asset
requests renew a two-minute lease. The open preview also renews its lease every 30 seconds.
Suspended tabs can expire; render again if their asset is unavailable. Export always uses an
immutable saved revision.

## API

- POST /api/v1/clips/{id}/timeline-preview
- POST /api/v1/clips/{id}/auto-edit
- POST /api/v1/clips/{id}/preview-render
- GET and POST /api/v1/assets/audio
- GET /api/v1/clips/{id}/subtitles?format=vtt&timeline=output

Android automatic editing and quality-pack installation are disabled. Android manual layer/render
behavior has not been tested. Windows native and browser validation must be recorded separately
in ../validation.md.

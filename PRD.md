# UnlimitedClipper product requirements

## Objective

Turn long YouTube videos or local files into editable, captioned clips using only the user's computer. Ship Windows 11 ARM64 and x64 first, with a desktop shell and an equivalent localhost browser interface. No API keys, monthly usage quota, cloud processing, or manually installed media dependencies are required by the installed application.

## Audience and defaults

Independent creators working on podcasts, education, interviews, and gaming videos. Default UI language is Indonesian; English is selectable. Default processing uses CPU, one heavy job at a time, multilingual Whisper small Q5_1, Economy discovery, and 1080p exports. Economy uses installed Qwen3 1.7B Q4_K_M for proposals and installed 4B for final review; one installed Qwen model handles both stages. Models download once during setup. Local processing is available offline afterward.

## Requirements

| ID     | Capability                    | Acceptance                                                                                             |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| SRC-01 | YouTube and local file import | Valid sources become persistent projects; failures expose recovery and cancellation.                   |
| AI-01  | Local model management        | Models have verified hashes, resumable downloads, disk estimates, and repair.                          |
| AI-02  | Clip discovery                | Selection references valid source boundaries, explains suggestions, and permits manual changes.        |
| TXT-01 | Multilingual transcription    | Auto-detection and selected languages produce editable timed words.                                    |
| CAP-01 | Caption editing               | Text, timing, selection, styling, highlighting, presets, and undo/redo affect saved edits and exports. |
| TTL-01 | Hook titles                   | Local generation and manual edits support presets, positioning, and timed display.                     |
| CRP-01 | Smart crop                    | Automatic face framing and manual normalized keyframes produce smooth valid crops.                     |
| GAM-01 | Gaming layout                 | Independent gameplay and facecam crops render together.                                                |
| FMT-01 | Output composition            | Portrait, square, landscape, preserved framing, and blur background work in preview and export.        |
| BRD-01 | Watermarks                    | Image/text, scale, opacity, and position persist and render correctly.                                 |
| LIB-01 | Project and clip history      | Reopening restores real source, transcript, edit revisions, and export records.                        |
| EXP-01 | Single and batch export       | MP4 plus SRT/ASS, four output resolutions, progress, cancellation, and safe completion.                |
| OPS-01 | Recovery and diagnostics      | Retries preserve completed stages; logs and storage controls have actionable feedback.                 |
| UPD-01 | Automatic updates             | Signed architecture-specific updates install only when idle after a postponable countdown.             |
| WEB-01 | Local browser studio          | Browser uploads and the same editing workflows use the same engine and SQLite database.                |

## Reliability

CAP-01 includes 18 original caption recipes, category previews, editable styling, and up to
50 named reusable styles. AI-03 adds a revision-bound local clip potential score with four
transcript-grounded dimensions and editing suggestions. It cannot predict reach or virality.
See docs/features/caption-editor.md and docs/features/clip-rating.md for limits.

EDT-02 adds a local visual editor with transcript seek/range selection, explicit video cuts,
scene reorder/split/trim, layer move/trim, zoom/snapping, keyboard equivalents, and one transaction
per completed drag. Source review follows scene order without rendering; edited review stops
when its media becomes stale. See docs/features/visual-editor.md for behavior and limits.

EDT-01 adds versioned multi-range edits, reviewable automatic proposals, source-timed caption
provenance, registered local visual/audio layers, and an edited preview sharing the export
composition. The optional quality pack must pass native inference and frontend checks before
acoustic timing or speaker quality is described as verified. See docs/features/editorial-timeline.md
and docs/features/speech-quality-pack.md for limits and actual validation boundaries.

Discovery count is a target bounded by quality and duration is a target, with complete phrases and payoff taking priority. Podcast and Gaming profiles default to a balanced interest threshold of 70. Candidates require transcript-grounded hook/payoff evidence and independent full-transcript review. At most one bounded neighboring-context pass seeks a shortfall; the result reports rejection reasons without adding filler. Zero qualifying moments is valid. Gaming audio-energy changes are search hints rather than audiovisual understanding. Uncertain new cuts can queue optional medium caption refinement without retranscribing the source.

Face framing follows edited scene order, keeps identities stable within a shot, and supports automatic two-face split layers or a constrained gaming facecam region. Manual composition layers remain editable. Active speaker detection is outside this release. Tracking commits its edit and recovery marker in one optimistic database transaction.

Use explicit job states, monotonic progress, durable checkpoints, revision conflict detection, immutable render snapshots, and validated temporary exports. Missing speech allows manual clipping. AI scores are suggestions, not guarantees of reach or accuracy. No enabled control may be a placeholder.

## Release boundary

Commercial activation and checkout follow clipping stability. macOS, Linux, and Android require separate native certification. Public internet hosting and browser-only execution of yt-dlp are outside this release.

The Android implementation now follows the Windows clipping workflow. It must process on-device
through native libraries, retain the shared Rust contracts and SQLite state, and prove real import,
caption editing, and export before being described as working. See docs/features/android.md for its
implementation sequence and verification boundary.

## Release gates

English documentation, clean lint/format/type checks, Rust checks, real media integration tests, browser interaction evidence, native ARM64 and x64 checks, update/recovery scenarios, and a recorded 60-minute 1080p benchmark. See docs/validation.md for actual evidence.

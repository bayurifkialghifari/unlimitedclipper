# UnlimitedClipper product requirements

## Objective

Turn long YouTube videos or local files into editable, captioned clips using only the user's computer. Ship Windows 11 ARM64 and x64 first, with a desktop shell and an equivalent localhost browser interface. No API keys, monthly usage quota, cloud processing, or manually installed media dependencies are required by the installed application.

## Audience and defaults

Independent creators working on podcasts, education, interviews, and gaming videos. Default UI language is Indonesian; English is selectable. Default processing uses CPU, one heavy job at a time, multilingual Whisper small Q5_1, Qwen3 4B Q4_K_M, and 1080p exports. Models download once during setup. Local processing is available offline afterward.

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

Use explicit job states, monotonic progress, durable checkpoints, revision conflict detection, immutable render snapshots, and validated temporary exports. Missing speech allows manual clipping. AI scores are suggestions, not guarantees of reach or accuracy. No enabled control may be a placeholder.

## Release boundary

Commercial activation and checkout follow clipping stability. macOS, Linux, and Android require separate native certification. Public internet hosting and browser-only execution of yt-dlp are outside this release.

## Release gates

English documentation, clean lint/format/type checks, Rust checks, real media integration tests, browser interaction evidence, native ARM64 and x64 checks, update/recovery scenarios, and a recorded 60-minute 1080p benchmark. See docs/validation.md for actual evidence.

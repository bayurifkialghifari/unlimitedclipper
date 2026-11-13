# Changelog

## Unreleased

### Added

- Four caption looks, bold/uppercase controls, phrase-aware subtitles, and stable active-word boxes.
- Per-clip local speech refinement with DTW alignment, vocabulary hints, uncertainty review, and revision-safe recovery.
- Moment focus, interest filters, grounded hook/payoff evidence, and a durable second selection review.

- Product requirements and original implementation architecture.
- Atomic Design direction and contributor readability rules.
- ESLint, Prettier, EditorConfig, and Rust workspace configuration.
- React studio pages for source import, projects, editing, processing, exports, and settings.
- Local Whisper transcription and Qwen clip/title generation, with verified model setup and repair.
- YuNet face tracking, normalized manual crop keyframes, and six output compositions.
- Editable timed captions, title presets, image/text watermarks, and bundled multilingual fonts.
- Revision-aware autosave, undo/redo, immutable single/batch exports, and durable processing checkpoints.
- Shared localhost API, managed uploads/assets, session bootstrap, and exclusive SQLite ownership.
- Signed component staging, idle activation, restart, and persistent rollback; native application updater bridge and database backups.
- Windows ARM64 installer packaging, native file dialogs, browser opening, and single-instance handling.
- Real media, browser, native desktop, and reliability validation scripts.
- GitHub quality workflows for the studio and Windows/Linux/macOS engine builds; signed Windows ARM64/x64 publishing on release tags.

### Fixed

- Bundled WebView2Loader.dll and initialized the updater plugin so the installed Windows application starts.
- Prevented recent-history limits from hiding active jobs during update and cleanup checks.
- Preserved source timing in browser caption tracks and clip-relative timing in subtitle exports.
- Prevented duplicate export records and shared-watermark deletion during recovery and cleanup.
- Synchronized the interface language from SQLite when opening another browser tab.
- Bounded long-video selection prompts and preserved completed sections by source-word offset.
- Changed selected duration to an editorial target so complete moments are not padded or cut mid-payoff; overlap resolution uses the adjusted source ranges.
- Removed non-speech annotations split across Whisper segments without shifting spoken-word timing.
- Prevented duplicate title/tracking admission and refreshed expected revisions on retry.
- Fitted image/text watermarks to the output and enabled long-line subtitle wrapping.
- Reported source-video and image-watermark failures separately from subtitle-renderer failures.
- Removed the desktop development launcher's dependency on an unstarted Vite server.
- Scoped Windows process-supervision guards to Windows builds so Unix Clippy checks do not bind a unit value.
- Replaced outdated GitHub Actions pins with supported versions that use environment files and the current Node runtime.

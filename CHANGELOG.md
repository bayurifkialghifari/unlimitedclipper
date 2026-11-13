# Changelog

## Unreleased

### Added

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

### Fixed

- Bundled WebView2Loader.dll and initialized the updater plugin so the installed Windows application starts.
- Prevented recent-history limits from hiding active jobs during update and cleanup checks.
- Preserved source timing in browser caption tracks and clip-relative timing in subtitle exports.
- Prevented duplicate export records and shared-watermark deletion during recovery and cleanup.
- Synchronized the interface language from SQLite when opening another browser tab.
- Bounded long-video selection prompts and preserved completed sections by source-word offset.
- Enforced selected clip duration before overlap resolution and named the output language explicitly.
- Removed non-speech annotations split across Whisper segments without shifting spoken-word timing.
- Prevented duplicate title/tracking admission and refreshed expected revisions on retry.
- Fitted image/text watermarks to the output and enabled long-line subtitle wrapping.
- Reported source-video and image-watermark failures separately from subtitle-renderer failures.
- Removed the desktop development launcher's dependency on an unstarted Vite server.

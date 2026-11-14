# Changelog

## Unreleased

### Added

- Window-width page headers, responsive export previews with immutable subtitle tracks, compact
  processing history, and labeled Settings action icons.
- An original video frame/cut application icon, shared by native bundle configuration, browser
  favicon/sidebar, and README, with reproducible platform icon assets.

## 0.1.0-preview.2 (2026-11-14)

### Added

- A compact global progress popup for video uploads/imports, AI model downloads, clip processing,
  and exports, with actual stages, percentages, cancellation, and terminal alerts.
- A model-registry dropdown with in-app download and optional manual file import.
- Simple update controls and a fixed native release-page opener for private preview downloads.
- Published Windows ARM64 and x64 NSIS previews with verified version-bound updater signatures,
  architecture manifests, and SHA256SUMS. Installer runtime certification remains pending.

- Version 2 editorial timelines with ordered source segments, source/output time mapping,
  source-preserving word/layer remapping, and legacy single-range edit support.
- Editable notes, punch-ins, split framing, camera corners, local B-roll, and registered local
  audio imports with timing, source offsets, volume, and optional disabled-by-default taps.
- Revision-frozen automatic editorial proposals with transcript-grounded emphasis and face-based
  framing suggestions. Applying a proposal remains explicit and supports undo.
- Shared composed preview/export rendering, a bounded preview cache with active leases, and
  preview jobs that create no export records.
- Kinetic captions, bundled glyph metrics, cut-aware phrase grouping, stable phrase text during
  short pauses, and separate estimated/aligned/manual timing provenance.
- An optional checksum-verified native speech pack and pinned ONNX export workflow. Model
  export comparisons passed in CI; native pack accuracy and speaker frontend parity are pending.
- Audited workspace cleanup, shared read-only fixture models, and real multi-cut media, browser,
  native desktop, proposal, and recovery validation helpers.
- A Windows ARM64 CI workflow for actual editorial media rendering.

### Fixed

- Release signing no longer passes both a string key and a file key to the Tauri signer.
  Both Windows preview installers passed version-bound signature and checksum verification.
- Caption/layer timing after removing source ranges, split output geometry, concat sample aspect
  ratio, original soundtrack preservation under B-roll, and proposal timing provenance.
- Retryable temporary checkpoints hidden by recent-history limits; cleanup now reports reclaimed
  bytes and protects registered temporary assets.
- Discovery can complete with zero qualifying moments and show localized guidance without
  inserting clips to fill a quota.
- MinGW debug desktop DLL linking exceeding the PE auto-export symbol limit.

### Added (earlier work)

- A manual ARM64 APK build workflow and package inspection for SDK metadata, native architecture,
  signature, checksum, and 16 KB alignment. The first debug-signed 0.1.0 preview APK is built and
  available from GitHub Actions; Android runtime remains untested.

- An Android Tauri host and native media bridge, scoped document import/export, foreground media
  processing, and a shared studio with visible preview limitations. Android runtime remains untested.

- A native execution-provider contract with capability-based job admission, durable progress, and
  cancellation that waits for completion; the existing desktop subprocess backend is preserved.

- A pinned, source-built Android media workflow with native architecture, 16 KB alignment, and
  archive-checksum gates; its ARM64 archive and the initial APK passed build inspection. Native
  media runtime validation remains pending.
- Explicit native engine configuration for application data, resources, studio files, and loopback
  ports, with an isolated-library and session-origin regression check.
- A visual README with real native screenshots, two clip examples, subtitle downloads, and an
  explicit experimental side-project status.
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

- Preserved custom word colors when the active-word box is displayed.

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

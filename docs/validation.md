# Validation evidence

## Status

The implemented clipping workflow has passed real media, browser, and native ARM64 interaction checks. This is a development validation record, not a claim that every release gate or operating system is certified. Unrun scenarios remain pending.

## Executed checks

Environment: Windows 11 on Snapdragon X ARM64, eight logical cores, approximately 16 GB RAM. Native Rust 1.100 uses the workspace LLVM-MinGW linker. Node.js 24 runs as x64 under emulation. The minimum supported Rust version is 1.92 because of the ORT dependency.

| Check                     | Result                                                    | Evidence                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust reliability suite    | PASS, ten tests                                           | Eight reliability scenarios plus bounded multilingual selection and segmented non-speech annotation parsing. Concurrent title/tracking requests admit one job.                                                                                                 |
| Real local inference      | PASS                                                      | scripts/validate-media.mjs; Whisper produced 22 timed words, Qwen selected a clip and generated a title, and YuNet wrote eight tracking keyframes.                                                                                                             |
| Six media compositions    | PASS at 720p                                              | Portrait, square, landscape, contain, blur, and gaming rendered four-second MP4 files. FFprobe checked dimensions, duration, and immutable revision.                                                                                                           |
| Browser interactions      | PASS, two tests                                           | Real upload, caption/title edit, autosave, crop keyboard movement, playback, reload, export/download, English preference in a fresh browser context, and 390-pixel layout with no overflow.                                                                    |
| Native ARM64 interactions | PASS on final installed package                           | WebView2 bridge, Windows file dialog, import, manual title editing, autosave, 1080p export, single-instance handling, and persisted exports after reopening. No JavaScript errors.                                                                             |
| Signed component update   | Earlier signature/staging/deferral/rollback checks passed | Expanded architecture, checksum, cancellation, and restart-persistence scenarios are implemented in scripts/validate-updates.mjs and pending rerun.                                                                                                            |
| Engine and desktop Clippy | PASS                                                      | Both packages and all targets checked with warnings denied after the long-input, annotation, and admission fixes.                                                                                                                                              |
| Frontend quality gate     | PASS                                                      | ESLint, Prettier, TypeScript, Vitest, and the production Vite build.                                                                                                                                                                                           |
| Batch recovery            | PASS                                                      | A real five-item render fixture preserves one completed file after cancellation. Retry finishes the batch. Restart with a missing job checkpoint, followed by explicit retry, preserves all five file hashes and modification times without duplicate records. |
| Windah long recording     | PASS for processing and export                            | An 84-minute Indonesian recording produced 6,740 timed words and five reviewed, thirty-second 1080 × 1920 H.264/AAC exports, SRT, and ASS. Every output passed full decoding and duration checks.                                                              |

Ignored local evidence includes .cache/media-validation.json, .cache/desktop-validation.json, .cache/native-studio.png, and test-results/studio-desktop.png and studio-mobile.png. Validation fixtures use JFK audio and the NASA astronaut photograph; they are test inputs, not product endorsements.

## Pending release evidence

Expanded export resolutions and styling parity, signed application installer update, physical x64 hardware validation, redistribution source inventory, and a controlled end-to-end benchmark remain pending. Packaged Linux/macOS runtime validation and release-tag publishing remain separate from the source checks below.

## GitHub quality checks

[Quality run 43419130879](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43419130879) passed on source commit 1db9dfc. The studio passed ESLint, Prettier, TypeScript, Vitest, and its production build. Engine tests and Clippy passed on windows-2025, ubuntu-24.04, macos-15-intel, and macos-15. Each engine runner also passed the workspace Rustfmt check. Windows additionally built the studio and passed desktop Clippy with warnings denied. Ignored evidence: .cache/ci-validation.json.

The first run failed because the Node setup action used a deprecated command and Unix builds bound a unit value from the Windows-only process-supervision helper. Supported action pins and conditional Windows guards fixed those failures without suppressing warnings. These CI checks do not run local inference tools or build Linux/macOS desktop installers.

## Installed application

The final Windows ARM64 NSIS installer is 213.63 MiB. It was installed into an isolated directory and tested using its bundled studio, tools, and WebView2 loader. Reopening retained the fixture export, and a second launch did not create another application instance. Ignored evidence: .cache/desktop-validation.json and .cache/native-studio.png.

The installed application was then opened against the real .data library. The Projects screen restored the Windah recording and all five final edit revisions. Playback used the 1280 by 720 proxy, and every final revision had a corresponding immutable export record. The gaming composition, title, and captions were inspected in the native preview. Ignored evidence: .cache/native-windah-handoff.json and .cache/native-windah-library.png.

Standard NSIS installer messages support Indonesian. Tauri's additional installer messages currently fall back to English because an Indonesian custom-message dictionary is not supplied. The studio's Indonesian and English dictionaries are independent of this installer limitation.

## Development launcher

The engine and Vite started successfully in an isolated development directory. Ctrl+C stopped both owned services. Neither development port remained listening afterward. Windows shutdown uses the owned child process trees so Cargo cannot leave an engine holding the data-directory lock.

## Real Indonesian recording

Source: [Windah Basudara's completed Sunnybrook recording](https://www.youtube.com/watch?v=qTJIbYC2mFc). No live broadcast was active during source selection. The original is 1920 × 1080, approximately 84 minutes 10 seconds, and 1,311,495,538 bytes. Processing stayed local after the yt-dlp download.

The first full-resolution preview was cancelled. A retry reused the completed download and built a 1280 × 720, 30 fps proxy. Local transcription completed. The first selection attempt exceeded the model context; bounded phrase windows fixed that failure. A later cancellation preserved transcription and the first completed selection section, and retry finished the remaining thirteen sections.

Five clips retain integer source times and use thirty-second durations. Titles and framing were reviewed manually. Facecam position differs between sections: one selected section uses the lower-right source region and four use the lower-left region. All use the gaming split layout. Existing partial non-speech annotations were removed from these edits; the parser regression prevents the same fragment leak in new transcriptions. Some ASR words required manual corrections. Verbatim caption accuracy still requires editorial review.

Ignored evidence: .cache/windah-selection.json, .cache/windah-export-validation.json, .cache/windah-generation-resources.json, and .data/deliveries/windah-2026-11-13/clips.json. Delivery files include five MP4/SRT/ASS sets. Original immutable exports remain separate from later edit revisions.

Sampled process-tree working sets peaked at approximately 1.34 GiB during transcription and 5.96 GiB during selection. Transcription samples span about seventeen minutes; the final selection retry samples span about sixteen minutes. Monitoring started after the original preview attempt and excludes parts of the retry sequence. These measurements do not establish a clean sixty-minute benchmark or total system memory use.

## Caption and highlight quality, 2026-11-13

The follow-up uses the existing Windah recording and separate derived fixtures. Earlier immutable exports remain available. This is Windows ARM64 evidence; recognition accuracy, silent visual events, and other operating systems are not certified by these checks.

[Quality CI for source commit ba99323](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43433214186) passed all five jobs: studio checks and engine checks on Windows, Ubuntu, macOS Intel, and macOS ARM. These are build/lint/test results, not native media certification on those other systems. The final ARM64 application folder was refreshed with the rebuilt executable; startup and a rendered custom-word-color box passed separately.

| Check                   | Result       | Evidence                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine regressions      | PASS         | Seven unit tests and ten reliability tests: subwords, original audio timing, annotation suppression, equal anchors, legacy JSON, quote grounding, complete phrase boundaries, caption silence, optimistic saves, and committed-caption recovery.                                                                           |
| Browser workflow        | PASS         | Both Playwright workflows passed with real imports, keyboard caption looks, preserved position, autosave, playback, export, English settings, and 390 px layout.                                                                                                                                                           |
| Per-clip refinement     | PASS         | Small and medium ran on real audio. Medium was hash-verified by the engine. Four looks, keyboard activation, actual media seek to the first uncertain word, SSE completion, and caption-model display were exercised on Windah cuts.                                                                                       |
| Caption renders         | PASS         | Four ASS looks rendered using bundled fonts; active-word boxes and phrase text were visually inspected. Two final 1080 × 1920 exports include audio and passed complete FFmpeg decoding.                                                                                                                                   |
| Highlight review        | PASS, scoped | A 38-second derived Windah fixture requested a maximum of four 30-second clips at threshold 70. The two-pass local workflow returned one 8.5-second reaction at score 75; review candidates and completed offsets persisted. This proves filtering and boundary behavior on this fixture, not universal editorial quality. |
| Native caption workflow | PASS         | The rebuilt ARM64 executable and current studio ran in an isolated application folder with bundled tools. Native bridge, four looks, keyboard activation, actual word seek, medium refinement, preserved style, and completion passed without page errors.                                                                 |
| Current installer       | Pending      | The first follow-up NSIS build completed. The tested application folder then received subsequent executable/studio fixes; that refreshed folder is not a newly verified installer. Production signing and publishing remain pending.                                                                                       |
| Strict no-result path   | PASS         | A second real selection run used the default threshold 85 and a focus requiring absent visual evidence. It returned the explicit no-moments guidance without creating filler clips.                                                                                                                                        |

Final delivery: .data/deliveries/windah-refined-2026-11-13/. The escape cut is 10.4 seconds and the dinosaur reaction is 8.7 seconds, with MP4/SRT/ASS sidecars and inspected frames. These were manually shortened to remove introductions, silence, and repeated aftermath. They are not presented as unedited AI selections. Corrections include the game term Jurassic, kocak, and a joined Dino-Dino phrase. Uncertain speech remains editable; no word-error-rate or exact audio-alignment certification is claimed.

Ignored evidence: .cache/caption-ui-validation.json, .cache/caption-studio-desktop.png, .cache/caption-studio-mobile.png, .cache/highlight-selection-validation.json, .cache/strict-selection-validation.json, .cache/native-caption-validation.json, .cache/native-caption-studio.png, .cache/caption-color-validation.json, .cache/caption-custom-color.png, .cache/native-caption-final.png, and the delivery clips.json. Model experiments and competitor reference media remain in ignored cache.

The anti-slop gate for changed controls uses DESIGN.md as direction, actual transcript samples in look buttons, visible focus/pressed states, Indonesian/English dictionaries, bounded typography, and real interactions. The position-reset and review-seek failures found during interaction testing were fixed and retested. The project-wide delivery gate below remains partial where broader checks are unrun.

## README presentation

The README now contains three screenshots captured from the actual native ARM64 application, two
reviewed clip exports, and frame-derived poster images. Media lives in committed `docs/media/`, so a
fresh checkout can resolve it. Both README MP4 copies passed 720 × 1280 geometry, audio presence,
duration, and complete FFmpeg decoding checks. Chromium played both files from a local documentation
preview.

GitHub's Markdown API rendered the source successfully. Thirty local link/image references resolved,
and all navigation anchors matched real headings. A local preview of that rendered HTML, with
GitHub-style image/table sizing and heading anchors, was exercised at 1100 and 390 pixels: images
loaded, the library disclosure opened, the setup anchor navigated, and the page had no horizontal
overflow. This local preview is not a claim of testing the authenticated GitHub page on a phone.

`npm run check` passed after the documentation/media changes. The README anti-slop gate is scoped to
this deliverable: original product imagery, real source attribution, explicit manual-review and
experimental status, named links, image alternatives/dimensions, and static previews with optional
video playback. No invented statistics, endorsements, release readiness, or platform certification
were added. The broader application gate below retains its existing pending checks.

Ignored evidence: `.cache/readme-capture-evidence.json`, `.cache/readme-media-evidence.json`,
`.cache/readme-validation.json`, `.cache/readme-github.html`, and the local preview screenshots.

## Android build foundation

EngineConfig and start_with_config allow a native host to provide private data/resource directories
and a loopback port without mutating process-wide environment variables. The existing desktop
startup delegates to the same configuration while preserving its previous defaults. A real loopback
regression checks resource serving, a private empty library, an assigned port, authorized bootstrap,
and rejection of another local origin.

Seven Rust unit tests and eleven reliability tests passed on Windows ARM64. Rustfmt, engine Clippy
with warnings denied, and npm run check passed. The engine cross-build for aarch64-linux-android
completed with Android NDK r28c. This is not an APK or an Android runtime test.

The intended phone is Snapdragon 8+ Gen 1 with 12 GB RAM. Per the owner's request, initial Android
work is build-only: no local Android device or emulator processing tests are being run. The native
media archive and APK are still in progress. Provisional requirements are recorded in android.md;
memory, speed, heat, and battery claims remain unmeasured.

The README/media commit ccb5173 passed all five jobs in
[quality run 43440150500](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43440150500).
That run predates the native configuration changes.

## Required scenarios

- ARM64 and x64 imports, local speech inference, clip selection, and rendering.
- Indonesian/English speech fixtures and multilingual glyph rendering.
- Caption timing, crop interpolation, split composition, watermarks, and preview/export agreement.
- Cancellation, corrupted input, missing speech, disk exhaustion, interrupted downloads, crash recovery, and partial batch retry.
- Revision conflicts, autosave, undo/redo, and immutable exports.
- Signed update rejection/acceptance, architecture selection, job deferral, component rollback, and migration recovery.
- Keyboard operation, narrow layouts, reduced motion, and every enabled control's effect.
- A 60-minute 1080p benchmark on the 16 GB ARM64 machine, reporting time and peak memory.

## Anti-slop delivery gate

| Block                         | Status  | Evidence                                                                                                                     |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Direction and sourced content | Defined | DESIGN.md, docs/research.md, and PRD.md.                                                                                     |
| Hard gate                     | Partial | Browser and native clipping interactions passed. Full accessibility, contrast, and control-by-control checks remain pending. |
| Purpose gate                  | Defined | One-line design purposes in DESIGN.md; recheck actual implementation.                                                        |
| Liveliness                    | Partial | Browser and native studio screens inspected. The complete screen and motion review remains pending.                          |
| Craftsmanship                 | Partial | Build, native behavior, and batch recovery passed. Expanded styling parity and release checks remain pending.                |

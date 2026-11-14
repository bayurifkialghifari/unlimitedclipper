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
media archive and ARM64 APK have passed compilation and inspection, as recorded below. Provisional
requirements are recorded in android.md; memory, speed, heat, and battery claims remain unmeasured.

The README/media commit ccb5173 passed all five jobs in
[quality run 43440150500](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43440150500).
That run predates the native configuration changes.

## Android host and studio

The Tauri application and native plugin cross-compiled and passed Android-target Clippy. The
Windows desktop shell passed Clippy after extracting its startup into a shared library entry point.
The Android source includes scoped picker copying, registered-asset saving, native completion
callbacks, foreground processing, and disabled unsupported controls in both dictionaries. Kotlin
compilation and APK inspection passed in the ARM64 preview build recorded below.

Anti-slop direction follows DESIGN.md. The existing UC text icon is reused; the generated Tauri
logo was removed. Loading, cancellation, unsupported-state copy, and export feedback are implemented
in source. Android interaction, accessibility, breakpoint, keyboard/touch, reduced-motion, and
native media checks remain pending. None of these Android interaction gates is marked PASS.

## Native execution contract

The Windows ARM64 host suite passed seven unit tests, eleven reliability tests, and two native
provider orchestration tests. The latter use a controlled provider to prove unsupported jobs never
enter persistent state and cancellation remains pending until completion. These are host contract
tests, not Android media runtime evidence. Engine Clippy and Android-target application/plugin
Clippy passed with warnings denied. npm run check passed after regenerating the health contract.
Android UI interaction and native media decoding remain pending.

A fresh Windows engine also imported the real escape.mp4 example through the managed subprocess
boundary, saved a manual caption at revision 2, and rendered a three-second 720×1280 clip with audio.
FFprobe confirmed its duration and dimensions; FFmpeg decoded the complete export without errors.
Evidence: .cache/desktop-native-boundary.json. This verifies the desktop engine path, not the Android
media library or a newly packaged desktop shell.

The two Chromium browser regressions passed against the fresh engine: real upload, caption edits,
autosave/reopening, export/download, English settings, and a narrow layout without horizontal
overflow. These checks use the desktop/browser backend; Android document interactions are unrun.

## Android ARM64 preview package

[Native media run 43450248163](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43450248163)
passed the pinned FFmpegKit Next source build and ARM64 archive inspection.
[APK run 43459222590](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43459222590)
passed application assembly, including Kotlin compilation, and all package inspection gates on
source commit 910dfe7a9299daf0f345f7f94d7aebe4d03d0bd5.

| Check                             | Status  | Evidence                                                                   |
| --------------------------------- | ------- | -------------------------------------------------------------------------- |
| Native media archive              | PASS    | Pinned revision and SHA-256 checked before application assembly.           |
| APK identity and SDK              | PASS    | app.unlimitedclipper.studio, version 0.1.0, min SDK 29, target SDK 36.     |
| Native architecture and alignment | PASS    | Eleven ARM64 libraries, 16 KB ELF load alignment, and zipalign -c -P 16 4. |
| Package signature                 | PASS    | apksigner verify --verbose --print-certs; experimental debug signing.      |
| Source quality checks             | PASS    | All five jobs in quality run 43459220427 on the same source commit.        |
| Android runtime and interactions  | Pending | Device/emulator testing explicitly deferred by the owner.                  |

The delivered APK is 134,110,791 bytes, approximately 127.9 MiB. SHA-256:

```text
b9099015044c9d6b324756cea060ab2347188c515c4ea9fa8291fad4e4a2958b
```

[Download artifact 14054984987](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43459222590/artifacts/14054984987)
contains the APK, source revision/checksum evidence, metadata, signature details, and untested-runtime
notes. Retention is 30 days. The studio and host implement manual media workflows; Android inference,
YouTube imports, tracking, and automatic updates remain disabled. Import/export playback, touch,
keyboard, accessibility, backgrounding, cancellation, and recovery on Android are unrun. No memory,
speed, thermal, battery, or physical-device compatibility claim is made.

The SDK inspector supports both minSdkVersion and the earlier sdkVersion label emitted by aapt2.
The current label was checked against the
[AOSP badging implementation](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/tools/aapt2/dump/DumpManifest.cpp).
Failed package inspection retains a diagnostic artifact instead of discarding the assembled APK.

## Editorial pipeline and storage, 2026-11-14

This pass uses native Windows ARM64, an isolated application library, and shared read-only
canonical models. Other operating systems require their own runtime checks.

| Check                         | Status       | Evidence                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend quality              | PASS         | npm run check: ESLint, Prettier, TypeScript, three Vitest tests, and production studio build.                                                                                                                                                                                     |
| Rust quality                  | PASS         | 26 engine tests; workspace Rustfmt; engine and desktop Clippy with warnings denied.                                                                                                                                                                                               |
| Timeline/caption regressions  | PASS         | Legacy v1, half-open source ranges, manual provenance, split audio offsets, cut-aware groups, and stable base phrases.                                                                                                                                                            |
| Real composed media           | PASS         | Two source cuts produce exactly 6.000 seconds. Portrait, square, landscape, contain, blur, and gaming outputs pass geometry and full decoding with notes, punch-in, split, B-roll, imported audio, and a tap.                                                                     |
| Preview/export isolation      | PASS         | Preview creates no export record; stale preview revision returns 409; export retains its immutable revision.                                                                                                                                                                      |
| Browser interactions          | PASS         | Three Playwright workflows: actual upload/edit/reopen/export, five keyboard caption looks, local layers/offset/gain, preview playback, stale-preview guidance, delete/undo, English settings, and 390 px layout.                                                                  |
| Native desktop                | PASS         | Fresh debug ARM64 binary, native bridge and Windows file dialog, import, Kinetic, note editing, preview playback, autosave, and export; no page errors.                                                                                                                           |
| Real Indonesian proposal      | PASS, scoped | Existing 38-second Windah fixture with 33 transcribed words generates four layers through local Qwen and face samples. Word IDs stay grounded; generation leaves the revision unchanged; explicit application creates one revision. Silence removal is disabled without the pack. |
| Multi-cut recovery            | PASS         | Five immutable batch exports survive cancel/retry and a lost job checkpoint followed by restart. One completed file survives cancellation; all five retain fingerprints after restart; no duplicate exports.                                                                      |
| Quality pack export           | PASS, scoped | Pinned model wrappers passed ONNX/PyTorch comparisons in quality-pack run 43567427934. Ten model/notice files total 1,725,866,911 bytes.                                                                                                                                          |
| Native quality-pack inference | Pending      | Local artifact download failed. CTC/VAD runtime, speaker frontend parity, acoustic accuracy, and multiple-speaker benchmarks were not run.                                                                                                                                        |
| Podcast benchmark             | Pending      | Podcast sources were identified, but bounded excerpts did not download successfully.                                                                                                                                                                                              |
| Android runtime               | Pending      | Device and emulator tests remain deferred by the owner; previous ARM64 APK evidence does not certify these new edits.                                                                                                                                                             |
| Packaged release              | Pending      | Debug desktop testing is not installer, updater-signature, Linux/macOS package, or release-tag certification.                                                                                                                                                                     |

Ignored evidence: .cache/editorial-validation.json, .cache/editorial-proposal-validation.json,
.cache/recovery-validation.json, .cache/desktop-validation.json, .cache/native-studio.png, and
test-results/editorial-studio.png. Helpers are scripts/validate-editorial.mjs,
scripts/validate-editorial-proposal.mjs, scripts/validate-browser.mjs, scripts/validate-desktop.mjs,
and scripts/validate-recovery.mjs. The fixture recipe is scripts/generate-fixtures.mjs.

The debug MinGW build initially exceeded the PE auto-export symbol limit. Restricting automatic
exports for the unused desktop CDylib resolved linking. Native dialog checks use the authorized
43179 studio origin; the first attempt on a different port did not have native-dialog permission.
The final check used the authorized origin and passed without broadening capabilities.

Storage cleanup first reclaimed 42,702,334,654 bytes. After stopping owned test processes, a
second audited pass reclaimed 6,128,626,801 bytes from old test installations, component archives,
and a SHA-256-confirmed medium-model duplicate. The failed transfer also released 129,056,768
bytes. Current compiled target output was explicitly retained. Original .data videos, exports,
and canonical models remain intact. Evidence: .cache/storage-cleanup-initial.json,
.cache/storage-cleanup.json, .cache/quality-transfer-cleanup.json, and .cache/storage-final.json.
After cleanup and validation builds, the measured workspace was 16,163,312,034 bytes, approximately
15.05 GiB. This includes the retained compiled target output.
The canonical .data library contained 42 registered assets; all resolved to existing files after
cleanup. Its measured size remained 7,029,653,999 bytes.

Source commit 7d614ead8a2bfe56bd141c59f57c400d92485bd5 passed all five jobs in
[quality run 43573112874](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43573112874):
the studio check and engine tests/Rustfmt/Clippy on Windows x64, Ubuntu, macOS Intel, and macOS
Apple Silicon. Windows desktop Clippy also passed. These source checks do not certify packaged
applications on those platforms.

The same commit passed
[native editorial run 43573112948](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43573112948)
on the official Windows ARM64 runner using MSVC. A fresh engine build rendered the fixture
successfully: 6.000000 seconds, all six layouts decoded, local audio/B-roll layers, preview isolation,
and stale-revision rejection.
[Evidence artifact 14105785414](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43573112948/artifacts/14105785414)
contains the JSON result; the downloaded copy is .cache/ci-editorial-evidence/editorial-validation.json.
This CI job tests the standalone engine, while the separate native desktop check above uses WebView2.

### Anti-slop gate for the changed editor

| Block                  | Status       | Evidence                                                                                                                                                                                  |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction and identity | PASS, scoped | Existing DESIGN.md matte studio, restrained lime, real footage, DM Sans/Oswald, ENERGY 2 / RHYTHM 2 / MOTION 1.                                                                           |
| Working controls       | PASS, scoped | Changed layer/caption controls have real handlers; Playwright exercised enabled states, timing, crop width, text size/position/color, gain, offsets, deletion/undo, and preview playback. |
| Resilience             | PASS, scoped | Empty prerequisite hints, upload/render errors, disabled model prerequisites, stale revisions, keyboard operation, and narrow-layout checks.                                              |
| Content and claims     | PASS, scoped | Original application source; no competitor assets, invented projects, testimonials, performance numbers, or speaker identities. Native pack accuracy is visibly marked unverified.        |
| Broader certification  | Pending      | Successful 1.61 GiB pack import, complete contrast/accessibility audit, all old controls, suspended-tab cache behavior, and native cross-platform certification remain unrun.             |

## Progress and setup usability, 2026-11-14

The global activity popup reports durable engine jobs and the transfer phase before admission.
Its percentage is overall job completion. Inference stages without incremental tool telemetry
retain their checkpoint percentage until another milestone completes.

| Check                       | Status       | Evidence                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source quality              | PASS         | npm run check; 26 engine tests; workspace Rustfmt check; engine and desktop Clippy with warnings denied.                                                                                                                                                                                           |
| Browser interactions        | PASS, scoped | Three onboarding Playwright tests cover immediate submission, queue/download/proxy, transcription/render, navigation, cancellation confirmation, completion/failure dismissal, collapse/expand, and a 390 px viewport.                                                                             |
| Model and update controls   | PASS, scoped | Tests select Whisper medium and verify the POST endpoint, installed state, optional manual import, absent feed fields, disabled unconfigured automatic updates, the fixed release page, and compatibility with an older native command bridge.                                                     |
| Fresh large model download  | Pending      | Browser tests use controlled network responses and isolated data with read-only canonical models. They do not certify a new multi-gigabyte transfer.                                                                                                                                               |
| Current native preview host | PASS, scoped | The idle older host was closed normally, then the optimized 0.1.0-preview.2 ARM64 host was opened. Its native bridge, model selector, actual transcription popup at 20%, queued model repair, and cancellation of that test job passed. The user's new clip job was preserved and later completed. |
| Release installer runtime   | Pending      | Signing and installer production are separate from install/uninstall, native opener execution, and physical x64 runtime certification.                                                                                                                                                             |

Evidence: tests/browser/onboarding.spec.ts, test-results/onboarding-progress.png, and
test-results/onboarding-settings.png. Run with node scripts/validate-browser.mjs onboarding.spec.ts.
The final run passed three tests in 16.5 seconds after the production build completed. An earlier
run started against the previous built assets and failed the new native compatibility scenario;
the rebuilt assets passed. The browser suite submitted no processing to the user's active engine.
The shared browser Settings page was also inspected against the real library: small, medium, and
Qwen were ready, manual import remained optional, and the update server fields were absent.
Evidence: .cache/live-settings.png and docs/media/settings.png. The existing clip-generation job
completed while the native host remained alive. A new session correctly showed no popup for jobs
that had already finished before the session opened.

Native preview evidence: .cache/native-preview-validation.json, .cache/native-preview-settings.png,
and .cache/native-preview-progress.png. The production host requires an authenticated browser
session, so its diagnostics were read through the native page rather than an unauthenticated Node
request. A new user transcription job started during this check. The model-repair completion
check timed out because its job correctly waited behind that transcription; only the queued test
job was cancelled. Real model download/repair completion and native opener execution remain unrun
for this pass. No active user job was stopped to refresh or test the host.

Anti-slop During gate, scoped to the changed controls: the matte popup uses elevation to separate
running work from the editor, restrained lime for progress, a bounded scroll region, native labeled
controls, and no decorative animation. The model selector reflects the actual registry. Working
controls and loading/disabled/error states passed the controlled interactions above. Complete
contrast, screen-reader, and native runtime audits remain pending.

## Published Windows preview, 2026-11-14

The [v0.1.0-preview.2 release](https://github.com/bayurifkialghifari/unlimitedclipper/releases/tag/v0.1.0-preview.2)
contains eight assets, including both Windows installers. Application binaries use tagged source
961e30143bc6e8f0c013138f424fb2511042e075 with the release-version transformation. Staging uses
the signer-environment fix in b3e0d84. This fix removes the inherited string-key environment
variable when the manifest signer receives an explicit key-file argument.

| Check                           | Status       | Evidence                                                                                                                             |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Local source quality            | PASS         | npm run check after the signer fix; 26 Rust tests, Rustfmt check, and engine/desktop Clippy with warnings denied for the Rust edits. |
| Optimized Windows builds        | PASS         | ARM64 and x64 application compilation and NSIS packaging completed locally.                                                          |
| Architecture and version        | PASS         | PE machine headers aa64 and 8664; Windows file/product versions and manifests match 0.1.0-preview.2.                                 |
| Publisher updater signatures    | PASS         | Independent Ed25519/BLAKE2b verification of both installer signatures, including their signed version.                               |
| Published artifact integrity    | PASS         | SHA256SUMS verified locally; all eight GitHub server SHA-256 asset digests match the local release files.                            |
| Optimized native ARM64 host     | PASS, scoped | Native bridge, model selection, actual transcription progress, and queued-test cancellation; the user job completed afterward.       |
| Final library and host state    | PASS, scoped | The host stayed open, all three canonical models remained ready, and the final authenticated API read showed no active jobs.         |
| Hosted release CI               | Blocked      | Run 43577933322 could not start because GitHub reported failed account payments or a spending-limit restriction.                     |
| Installer and updater execution | Pending      | Install/uninstall, native updater installation, and native release-page opener execution were not tested in this pass.               |
| Other platform runtime          | Pending      | Physical x64, Linux/macOS packages, and Android runtime are outside this preview verification.                                       |

The ARM64 installer is 225,562,120 bytes (215.11 MiB); the x64 installer is 286,362,857 bytes
(273.10 MiB). The private repository requires GitHub access and provides manual preview downloads.
It is not a public automatic-update feed. Windows Authenticode signing is not configured. Some
Tauri-specific installer messages fall back to English when Indonesian is selected.

Local evidence: .cache/preview-signature-validation.json, .cache/preview-published.json,
.cache/native-preview-validation.json, and .cache/native-preview-final.json. The latter confirms
the user clip-generation job completed and only the queued model test was cancelled. Fresh large
model download/repair completion remains untested; the test waited behind actual user processing.
The [hosted release run](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43577933322)
performed no validation or build steps; local results are recorded separately.

After retaining both installers, audited release cleanup removed 6,812,226,113 bytes (6.34 GiB)
of temporary checkouts, copied x64 tools, duplicate bundles, and build caches. The helper checked
resolved target paths, refused symlinks, and protected the running executable and its linked copy.
Original videos, exports, canonical models, ARM64 tools, and publisher keys outside the workspace
were preserved. The final workspace measurement was 20,099,667,194 bytes (18.72 GiB), excluding
symlink traversal. Evidence: .cache/release-cleanup.json and .cache/release-storage-final.json.

## Fullscreen layout and export review, 2026-11-14

The frontend check passed ESLint, Prettier, TypeScript, three unit tests, and production compilation.
The three onboarding browser scenarios passed after the layout changes. A separate layout test
passed at 390, 1280, 1920, and 2560 pixels, including content-edge search alignment, a long processing
error, visible percentages, Settings icons, no horizontal document overflow, and opening an actual
MP4 with its immutable subtitle sidecar. These browser scenarios use controlled records against an
isolated engine. They do not generate exports or alter the active user's library.

The initial narrow-layout test exposed a search field whose wrapper retained its intrinsic width;
fixing the actual Field wrapper made the final run pass. Evidence: tests/browser/layout.spec.ts
and test-results/layout-export.png. Fresh native fullscreen interaction remains pending until the
new editor host is built. The complete accessibility/contrast audit remains pending.

Anti-slop During gate, scoped: existing graphite/lime direction, real library records, labeled
keyboard-operable actions, honest empty states, bounded popup placement, and responsive behavior
were inspected through the controlled interactions above. No placeholder activity or export data
is bundled in the application.

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

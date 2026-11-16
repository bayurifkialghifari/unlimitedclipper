# Validation evidence

## Preview.10 tagged version preparation, 2026-11-16

The preview.9 tagged run
[43776906521](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43776906521)
passed all five quality jobs, both Windows installer jobs, all four Unix package jobs, and
the Android native media job. Its Android APK failed before packaging: the version script
expanded compact JSON fields in the Tauri configuration and Prettier rejected the result.
The publish job was skipped. The script now changes only the top-level version entry in each
JSON file. In an isolated worktree,
the exact preview.9 transformation reproduced the formatting failure; the preview.10
transformation passed Prettier for the script and all five changed JSON files. The tagged
preview.10 worktree also passed npm run check: ESLint, Prettier, TypeScript, six frontend tests,
and the production Studio build. Hosted package and release evidence remains pending.

The initial local Rust test attempt in this isolated worktree could not link because it lacked
the main workspace's ARM64 compiler. After connecting that compiler, all engine Rust tests,
workspace Rustfmt, and engine/desktop Clippy with warnings denied passed for the transformed
preview.10 version. The linked-library corresponding-source audit remains open; no draft binary
should be published publicly before it is complete.

## Per-clip styling, Hook review, and release preparation, 2026-11-16

The updated source passed npm run check: ESLint, Prettier, TypeScript, six frontend tests, and
the production Studio build. All 60 Rust engine tests passed, including the Hook source-signature
guard. Workspace Rustfmt and engine/desktop Clippy passed with warnings denied. This validates
the local Windows ARM64 development build; it does not certify release packages.

Two isolated browser scenarios in tests/browser/studio.spec.ts used a real local video. The
first edited captions, rendered and downloaded an MP4, opened Change style from export history,
saved another caption look, and confirmed the earlier export asset ID and revision stayed the
same. The second made two clips from one project, opened Change style on the first clip card,
saved its caption and video filter looks, and confirmed the sibling document/revision stayed
unchanged. Both scenarios passed without page errors on the isolated localhost engine.

scripts/validate-hook-proposals.mjs produced eight transcript-grounded local ideas from the
real speech fixture, checked their source quotes, preserved the clip during generation, and
reloaded the saved set after engine restart. Its browser scenario selected another idea after
an overlay edit and autosave without generating again, applied it as an opening card, and used
Undo/Redo. The older revision request still returned HTTP 409. Evidence:
.cache/hook-proposals-validation.json and tests/browser/hook-proposals.spec.ts. Hook quality
remains a human editorial decision.

The tagged workflow now describes six desktop packages and one experimental Android APK.
Unix native dependency downloads, macOS source builds, AppImage/disk-image bundling, Android
APK assembly on this revision, publication, and installation/runtime checks are pending hosted
CI evidence. The Android APK remains media-only and debug-signed. The Windows update manifest
does not advertise Unix bundles. No unrun platform or package check is marked PASS.

The preview.9 release staging candidate passed local workspace Rustfmt, 61 engine Rust tests,
engine and desktop Clippy with warnings denied, Studio ESLint, Prettier, TypeScript, six frontend
tests, the production build, and checksum verification for four pinned media source archives.
The initial hosted Unix run
[43744478888](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43744478888)
passed package jobs for Linux x64/ARM64 and macOS ARM64; macOS Intel was still building its
source-pinned ONNX Runtime when this candidate was prepared. That run predates the notice archive
and Android release attachment changes, so it does not validate the final release staging.

The previous branch run
[43749375471](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43749375471)
found a macOS ARM staging defect after its disk image built: Tauri removed the temporary
application directory before the architecture check. The staging fix mounts the disk image and
inspects its embedded executable; the next hosted run passed. The separate
[Android run 43749379633](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43749379633)
passed APK inspection. Its downloaded 149,594,215-byte debug APK matched SHA-256
859f18448e7a2e4064ce1763710a8986dae800a0f254795fc1973913899b596d; Android
device behavior remains untested.

The four pinned media source archives include FFmpeg source and build scripts, but the Linux
build-script snapshot does not contain the source packages downloaded for linked libraries.
The macOS and Android source snapshots likewise do not establish complete linked-library
coverage. Corresponding-source and notice completeness is pending audit before public binary
publication, as required by docs/third-party-notices.md.

Run [43751491784](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43751491784)
passed all quality jobs and Linux x64/ARM64 plus macOS ARM package jobs, including architecture
inspection inside the ARM disk image. Its macOS Intel job linked the ONNX Runtime shared library
but failed to find the versioned symlink after also compiling unneeded test binaries. The next
candidate follows the symlink, checks its Mach-O architecture, and builds only the shared runtime
target. Run [43762607277](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43762607277)
passed all quality checks and four Unix package jobs from commit acd0a74. CI staged and uploaded
Linux x64/ARM64 AppImages, macOS Intel/ARM disk images, each package manifest, and its notice
archive. Package inspection checked the AppImage ELF machine or executable Mach-O architecture
inside the disk image. These are package/build checks; native Linux/macOS runtime, installation,
system signing, and notarization remain unverified.

| Anti-slop During gate | Status  | Evidence and remaining scope                                                                                                                                      |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction and content | Pass    | Existing graphite/amber design, real clip/export records, and transcript-grounded Hook evidence.                                                                  |
| Hard gate             | Partial | Keyboard-operated Hook selection, named style actions, save feedback, and browser page-error checks passed. Full contrast and every-control audit remain pending. |
| Purpose               | Pass    | Change style opens a specific saved clip; choosing a Hook idea shows one quote/reason before applying it.                                                         |
| Liveliness            | Partial | Browser desktop and narrow Hook interaction passed. Native visual review and reduced-motion audit remain pending.                                                 |
| Craftsmanship         | Partial | Real export identity, sibling revision isolation, Undo/Redo, and local inference passed. Cross-platform packages remain pending CI/runtime checks.                |

## Storyboard timeline and gaming split, 2026-11-16

The isolated browser scenario in tests/browser/timeline-storyboard.spec.ts imported the real
12-second speech-face fixture, decoded a source-derived timeline frame, selected a caption word,
used the keyboard ruler, saved Gaming split, and ran local facecam detection after setting its
search region around the visible face. The completed tracking job preserved gameplay crop. The
scenario switched between two saved clips, built a 19-card project rail, selected its last card
by keyboard, and found no document overflow at 390 pixels or page errors. Storyboard cache jobs
stayed out of the global progress panel. Screenshots: test-results/timeline-gaming.png,
timeline-desktop.png, and timeline-narrow.png.

An isolated Windows ARM64 debug Tauri build passed scripts/validate-native-storyboard.mjs with
the current Studio bundle. WebView2 exposed the Tauri bridge, decoded a managed scene frame,
saved Gaming split, completed local facecam detection, preserved the gameplay rectangle, and
switched to a second project clip. It reported zero page errors. Evidence:
.cache/native-storyboard-validation.json and .cache/native-storyboard.png. The test host used
its own data directory and WebView2 profile while the user's desktop remained open. The
debug-only second-instance switch is confined to that isolated host.

The final source passed npm run check (ESLint, Prettier, TypeScript, six frontend tests, and the
production Studio build), all 60 engine Rust tests, workspace Rustfmt check, and engine/desktop
Clippy with warnings denied. The already-open desktop at port 43179 advertised storyboard frame
support, served the same Studio index as the isolated browser host, and had no active jobs.

This fixture shows a visible face in a controlled square source, not natural gaming footage.
It verifies interaction, persistence, and frame delivery. It does not measure face detection
accuracy across camera positions, certify export parity for this edit, or exercise a packaged
installer. Earlier rendered Gaming split fixtures are recorded below.

| Anti-slop During gate | Status  | Interaction evidence and remaining scope                                                                                                             |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction and content | Pass    | Existing graphite/amber design; real source frames, saved clips, and an actual tracked face.                                                         |
| Hard gate             | Partial | Keyboard ruler and rail, named controls, decoded images, 390-pixel overflow, and page errors passed. Full contrast and control audit remain pending. |
| Purpose               | Pass    | Frame strips support cut review; the clip rail opens saved clips; Gaming split and detection change real edits.                                      |
| Liveliness            | Partial | Browser desktop/narrow and native screenshots were inspected. Full reduced-motion review remains pending.                                            |
| Craftsmanship         | Partial | Real import, job, persistence, and native interaction passed. Packaged release and natural gaming accuracy remain pending.                           |

## Card narration, language flags, and project deletion, 2026-11-15

scripts/validate-narration.mjs passed again after the retry and WAV validation changes with
the pinned Supertonic 3 M1 pack. Indonesian and English card jobs produced registered WAVs;
a stale revision returned HTTP 409. Live preview and immutable export contained card audio,
the nine-second MP4 decoded fully, and narration persisted after restart. Cancellation and
retry passed. Evidence: .cache/narration-validation.json. This test detects audio and timing;
it does not judge intelligibility or voice quality by listening.

An isolated Windows ARM64 WebView2 run used the verified local pack, generated and applied an
opening-card narration through native controls, and observed its hidden audio decoder advance
beyond 150 ms during card playback. It also passed real video painting, camera/B-roll motion,
exact preview, card transitions, one visible canvas, and zero page errors. Evidence:
scripts/validate-native-composition.mjs and .cache/native-composition-validation.json. The
decoder check does not measure physical speaker output or a packaged installer.

tests/browser/project-dialog-language.spec.ts passed against an isolated production Studio.
It checked an actual SVG flag, localized options, keyboard selection, desktop and 390-pixel
editor screenshots, no narrow horizontal overflow, and at least 24 pixels between import
controls and the first project card. Escape and Cancel kept the disposable imported project;
explicit confirmation removed it. Evidence: test-results/transcription-language.png,
editor-layout-desktop.png, editor-layout-narrow.png, and project-delete-dialog.png.
An injected HTTP 503 kept the project and displayed its error in the modal; retry then deleted
the fixture.

The final working tree passed npm run check (ESLint, Prettier, TypeScript, four frontend tests,
and the production build), all 59 engine Rust tests, workspace Rustfmt check, and engine plus
desktop Clippy with warnings denied. The focused browser scenario passed again after the final
narrow-screen preview adjustment. The development desktop then opened against the canonical
project library at port 43179 with a visible window, zero active jobs, and the verified narration
pack ready. This is an open development build, not a newly packaged installer.

| Anti-slop During gate | Status  | Interaction evidence and limit                                                                                   |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| Direction and content | Pass    | Original graphite/amber UI, real fixture video, localized language names, and a licensed flag selection.         |
| Hard gate             | Partial | Keyboard selection, modal focus/Escape/Cancel, narrow overflow, and real deletion passed; full audit is pending. |
| Purpose               | Pass    | Voice controls create a saved audio revision; project confirmation names the record being removed.               |
| Liveliness            | Partial | Desktop/narrow screenshots and native media playback passed; full motion/contrast review remains pending.        |
| Craftsmanship         | Partial | Real narration media, native playback clock, browser interactions, and revision recovery passed.                 |

## Auto Motion proposal and silence review, 2026-11-15

scripts/validate-auto-motion.mjs imported a controlled 12-second video, transcribed its speech
with installed Whisper small, and ran the installed Qwen 4B automatic-edit model. The proposal
converted two existing crop anchors into 11 camera-motion anchors while leaving the saved clip
unchanged. The latest proposal survived engine restart and rejected an old revision with HTTP 409. A browser interaction inspected the saved anchors, applied the proposal, used Undo and
Redo, reloaded the editor, and saw the now-stale Apply control disabled. The applied revision
exported an MP4 that decoded fully. Evidence: .cache/auto-motion-validation.json and
tests/browser/auto-motion.spec.ts. This fixture confirms the media path and interaction; it
does not measure editorial appeal or natural face-tracking accuracy.

Three Rust unit checks cover single-face pan and transcript zoom, a hold jump at a scene cut,
and exact silence-gap accounting with caption-word protection. The optional quality pack was
not installed on this host, so acoustic silence removal and its browser gap list have not had
an end-to-end native run. npm run check passed ESLint, Prettier, TypeScript, four frontend unit
tests, and production compilation. All 57 Rust tests, workspace Rustfmt check, and engine plus
desktop Clippy with warnings denied passed after this slice.

| Anti-slop During gate | Status  | Interaction evidence and limit                                                                                                                             |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction and content | Pass    | Original Studio controls display the actual saved clip, proposal values, and source times.                                                                 |
| Hard gate             | Partial | Keyboard proposal review, Undo/Redo, disabled stale Apply, restart, and browser errors passed; full contrast and accessibility audits remain pending.      |
| Purpose               | Pass    | Motion and silence controls produce a revision-bound proposal with inspectable anchors or gaps.                                                            |
| Liveliness            | Partial | Decoded export and live motion path passed; subjective pacing and reduced-motion review remain pending.                                                    |
| Craftsmanship         | Partial | Real inference, persistence, browser, export, source checks, and scoped native composition passed; native Auto Motion and packaged release remain pending. |

## Registered B-roll motion, 2026-11-15

The version 4 validator accepts registered B-roll center/zoom/opacity tracks, limits them to
24 anchors and 120 seconds, and rejects zoom below one or unsupported layer kinds. A Rust
scene test checks that eased values and managed media offsets survive trim/reorder. The
scoped camera-motion browser scenario passed with keyboard keyframe creation, a visible live
canvas change when B-roll and its transforms were added, autosave, and reload. Evidence:
tests/browser/camera-motion.spec.ts.

scripts/validate-advanced-motion.mjs passed four complete real-media exports on Windows ARM64.
The added B-roll export decoded fully and differed from the no-B-roll frame by a mean RGB
channel value of 70.08 at four seconds; easing opacity from 1 to 0.4 changed that frame by
30.91 against the opaque export. Camera geometry checks retained mean errors of 4.03, 3.72,
and 9.68 at sampled times. Evidence: .cache/advanced-motion-validation.json. These are sampled
geometry/visibility checks, not a subjective editing-quality or all-frame parity claim.

The alpha path uses FFmpeg sendcmd/colorchannelmixer before the existing overlay. A controlled
720 by 1280, 180-frame color probe completed in 0.42 seconds with this path versus 3.06 seconds
for the tested per-pixel blend expression on this machine. These probe times do not predict
real export speed. After the user's Generate job completed, the older desktop closed normally.
An isolated Windows ARM64 WebView2 run passed camera and B-roll live-frame changes, exact
playback, independent cards, one canvas, and zero page errors on a controlled moving-face
fixture. Its live frame mean was 29.01 and chroma 12.52. The main development desktop reopened
with the media_motion health flag. Evidence: .cache/native-composition-validation.json.

Anti-slop During gate for this slice: source assets are registered real videos; numeric
keyframes and timeline markers have working save/undo paths; disabled states name missing
source, playhead, duration, and host-version prerequisites. Browser keyboard, focus, live
frame changes, persistence, MP4 decode, and native WebView2 interaction passed. Broad contrast
review, packaged-release execution, and other-platform runtime remain pending.

## Reviewable Hook proposals and editor Undo/Redo, 2026-11-15

The engine Rust suite passed 54 tests at the Hook checkpoint, including contiguous source-quote rejection and an API
revision-conflict/frozen-snapshot check. Rustfmt and Clippy with warnings denied passed. The
production frontend build and type checks passed; a later whole-repository check passed after
the B-roll integration. Earlier visible Undo/Redo browser checks passed in
tests/browser/studio.spec.ts.

scripts/validate-hook-proposals.mjs imported a real 12-second JFK speech video, transcribed it
with the installed Whisper small model, and generated eight accepted ideas with the installed
Qwen 4B model. Every stored source quote matched a contiguous transcript phrase. Generation
left the clip unchanged; the set survived an engine restart; a stale revision returned HTTP 409. The isolated browser scenario then applied an overlay, used Undo and Redo, regenerated
ideas for the new revision, applied an opening card by keyboard, used Undo and Ctrl+Y, and
checked a 390-pixel viewport for horizontal overflow. It passed with no page errors. Evidence:
.cache/hook-proposals-validation.json and tests/browser/hook-proposals.spec.ts. These checks do
not establish editorial quality across languages or guarantee eight useful hooks per clip.

Anti-slop During gate for this scoped UI:

| Gate          | Status  | Evidence and limit                                                                                                                                                                                                             |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hard gate     | PASS    | Real transcript/clip records, working proposal actions, labeled controls, disabled stale actions, and no horizontal overflow at 390 pixels in the browser fixture. Full application-wide accessibility review remains pending. |
| Purpose       | PASS    | The quote/explanation shows why an idea was offered; mode buttons determine the actual title or card revision.                                                                                                                 |
| Liveliness    | PASS    | Existing graphite/amber direction remains the visual language; one compact proposal list keeps footage central. No new visual asset or decorative motion was added.                                                            |
| Craftsmanship | PARTIAL | Local inference, restart persistence, keyboard application, undo/redo, and browser errors passed. Native Hook interaction, packaged release, contrast audit, and other platforms remain pending.                               |

## Project gallery spacing, 2026-11-15

A native Projects screenshot at 812 by 660 pixels showed the import controls touching the first
thumbnail row. The gallery now has a 24-pixel top margin. npm run check passed lint, format,
types, frontend tests, and a new production build. A later isolated browser interaction
measured at least 24 pixels and captured the confirmation dialog on the rebuilt Studio.

## Manual camera and text motion, 2026-11-15

npm run check passed ESLint, Prettier, TypeScript, four frontend tests, and the production
build. All 51 engine Rust tests, workspace Rustfmt check, and engine/desktop Clippy with
warnings denied passed. The new Rust checks cover easing, scene trim/reorder remapping,
legacy documents, and invalid motion. The development desktop build succeeded.

scripts/validate-advanced-motion.mjs passed a six-second real-media export with full decode.
Independent FFmpeg source crops differed from three sampled camera frames by mean RGB channel
errors of 4.03, 3.72, and 9.68 on a 0-255 scale. Animated note text changed decoded export
frames at two times. These pixel checks establish sampled geometry and visible text changes;
they do not certify every frame or subjective visual quality. Evidence:
.cache/advanced-motion-validation.json and scripts/validate-advanced-motion.mjs.

The browser camera-motion scenario passed against the production build. It exercised keyboard
keyframe creation, live frame changes, autosave and reload, text scale/opacity, text position
from a focused drag handle, legacy crop-anchor migration at the same timestamp, and the
disabled camera control for an unsupported layout. Evidence: tests/browser/camera-motion.spec.ts.
The full browser suite was not rerun for this motion slice.

An isolated Windows ARM64 debug desktop processed eight seconds from the existing podcast.
Native WebView2 had the Tauri bridge, one visible canvas, a real live-frame mean of 143.34 and
chroma of 15.13, a camera-motion pixel change, exact playback, independent cards, and no page
errors. Evidence: scripts/validate-native-composition.mjs and
.cache/native-composition-validation.json. The current production Studio was rebuilt after
the browser guard changes; the native fixture is a development runtime, not a packaged
installer test.

| Anti-slop During gate | Status  | Interaction evidence and remaining limit                                                                                                                    |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction and content | Pass    | Original graphite/amber Studio; controls use real clips and saved revisions.                                                                                |
| Hard gate             | Partial | Browser keyboard, disabled layout, labels, autosave, and native playback passed. Full control-by-control accessibility and contrast review remains pending. |
| Purpose               | Pass    | Motion controls edit preview and exported values; unsupported media motion is rejected.                                                                     |
| Liveliness            | Partial | Live-frame pixel changes and native playback passed. Full visual and reduced-motion review remains pending.                                                 |
| Craftsmanship         | Partial | Format, types, Rust, real-media export, browser, and native checks passed. Packaged release and other-platform runtime remain pending.                      |

At that checkpoint, optional narration, other AI proposals, active-speaker identity,
expanded captions, stock recommendations, and the rest of the advanced-editing contract remain
pending. Android runtime, physical x64 runtime, and packaged-release execution were not run.

## Independent cards and version 4, 2026-11-15

npm run check passed lint, formatting, type checks, four frontend checks, and production
build. All 47 Rust tests, Rustfmt check, and Clippy with warnings denied passed. Three new
scene tests verify legacy compatibility, card bounds, no source during cards, remapping,
source provenance, and one-time ASS/SRT/output-VTT offsets.

scripts/validate-cards.mjs passed real-media preview/export decoding: a 1,000 ms opening,
2,000 ms of reordered content, and 1,500 ms closing produced 4,500 ms media. Card backgrounds
and silent audio were checked; content retained audio after the opening. An export frozen
before a later card edit retained its original duration and revision. Restart restored the
new card and the original word source anchor. Evidence: .cache/card-media-validation.json.
The existing filter/hook/SFX render fixture also passed after the composition change.

All thirteen browser cases passed together against the final production build in 2.0 minutes.
The new card case covers keyboard creation, styling, autosave, independent playback, exact
rendering, reopening, and removal. An isolated Windows ARM64 debug app played the actual
podcast, opening/content/closing transitions, and exact cards. Native screenshots verify
visible background and text, rather than only reading a canvas buffer. Preview card seeks
inside its animation so a paused Fade card shows its text. Evidence:
.cache/native-composition-validation.json and .cache/native-composition-card{,-exact}.png.
The published application and canonical projects were preserved.

The scoped anti-slop During gate passes working card controls, source-grounded seed text,
empty/disabled guidance, keyboard creation, one inspector rail, visible loading/error states,
and actual composed frames. Cards were silent at this checkpoint; optional narration, new motion tracks, and
other advanced-editing work remain pending. Android runtime and new packaged-release runtime
are untested; the isolated native check does not certify an installer or another OS.

The earlier composed-preview commit fbe6446 passed hosted
[quality checks](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43692193688)
and [Windows ARM64 media checks](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43692193663).
Hosted checks for the card delivery commit have not run yet.

After all fixtures stopped, cleanup removed 1,413,155,440 unique file bytes (1.32 GiB) of
copied validation executables. Resolved runtime paths stayed under .cache, contained no links,
and were checked against active processes before deletion. Sources, exports, model/tool stores,
fixture media/checkpoints, screenshots, and the running published app were retained. Evidence:
.cache/validation-runtime-cleanup.json.

## Focused studio and composed preview, 2026-11-15

scripts/validate-composed-preview.mjs passed painted footage, one visible canvas, immediate
filter pixel changes, exact playback, and gallery reopen, with no console/page errors.
Evidence: .cache/composed-preview-validation.json and .cache/composed-preview-{live,filter,exact}.png.
The final rerun also passed revision-conflict and asset-kind rejection checks.

An isolated Windows ARM64 debug desktop, built with a separate test application identifier,
processed eight seconds from the existing 48-minute podcast. Native live video had mean
luminance 143.19 and chroma 15.21. Its visible screenshot contains the speakers and manual
hook. Monochrome exact playback painted footage. The native bridge and one canvas were
present, with no page errors. Evidence: scripts/validate-native-composition.mjs,
.cache/native-composition-validation.json, and .cache/native-composition-{live,exact}.png.
The user's published app and canonical projects were not used for mutations. This verifies
a native debug runtime, not installer or packaged release execution.

The complete twelve-case browser suite passed together against the final production build
in 1.6 minutes. Coverage includes manual creation, caption editing/styles,
rating revisions, scene reorder/cuts, undo, autosave, exact playback, progress/recovery,
bilingual settings, downloads, and narrow layouts. Evidence: tests/browser and test-results.

scripts/validate-editorial.mjs, validate-scenes.mjs, and validate-editor-tools.mjs passed real
media in six layouts, source color/audio ordering, immutable exports, filtered preview/export,
timed hook color, SFX mixing, and full decoding. The six-second editor-tools preview took
8.82 seconds and export 7.77 seconds in this run; these fixture times are not a long-video
benchmark. Evidence: .cache/editorial-validation.json, .cache/scene-media-validation.json,
and .cache/editor-tools-media-validation.json.

The scoped anti-slop During gate passes original graphite/amber identity, actual managed
records, working/disabled controls, keyboard tabs/resizing, one themed inspector rail,
forced-color fallback, loading/errors, and visible-media evidence. Live RGB approximates
final YUV grading and retains source audio; exact rendering is the final audio/color check.
Gallery thumbnails currently reuse source thumbnails. Active-speaker accuracy, optional new
AI packs, Android runtime, physical x64/macOS/Linux runtime, and a new packaged release remain
pending. Additional editing work is tracked in features/advanced-editing.md.

## Status

The implemented clipping workflow has passed real media, browser, and native ARM64 interaction checks. This is a development validation record, not a claim that every release gate or operating system is certified. Unrun scenarios remain pending.

## Local editor tools, 2026-11-15

### Filter thumbnails

The final frontend checks passed lint, formatting, types, four unit/asset checks, and
production compilation. Seven relevant browser scenarios passed after adding filter images.
The actual imported source frame appears in all recipe cards; screenshot pixels confirm
colored Natural and neutral Monochrome results. Keyboard selection, manual frame capture,
saved filters, scene playback, and a single inspector scrollbar passed. Captures create no
new render job or decoder. The ARM64 development host passed the same real-podcast thumbnail
check at 1920 x 1009, with one themed scrollbar and unchanged edit/revision. Natural image
chroma measured 13.598 and Monochrome 0.047. Evidence: .cache/filter-thumbnail-native.json.
The separate published preview.8 check is recorded below.

Anti-slop During gate, scoped: real-source images, original graphite/amber controls, readable
names, pressed/focus states, lightweight thumbnails, explicit loading/missing states, and
honest approximate-color guidance. Full accessibility certification remains pending.

### Hook, color, sound, and native rendering

The local engine passed 44 Rust tests, Rustfmt, and Clippy with warnings denied. Frontend
lint, formatting, types, four unit/asset checks, and production build passed. The complete
12-test browser run exercised source imports, manual ranges, caption styles, scene editing,
hook timing, filter persistence/reset, offline SFX audition/placement, and composed playback.
Painted screenshot pixels, not only video readiness, verified monochrome playback and mode
switching. After paused-subtitle reuse and inspector-selection refinements, seven relevant
browser scenarios passed again against the final production build.

scripts/validate-editor-tools.mjs passed on a real six-second, reordered video fixture:
720 x 1280 preview/export full decode, timed colored hook above monochrome footage, whoosh
audio contribution, and immutable export revision 3 while revision 4 was saved. Preview took
6,684 ms and export 6,701 ms. Evidence: .cache/editor-tools-media-validation.json.

A newly built ARM64 Tauri host opened on the owner's Windows laptop after fresh unsaved-edit,
upload, active-job, process-path, and native-modal checks, with a consistent SQLite backup.
At 1920 x 1009, the original reported podcast clip rendered a visible 720 x 1280 first preview
in 5,035 ms and played 35 frames with zero dropped frames. Its captured video pixels had mean
116.45/255. The prior transient black result was not reproduced reliably, so this records a
successful scoped playback check and canvas/load hardening, not a confirmed GPU root cause.
Evidence: .cache/editor-tools-native-preview.json and editor-tools-native-preview.png.

The separate Local editor demo used the owner's real podcast range 404,480–420,740 ms.
Native controls applied an Impact hook, Pop animation, Impact captions, Warm color values,
and one included whoosh. Its 720p preview job took 15,506 ms and 1080 x 1920 export took
34,047 ms, including queue and job completion. The 16.26-second MP4 has audio, passed full
decode, and played in native WebView2: 36 frames, zero dropped, mean video pixels 120.01/255.
The original revision-9 clip's persisted JSON matches its pre-test backup exactly.
Evidence: .cache/editor-tools-native-demo.json, editor-tools-native-demo.png, and
editor-tools-native-export.png. These timings reuse existing transcript/caption edits and
do not include model download, full transcription, or discovery. The tested laptop has a
Snapdragon X X126100 CPU with eight cores and approximately 16 GB physical RAM.

Anti-slop During delivery gate: original graphite/amber identity, real media/data, functioning
controls, keyboard labels/focus, preset selection, loading/error/disabled states, and a single
outer inspector scrollbar passed scoped browser/native interactions. No duplicate SFX scrollbar
was introduced. Packaged preview.8 checks follow below. Full accessibility certification,
installed updater execution, physical x64/macOS/Linux desktop runtime, and Android runtime
remain pending.

## Published preview.8 delivery, 2026-11-15

Tagged source `0541949c0fe86f139e84c40605b2c31554bc707e` passed the hosted
[quality workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43680853335),
[native editorial media workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43680853326),
and [Windows release workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43680857358).
These workflows validate source/build behavior and scoped media interactions; they do not
certify all desktop platforms or automatic selection accuracy.

The [public preview.8 release](https://github.com/bayurifkialghifari/unlimitedclipper/releases/tag/v0.1.0-preview.8)
contains eight assets. Anonymous downloads matched all eight server sizes and SHA-256 digests.
Both installer publisher signatures passed independent verification, including their signed
version. The ARM64 installer is 227,250,162 bytes; x64 is 288,198,793 bytes. Extracted application
PE headers match ARM64 and x64. Evidence: .cache/preview8-published.json,
.cache/preview8-signature-validation.json, and .cache/preview8-native-binaries.json.

After fresh idle, unsaved-edit, upload, native-modal, and process-path checks, the extracted
published ARM64 executable opened on the owner's laptop. Health reports 0.1.0-preview.8
and the native bridge is present. The real edited podcast played visible 720 x 1280 video
with 35 decoded frames, zero dropped frames, and mean video pixels 120.66/255. Paused caption
disable/re-enable repainted the canvas; the document was restored. Selected audio exposed
only its matching controls, changing inspector tabs reset scroll, and all 18 managed assets
resolved. The original user clip matched a fresh pre-test SQLite baseline. Evidence:
.cache/preview8-native-final.json and .cache/preview8-native-studio.png.

The subsequent native filter check showed all five actual-source recipes with colored Natural
and neutral Monochrome images, one themed scrollbar at 1920 x 1009, no horizontal overflow,
and no edit/revision change from frame capture. Evidence: .cache/preview8-native-filters.json
and .cache/filter-thumbnail-native.png. The hero and filter screenshot are committed under
docs/media; browser evidence remains separate from this native package check.

Anti-slop During delivery gate, scoped: actual footage, original palette, readable named
controls, working caption repaint/frame capture, matching inspector controls, and bounded
scrolling passed the interactions above. Full accessibility certification remains pending.
Installer install/uninstall, Authenticode signing, automatic updater installation, physical x64,
macOS/Linux desktop runtime, and Android runtime were not tested.

After the package checks, audited cleanup removed 7,702,961,917 bytes (7.17 GiB) of conservative
unique-file bytes from Rust build caches, obsolete native snapshots, preview.6 downloads,
extracted packages, the archive utility, and three cold test libraries. Resolved targets
remained inside the workspace; junctions were rejected, compiler activity was absent, and
running-process references were checked immediately before each removal. Canonical data,
tools, models, current installers/runtime, publisher keys, and four completed fixtures were
retained. The final measurement was 13,804,760,726 unique file bytes (12.86 GiB), excluding
symlink traversal. This is a point-in-time measurement; builds grow caches again.
Evidence: .cache/preview8-cleanup-audit.json, .cache/preview8-cleanup-applied.json, and
.cache/preview8-storage-final.json.

The post-cleanup check passed four ready models, all 18 registered assets, unchanged clip
JSON, and unchanged hashes for the published executable, studio entry point, and real demo
export. An initial helper assertion compared SQLite row prototypes against parsed JSON;
normalizing those rows to JSON fixed the checker, and the repeated value comparison passed.
Evidence: .cache/preview8-retained-before.json and .cache/preview8-retained-after.json.
The published ARM64 application remains open.
Final documentation/media delivery passed npm run check, including ESLint, Prettier,
TypeScript, four unit/asset checks, and production compilation. Rust source was unchanged
after the tagged source checks.

## Caption library and local ratings, 2026-11-14

The frontend quality check passed ESLint, Prettier, TypeScript, three unit tests, and production
compilation. The engine passed 35 tests, workspace Rustfmt, and engine/desktop Clippy with warnings
denied. New persistence tests cover reusable styles, deletion without edit mutation, and an old
assessment unable to replace a newer revision. Native admission rejects Android assess jobs.

The browser suite covers nine scenarios. Caption-library interactions exercise all 18 recipes,
category filtering, keyboard selection, actual bundled-font loading, save/reopen/reuse/delete,
preserved styling, pending and failed requests, worker errors, stale assessments, missing models,
and a 390-pixel viewport. Rating responses in these UI tests are controlled fixtures. Evidence:
tests/browser/caption-library.spec.ts and test-results/caption-library-mobile.png.

scripts/validate-caption-library.mjs imported real fixture media and rendered all 18 recipes to
720 × 1280 MP4. Every output passed duration, geometry, full decoding, immutable revision, and
byte-identical preview/export ASS checks. Independent black-background raster checks verified
visible glyphs, progressively revealed words, retained hidden words during a pause, and an
unchanged left edge at three timings. Underline uses explicit active/reset tags. Evidence:
.cache/caption-media-validation.json and .cache/caption-frames/.

Real Whisper/Qwen inference on the JFK speech fixture passed persisted rating, score-sum,
unchanged-edit, stale-revision, and conflict checks. A first manual podcast assessment failed
because positive scores had empty quotes; rejection preserved the clip. The final bounded
correction path and stricter quote schema produced a grounded 74/100 podcast assessment with
English explanations and editing suggestions. Screenshots use that actual result from an
isolated SQLite snapshot with hard-linked footage. Evidence: .cache/clip-rating-validation.json
and .cache/preview5-readme-validation.json. These functional fixtures do not calibrate rating
accuracy, recognition accuracy, or virality. Large language models can still give poor advice.

After checking all active SQLite jobs, dirty-page guards, visible dialogs, and upload actions,
the idle previous native host was closed normally. The new ARM64 debug host opened against the
canonical library with a stable copied studio directory. Its native bridge, 18 presets, three
ready models, amber palette, removed sidebar footer, and lack of horizontal overflow passed
read-only inspection. This is separate from browser interaction and installer execution.
Evidence: .cache/caption-live-guard.json and .cache/caption-native-validation.json.

Anti-slop During gate, scoped: original graphite/amber direction, real-word previews, actual
media and scores, functional keyboard controls, explicit empty/loading/disabled/failure states,
and narrow layouts passed the checks above. The supplied icon was recolored consistently. A full
screen-reader and contrast audit, physical x64/macOS/Linux/Android runtime, long-file benchmark,
fresh model downloads, and native installer/updater execution remain pending.

The preview.4 tagged workflow passed source/platform validation but failed both Windows builds
on a cross-drive WebView2 resource path. Publication was skipped. The workspace-drive staging
fix is committed; preview.4 must not be described as a successful hosted release.

## Published history maintenance, 2026-11-14

At the owner's request, reference names were removed from current Markdown and reachable
historical content/messages. All 67 commits, main, and the four existing preview tags were
rewritten and pushed with atomic updates and expected-ref leases. A verified full Git bundle
was preserved outside the workspace before rewriting. The release workflow was temporarily
disabled to prevent rebuilt historical tags creating duplicate releases, then restored before
the new preview tag. Existing signed installer bytes were not changed.

Older commit hashes recorded in dated evidence identify original validation checkouts; they
may no longer be reachable under the rewritten branch/tags. Existing workflow runs and signed
artifacts remain evidence of those original builds. This maintenance cannot erase external
clones or unreferenced objects cached by hosting services. Evidence:
.cache/history-cleanup-validation.json.

## Published preview.5, 2026-11-14

The [tagged release workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43610553764)
passed frontend quality and Windows/Linux/macOS Intel/Apple Silicon source checks, built both
Windows MSVC installers, and published all eight assets. The separate
[native media workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43610630250)
passed actual scene composition, all 18 caption renders, and nine browser tests on Windows ARM64.
Its downloaded evidence reproduced the same reveal pixel counts and stable left edge as the local
run. Hosted AI inference remains unprovisioned; actual Qwen evidence is local.

The [public preview.5 release](https://github.com/bayurifkialghifari/unlimitedclipper/releases/tag/v0.1.0-preview.5)
contains the 226,251,606-byte ARM64 installer and 287,198,792-byte x64 installer. All eight files
downloaded without authentication. Independent Ed25519/BLAKE2b signature checks, trusted signed
version checks, local SHA256SUMS, architecture manifests, and GitHub asset digests passed. Both
extracted application PE headers matched their native architecture. Evidence:
.cache/preview5-anonymous-download.json, .cache/preview5-signature-validation.json, and
.cache/preview5-published.json.

After active-job, dirty-editor, upload, HTML-dialog, and native-modal checks, the previous idle
host was closed normally. The published ARM64 application and its actual bundled studio were
copied into a stable runtime and opened against the canonical library. Native/API/file versions
matched 0.1.0-preview.5; 18 presets, three ready models, and 26 aligned Processing rows passed.
Retry controls had empty visible text and 44-pixel hit areas. All six registered assets and both
projects remained intact. The application stayed open on Studio. Evidence:
.cache/preview5-native-final.json and .cache/caption-native-processing.json.

This verifies the extracted ARM64 application, not native installer or updater execution. Physical
x64, macOS/Linux packages, Android runtime, a complete accessibility audit, fresh model downloads,
and long-file performance measurements remain pending. Final reviewed cleanup and a 14.73 GiB
workspace measurement are recorded in storage.md.

## Scene engine validation, 2026-11-14

The six scene integration tests cover reorder provenance, surviving manual corrections, extension
without caption resurrection, media offsets and stable layer fragments, crop boundaries, legacy
loading, and invalid/repeated scene rejection. The full engine suite passed 32 tests.

scripts/validate-scenes.mjs generated a three-second red/green/blue source with 440/660/880 Hz
audio. Its blue/red/green edited preview and all six 720p export layouts passed pixel samples,
audio frequency order, duration, AV start timing, full decode, subtitle order, and immutable
revision checks. Preview created no export record. Evidence: .cache/scene-media-validation.json.
This deterministic fixture verifies composition, not AI selection or caption recognition quality.

## Visual editor validation, 2026-11-14

Browser scene interactions passed with actual source media: drag reorder with no remap during
movement and one on release, playback from the source end into an earlier scene, undo, keyboard
trim, Escape cancellation, audio left-trim offset advancement, layer movement without changing
its media offset, caption-only deletion, transcript video cuts, composed rendering, and stale
playback protection. Layout checks passed at 390, 1280, 1920, and 2560 pixels. Existing upload,
caption/title/crop, reload/export, layer/audio, onboarding, and page-width tests also passed.
The complete browser suite passed all eight tests together. The subsequent Clips/Klip library
label correction passed the frontend check and changed no interactions. Evidence:
tests/browser/scenes.spec.ts and test-results/visual-editor.png.

The tests caught a repeated OffscreenCanvas transfer when preview mode/staleness changed and
completed notifications intercepting editor clicks. The renderer now retains its worker across
mode changes, replaces its canvas for a new media asset, and hides captions while stale.
Successful job notices expire after six seconds; active jobs and errors remain visible.

Anti-slop During delivery gate: the graphite studio, compact clip/transcript panel, independent
inspector scroll, source/media tracks, and lime playhead each serve editing or timing review.
Only real fixture records populate interaction screenshots. Enabled controls have working
actions, keyboard counterparts, disabled/error states, and visible focus; no promotional
statistics or competitor assets were introduced. The optimized preview.3 ARM64 host was checked
separately with a native file dialog, import, manual clip, scene reorder, caption autosave,
composed playback, and export playback. Its maximized 1920 × 1009 viewport had no horizontal
overflow or JavaScript errors. Evidence: .cache/preview3-native-validation.json.

The original frame/cut icon was extracted from the native executable and visually checked
against the SVG master. Evidence: .cache/preview3-native-icon.png. Refreshed README captures use
the browser studio and a manual podcast review in an isolated library snapshot, with no changes
to the source library. Their English UI shows the transcript, two-scene timeline, caption looks,
real project records, and installed models. Evidence: .cache/preview3-readme-validation.json and
docs/media/. Full accessibility and installer/updater runtime certification remain pending.

## Published Windows visual-editor preview, 2026-11-14

The [v0.1.0-preview.3 release](https://github.com/bayurifkialghifari/unlimitedclipper/releases/tag/v0.1.0-preview.3)
contains eight verified assets. Tagged source is 603c912ba50cf198b042de82faf576de6f63902c.
Both installers were built locally with the release-version transformation. The original
source version files were restored before committing/tagging; publisher private keys remained
outside the repository.

- Frontend lint, formatting, TypeScript, three unit tests, and production compilation passed.
  Engine scene changes passed 32 Rust tests, Rustfmt, and engine/desktop Clippy with warnings denied.
- ARM64 and x64 application compilation and NSIS packaging completed. Native PE headers were
  aa64 and 8664, and Windows file/product versions matched 0.1.0-preview.3. NSIS launchers are
  32-bit executables wrapping the native application; launcher headers do not identify the payload.
- Independent Ed25519/BLAKE2b signature verification passed for both installers, including the
  signed release version. Every local checksum and all eight GitHub asset digests matched.
  An authenticated download of all eight assets passed the same signatures and checksums again.
- The final cached ARM64 executable opened the original library in a maximized 1920 × 1009
  native window without overflow or JavaScript errors. Both projects, all six registered source
  assets, and the three canonical models remained available. No active jobs or dirty edits were
  interrupted when the idle host was replaced.

The ARM64 installer is 225,654,823 bytes (215.20 MiB); x64 is 286,467,429 bytes (273.20 MiB).
Evidence: .cache/preview3-pe-validation.json, .cache/preview3-signature-validation.json,
.cache/preview3-published.json, .cache/preview3-download-validation.json,
.cache/preview3-live-validation.json, and .cache/preview3-live-state.json.

The [tagged release workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43600419628)
started zero validation/build steps because GitHub reported failed account payments or a
spending-limit restriction. Hosted quality/media checks were blocked for the same reason.
Local results are recorded independently. Installer install/uninstall, native updater installation,
physical x64 runtime, complete accessibility certification, and Android runtime remain pending.
The repository was private at publication; it became public later that day at the owner's request.
Automatic installation still requires a configured publisher update feed.

## Processing-row alignment, 2026-11-14

The expanded browser layout scenario passed at 390, 1280, 1920, and 2560 pixels with completed,
cancelled, failed, and active jobs. It measured matching meter starts/widths and title/meter
vertical centers on desktop, checked the 44-pixel icon controls and translated accessible
names/tooltips, and activated retry with Enter while verifying its pending disabled state.
Long error details and the actual MP4 preview remain covered. The running fixture keeps its
activity popup visible; the test explicitly minimizes that popup before opening the export.
Evidence: tests/browser/layout.spec.ts and test-results/layout-jobs.png.

The live ARM64 host was refreshed only after confirming no active jobs or unsaved edits. All
26 real history rows passed the same alignment measurements; retry contained only its icon,
with no JavaScript errors. Evidence: .cache/jobs-alignment-native-validation.json and
.cache/jobs-alignment-native.png. Frontend lint/format/types/unit/build checks passed.
The engine was unchanged, so its existing 32-test, Rustfmt, and Clippy evidence remains applicable.

Anti-slop During gate, scoped: uniform columns provide predictable scanning; translated icon
names, native tooltips, visible focus, 44-pixel targets, pending disablement, and keyboard retry
preserve usable actions. Compact controls retain real processing feedback and expandable errors.
No invented status records are shipped. Full accessibility certification remains pending.

## Public repository and runner extraction, 2026-11-14

At the owner's explicit request, the repository became public. A read-only history scan examined
450 text blobs for common credentials and private-key formats without finding matches. Cache,
managed video data, tool binaries, and publisher keys were not tracked in Git. The visibility
change was confirmed through GitHub, and quality/media workflows started on public standard runners.

The media runner then exposed a Windows PowerShell ZIP-module failure: Expand-Archive attempted
an unavailable three-argument ExtractToDirectory overload. Build-time extraction now streams ZIP
entries with explicit destination containment. Local Windows PowerShell 5.1.26100.9711 checks passed
for nested files, replacing existing contents, and rejecting traversal without creating an escaped
file. Evidence: .cache/extract-compatibility-validation.json and
.cache/ci-failure-43601628952.log. The corrected extractor passed on the hosted ARM64 runner.

Public hosted validation passed for source 07ae289cb8685c3071079d7bccc88fb4e4cad7d1:
[quality checks](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43603624006)
completed frontend validation and engine Rustfmt/tests/Clippy on Windows, Linux, macOS Intel,
and Apple Silicon, including desktop Clippy on Windows.
[Native media](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43603624020)
completed actual editorial/scene rendering and the eight-test browser suite on Windows ARM64.
These source/media checks do not certify installers or runtime behavior on every platform.

## Desktop packaging on separate Windows drives, 2026-11-14

The preview.4 tagged quality stage passed on all four platforms, but both MSVC installer builds
failed before publishing: the WebView2 SDK was on C: while the checkout was on D:, and Tauri
resolved its absolute loader resource on the wrong drive. The publish job was skipped. Evidence:
[tagged workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43604634762)
and .cache/ci-failure-43604634762.log. This is not a successful hosted release.

The desktop script now copies the loader to architecture-specific workspace staging and supplies
relative resource paths. Frontend checks passed. A non-compiling CLI preparation check verified
that generated resources exist and the staged loader has the ARM64 PE header; full hosted
packaging with this fix remains pending. Evidence: .cache/desktop-resource-validation.json.

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
(273.10 MiB). These previews were initially published privately; downloads are now public.
Automatic installation requires a configured publisher update feed. Windows Authenticode signing is not configured. Some
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

## Economy discovery and scene framing, 2026-11-15

ESLint, Prettier, TypeScript, frontend unit tests, and the production studio build passed.
The engine passed 43 tests, workspace Rustfmt, and engine/desktop Clippy with warnings denied.
New checks cover bounded overlapping windows, sparse batching, grounded review dimensions,
face association, cut anchors, optimistic tracking commits, stale/missing-job rollback,
censored speech, and instance-lock-protected abandoned inference-key cleanup.

All 11 browser scenarios passed, including real clip creation followed by one inspector
scrollbar at 1920, 1280, 1024, and 390 pixels, keyboard tab navigation, forced-color fallback,
persisted Economy/Gaming settings, and the pinned 1.7B option. Evidence: tests/browser/studio-scroll.spec.ts
and .cache/economy-browser.log. Controlled UI responses do not establish AI selection quality.

The actual 1.7B model downloaded through the app's worker and independently passed its pinned
SHA-256 and 1,282,439,264-byte size. A real 180-second podcast excerpt exercised 1.7B proposals,
4B full-transcript review, exact quotes, shortfall reporting, bounded recovery, and idempotent
clip insertion. This early run found zero qualifying cuts; it validates rejection/recovery,
not selection quality. Its observed process-tree working sets peaked at 2,875,072,512 bytes
in the 1.7B stage and 5,886,414,848 bytes in 4B review on the tested 16 GB ARM64 PC. Later
recovery uses 4B proposals and numbered phrase IDs; the completed full-recording run is below.
Evidence: .cache/economy-model-download.log and .cache/economy-discovery-validation.json.

The controlled moving-face fixture passed Follow and Two-face split across reordered scenes,
paired cut anchors, full 720 x 1280 / 8-second export decoding, interrupted-commit recovery
without another revision, and constrained Facecam preserving gameplay. Its split frame was
visually inspected. This fixture uses an astronaut photo with controlled motion and JFK audio;
it is not a natural podcast identity benchmark. Evidence: scripts/validate-framing.mjs,
.cache/economy-framing-validation.json, and .cache/economy-framing-proof.png.

A separate full-recording fixture restored 8,894 words from the existing raw recognition,
compared with 2,410 previously persisted words. Censored text had suppressed the later
segments despite complete 48-minute recognition output. No speech inference was needed.
Cancellation stopped the inference server before retry. The final phrase-selection path
accepted four of the requested four clips from this 2,908,354 ms recording in 595,864 ms
(about 9.93 minutes). This reused recognition and is not a full import/transcription benchmark.
All four source ranges, opening/ending quotes, independent dimension sums, minimum dimension
scores, and persisted boundaries passed checks. Scores were 86, 78, 84, and 83; durations
were 53.52, 42.48, 28.22, and 39.52 seconds. The bounded pipeline completed 51 inference
calls and 42 proposal sections. Titles and editorial usefulness still require human review;
one title was generic. Evidence: scripts/validate-complete-discovery.mjs and
.cache/economy-complete-discovery-validation.json.

The first natural clip completed automatic medium caption refinement, Follow fallback from
the requested split mode, and a 720 x 1280 / 53.52-second export with full decoding. Tracking
reported 89 detections and 59 missing samples in one shot, with no stable two-face split.
The inspected frame has readable captions and the subject framed; this does not certify
all-frame tracking or natural two-face identity accuracy. Immutable export retry preserved
one export record. Evidence: scripts/validate-discovered-export.mjs,
.cache/economy-natural-export-validation.json, and .cache/economy-natural-export.png.

This natural export exposed excessive nesting in the old crop expression. Balanced
interpolation and managed graph files fixed it. A separate 300-anchor / 46,812-byte graph
then passed both edited preview and export at 720 x 1280 / 8 seconds, with full decoding
and the saved anchors/revision unchanged. The graph exceeds the Windows command-line limit.
Evidence: scripts/validate-motion-render.mjs and .cache/economy-motion-render-validation.json.

The ARM64 development desktop build opened against the canonical library only after idle,
unsaved-page, transfer, and native-modal guards passed. Native WebView2 at 1920 x 1009 has one
themed inspector scrollbar and no horizontal overflow. Economy/profile controls and all four
ready model options are visible. Evidence: .cache/economy-native-validation.json and
.cache/economy-native-caption.png. This is distinct from packaged release verification.

Anti-slop During gate, scoped: original palette, actual data, fixed tabs, one themed rail,
accessible keyboard controls, forced-color fallback, and explicit job failures/shortfalls
passed the stated checks. Active speaker detection, broad recognition/selection accuracy,
physical Android/x64/macOS/Linux runtime, installer execution, and automatic updater execution
remain unverified.

## Preview.6 hosted checks, 2026-11-15

The final source at `67f96dc` passed [quality run 43625762121](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43625762121):
frontend checks and Rust tests/Clippy on Windows, Ubuntu, Intel macOS, and Apple macOS.
These are build/test checks, not desktop runtime certification on all four platforms.

[Native media run 43625762070](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43625762070)
passed six compositions, edited preview, scene order/color/audio checks, revision conflicts,
all 18 caption recipes, and browser interactions on Windows ARM64. Downloaded evidence is
in .cache/preview6-ci-media. This run does not perform full podcast AI selection or certify
natural face identities; those local fixtures and their limits are recorded above.

[Tagged release run 43625776736](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43625776736)
passed and published preview.6 ARM64/x64 installers plus manifests, signatures, and SHA256SUMS.
All eight anonymous downloads matched their server sizes and SHA-256 digests. Both publisher
signatures and their trusted version comments passed independent verification. Extracted
application PE architectures matched ARM64/x64. Evidence: .cache/preview6-published.json,
.cache/preview6-signature-validation.json, and .cache/preview6-native-binaries.json.

The published ARM64 executable opened after fresh idle, unsaved-edit, upload, and native-dialog
guards passed. Native WebView2 at 1920 x 1009 confirmed version 0.1.0-preview.6, the Tauri
bridge, one themed inspector scrollbar, no horizontal overflow, Economy controls, four ready
models, and all six registered canonical assets present. The README hero is this actual
native screenshot; its two existing clips are separate from the four-clip discovery fixture.
Evidence: .cache/preview6-native-final.json and .cache/preview6-native-studio.png.
Installer execution, Authenticode signing, automatic update installation, physical x64,
macOS/Linux desktop runtime, and Android runtime remain unverified.

Final audited cleanup removed 13,565,252,489 bytes (12.63 GiB) of unique files from build
caches, obsolete runtime copies, old installers, and extracted packages. Multiply-linked
files are excluded from this conservative reclaimed-byte count. Resolved targets stayed
inside the workspace, no junctions were traversed, no compiler was active, and the running
published executable was protected. Canonical videos, models, required tools, publisher keys,
current installers, and the three current processing fixtures were retained.
Evidence: .cache/preview6-cleanup-applied.json.
The native geometry, ready-model list, and registered-asset checks passed again after cleanup;
the published application remains open. Final storage measurements are in
.cache/preview6-storage-final.json.

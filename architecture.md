# Architecture

## Components

The React studio is shared by the Tauri window and local browser sessions. An Axum server in the Rust engine owns the versioned API, asset delivery, SQLite state, and a single heavy-job scheduler. The Tauri wrapper supplies native dialogs, window lifecycle, and signed application updates. The standalone engine serves the compiled studio without Tauri.

Desktop window and local browser -> React studio -> Rust API -> SQLite, managed files, and durable job queue -> native media and inference tools.

## Data flow

Import streams into managed storage, probes metadata, and creates a project. Generation extracts audio, transcribes words, selects clips, and records completed checkpoints. Editing creates revisioned documents. Rendering snapshots a revision, builds a filter plan and ASS track, writes temporary output, verifies it, then commits the export record.

The storyboard service accepts bounded source-time samples for a registered project preview proxy.
One queued FFmpeg job extracts small JPEGs without interrupting the live player. A project/time
cache table holds only managed asset IDs; images remain in managed files, survive scene reorder,
and are evicted or deleted with their project. Completed frames remain usable if a job fails or
is cancelled. The browser requests only the active timeline and visible clip-rail cards.

Discovery persists source-word offsets, transcript-grounded candidate quotes, review candidates, batch offsets, and accepted suggestions before creating an insertion plan. Count and duration are editorial constraints, with complete phrases taking priority over padding. Per-clip caption jobs preserve raw recognition by source range and save an applied-document checkpoint before the optimistic edit transaction. Recovery recognizes that exact committed document instead of creating an extra revision. Preview seek commands are separate from passive playback updates so reviewing a word changes the actual media position.

All persisted times are integer milliseconds. Source word timing remains immutable; clip edits contain local overrides. Legacy crop rectangles use normalized source coordinates, with sorted clip-relative position keyframes and linear interpolation. Version 4 camera and text/note motion use content-relative keyframes with an engine-compiled easing curve. Rendering and live preview consume the same revisioned document and output geometry.

New desktop discovery jobs freeze the transcript, preferences, model identifiers/hashes, and
bounded overlapping transcript windows. Sparse neighboring windows share a prompt when the
combined transcript fits its byte budget. Each proposal/review stage owns one supervised
llama-server process, with a 4,096-token context, exact tokenizer admission, 1,024-token output
budget, one slot, and at most four CPU threads. The proposal server stops before final review
loads. Review receives the complete candidate transcript and no proposal score. Exact quoted
dimensions, offsets, candidate pools, accepted ranges, and shortfall counters persist for retry.
Legacy jobs and the unverified Android native path retain the previous CLI selection path.
Proposal models select numbered phrase ranges. Rust maps them to absolute source-word times,
extracts opening/ending quotes, and ranks coverage with source-time diversity. Independent
review supplies the displayed score. The bounded recovery pass uses the review model for proposals, sampling
podcast context across the recording or prioritizing Gaming audio changes. Abandoned private
inference-key files are removed only after acquiring the exclusive data-directory lock.
The parser version participates in new transcript configuration. Matching saved Whisper JSON
can restore source words previously lost after censored text without loading Whisper again.
Bounded closed annotations cannot suppress the remainder of a recording. Frozen retries keep
their original words and offsets.

Tracking decodes edited scenes through a bounded two-frame channel instead of retaining raw
frames. YuNet uses one process-wide ONNX environment and a per-scene session. Color descriptors,
overlap, movement, and size associate faces within each shot. Output-relative crop anchors
hold across missing detections; cut boundaries reset association. Automatic split layers have
deterministic shot IDs. A successful optimistic clip update and transaction-backed committed
revision are saved together; retries cannot infer success from a prewritten document or float
equality. Later user edits invalidate that recovery marker.

## Persistence

VideoAdjustments is an engine-validated optional legacy default within EditDocument. Its four
integer values produce a fixed FFmpeg color plan applied before graphics. TitleStyle adds
defaulted output-relative start time and animation. Health lists editor capabilities so older
hosts disable unsupported controls. Built-in CC0 WAV files ship with the Studio, pass a hash
check before import, and enter the existing managed-asset registry. The subtitle library owns
its own canvas inside a React-owned host, so library teardown cannot remove React's host node.

Caption recipes are engine-owned value objects. A separate caption_presets table stores up to
50 validated user recipes; applying one copies styling into the edit document and preserves
visibility/position. Deleting the recipe never changes an existing revision. Migration 0003
also adds clip_assessments with cascading clip deletion. Assess jobs freeze a clip and language,
validate structured Qwen output against the full bounded transcript, checkpoint results, and
save without editing the clip. Revision ordering prevents old retries replacing newer scores.

EditDocument v2 composes chronological source segments and output-relative layers. Version 3
adds stable scene IDs and arbitrary output order while retaining disjoint source coverage. Its
source envelope differs from the summed output duration. Health advertises supported document
versions so an older host cannot silently accept incompatible scene edits. Rust owns remapping
and splits layers at removed intervals, advancing their asset offsets. Version 1 loads as a single
source range. WordTiming stores estimated/aligned/manual provenance, source anchors, and independent
alignment confidence. Automatic proposals and render jobs freeze revisions; applying a proposal
uses the editor transaction and autosave checks. Caption groups stop at source cuts. Source VTT
cues are sorted by source time; output VTT and rendered captions retain edited scene order.

Version 4 adds optional HeadingCard values before/after content. Legacy duration_ms remains
content duration; explicit content/final duration and content/source mappings prevent card
offsets entering edits or acoustic alignment. Version 4 final-output mapping returns no source
inside cards. Scene remaps preserve card clocks and document version. Rendering completes
the content picture/audio first, concatenates card sections with silence or registered narration,
and offsets ASS/SRT/output VTT once. Narration jobs freeze card text and edit revision, synthesize
with the verified local voice pack, and register the WAV as a managed audio asset. Applying a
completed result uses the normal edit transaction and rejects a stale revision or changed text.
Live playback uses a monotonic card clock while its source decoder is paused; the timeline
playhead remains on the content clock. Health gates version 4/card and narration controls.

Version 4 also stores camera center/zoom and text/note position/scale/opacity keyframes on the
content clock. The engine compiles linear, ease-in, ease-out, smooth, hold, and bounded custom
curves for preview plans, scene remaps, and export. Remaps preserve the easing segment across
trim/reorder boundaries. Camera motion is limited to portrait, square, and landscape layouts;
animated text/note layers are limited to 120 seconds. Registered B-roll layers use the same
content-clock curve for zoom/pan and opacity. Rendering converts zoom/pan to per-frame FFmpeg
zoompan expressions; alpha values are sampled into a managed per-job command file and applied
before overlay. The live canvas uses the same curve and cover-then-zoom geometry. B-roll zoom
stays at or above one so the frame remains covered; up to 24 anchors and 120 seconds are allowed.
Other visual layer motion is rejected. Legacy crop anchors are converted when manual camera
motion is first added, while unchanged legacy documents remain readable.

Hook proposal jobs freeze the clip revision and project output language before local Qwen
inference. The engine validates contiguous transcript quotes, bounds each proposal, and stores
the accepted set by job ID in migration 0004. Generation never edits the clip. The Studio fetches
the saved set, checks the current revision and clean draft before applying a choice, and then
uses the existing undo/autosave transaction. The save API remains the final optimistic conflict
guard if another editor changes the clip between fetch and save.

Automatic editing can optionally add a camera-motion proposal to the same frozen document.
Existing crop anchors take precedence; otherwise only single-face samples contribute bounded
pan targets. Up to four transcript-selected emphasis words add small zoom pulses. Multi-face
samples never imply a speaker identity. Scene boundaries use hold anchors so a cut does not
become a cross-shot pan. The latest auto-edit job is fetched by clip directly from persisted
jobs, including after the recent-jobs list rolls over. Silence-removal jobs store the exact
interior source-time gaps they removed in the proposed document. Applying the whole proposal
uses the normal revision-aware editor transaction; no proposal mutates the clip on generation.

Edited preview and export share render_media, including AV concat, split framing, local B-roll,
ASS graphics, and audio mixing. An exact preview bakes every graphic and creates no export
record. A cache-version salt prevents older caption-free previews being reused as complete
compositions. Managed previews have a bounded cache. Audio imports use registered managed files
and persisted durations, with no filesystem paths exposed through layer controls.
Dense crop anchors compile to balanced piecewise interpolation rather than a linear chain
of nested conditions. Desktop media jobs write their graph to a managed temporary argument
file consumed by the pinned FFmpeg build. This avoids expression-depth and Windows argument
length failures without removing motion anchors. Native Android keeps its inline adapter.

Live review paints hidden media decoders and CPU libass bitmaps into one visible Canvas2D
surface. A revision-checked preview-plan endpoint validates the draft and managed layer IDs
and supplies the engine ASS track. Exact review paints the fully rendered video into that
same surface. Live RGB filters approximate the exporter and source audio is retained; exact
rendering remains the final audio/color review. Project galleries and persistent clip routes
separate discovery/range creation from focused editing. Imports cannot replace an active draft.

UC_MODELS_DIR freezes a shared model-store path at startup. UC_MODELS_READ_ONLY=1 disables model
imports/downloads for fixtures borrowing the canonical store. Optional native alignment uses
pinned ONNX weights with staged checksum-verified activation. The speaker frontend is original
Rust code; its reference parity remains pending. Cleanup retains retryable checkpoints and all
registered temporary assets, including jobs outside the recent-history view.

SQLite uses WAL, foreign keys, short transactions, busy timeout, and explicit migrations. Videos are files, not database blobs. Application data lives in the OS local-data directory, optionally overridden for development. Asset routes accept registered IDs; filenames and filesystem paths are not unrestricted API inputs.

## Local services

The API binds to loopback. Session bootstrap uses a one-time token, followed by an HttpOnly session cookie. Requests validate origin, and native permissions are limited to the studio origin. SSE includes sequence numbers and current job snapshots so reconnection can recover state. Browser and desktop share a single engine instance per data directory.

## Toolchain and portability

Tools are separately licensed executables launched without a shell. Their manifests specify platform, version, URL, size, and checksum. CPU inference is the initial portable baseline. The platform/toolchain boundary is replaceable for future macOS, Linux, and Android integrations. Android must use a native library integration rather than assuming desktop subprocess distribution works.

Native hosts can supply data, tool-resource, and compiled studio directories plus a loopback port
through EngineConfig and start_with_config. The existing desktop/standalone startup keeps its
environment and OS-data-directory behavior. The Android host supplies its private application
directory explicitly and runs the authenticated engine on loopback port 43179. Its media-only
provider calls packaged FFmpeg/FFprobe libraries; inference and downloader adapters remain pending.
Android runtime behavior is untested. See docs/features/android.md.

NativeTools supplies argument-array execution, media progress, tool capabilities, and cancellation
completion to the engine. Managed capture and rendering retain the existing desktop subprocess
backend when no native provider is supplied. Native admission rejects unsupported jobs before
persistence and applies the same guard to retries. Progress-write failures cancel and await native
completion before releasing the scheduler. The Android media provider selects MediaCodec H.264
instead of desktop x264; export timing and immutable revisions stay in the engine.

## Updates

Tauri verifies application update signatures and their signed version. Component updates use a separately signed manifest, architecture checks, immutable staged directories, executable health checks, and a persistent previous-version pointer. An idle restart applies DLL changes; rollback persists across another restart. Native application updates create a consistent SQLite backup with VACUUM INTO. Active jobs, including older jobs outside the recent-history view, and uncommitted editor leases prevent installation.

Queue admission, worker claiming, cancellation, retries, deletion, and update activation share an operation gate. Process job objects stop child processes when the owner exits. A cancelled job becomes terminal only after its process has stopped. Export IDs derive from the job, clip, and immutable revision so recovery cannot duplicate an already committed export.

Sessions survive engine restarts until their existing expiration. The data-directory file lock prevents concurrent owners. Interrupted upload files are removed only after acquiring that lock. Preview proxies and original source files remain separate managed assets.

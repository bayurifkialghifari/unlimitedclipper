# Architecture

## Components

The React studio is shared by the Tauri window and local browser sessions. An Axum server in the Rust engine owns the versioned API, asset delivery, SQLite state, and a single heavy-job scheduler. The Tauri wrapper supplies native dialogs, window lifecycle, and signed application updates. The standalone engine serves the compiled studio without Tauri.

Desktop window and local browser -> React studio -> Rust API -> SQLite, managed files, and durable job queue -> native media and inference tools.

## Data flow

Import streams into managed storage, probes metadata, and creates a project. Generation extracts audio, transcribes words, selects clips, and records completed checkpoints. Editing creates revisioned documents. Rendering snapshots a revision, builds a filter plan and ASS track, writes temporary output, verifies it, then commits the export record.

Discovery persists source-word offsets, transcript-grounded candidate quotes, review candidates, batch offsets, and accepted suggestions before creating an insertion plan. Count and duration are editorial constraints, with complete phrases taking priority over padding. Per-clip caption jobs preserve raw recognition by source range and save an applied-document checkpoint before the optimistic edit transaction. Recovery recognizes that exact committed document instead of creating an extra revision. Preview seek commands are separate from passive playback updates so reviewing a word changes the actual media position.

All persisted times are integer milliseconds. Source word timing remains immutable; clip edits contain local overrides. Crop rectangles are normalized source coordinates, with sorted clip-relative keyframes and linear interpolation. Rendering and preview consume the same document and output geometry.

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

Edited preview and export share render_media, including AV concat, split framing, local B-roll,
ASS graphics, and audio mixing. A preview omits captions for a live browser ASS overlay and creates
no export record. Managed previews have a bounded cache. Audio imports use registered managed files
and persisted durations, with no filesystem paths exposed through layer controls.
Dense crop anchors compile to balanced piecewise interpolation rather than a linear chain
of nested conditions. Desktop media jobs write their graph to a managed temporary argument
file consumed by the pinned FFmpeg build. This avoids expression-depth and Windows argument
length failures without removing motion anchors. Native Android keeps its inline adapter.

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

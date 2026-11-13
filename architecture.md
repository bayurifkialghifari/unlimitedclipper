# Architecture

## Components

The React studio is shared by the Tauri window and local browser sessions. An Axum server in the Rust engine owns the versioned API, asset delivery, SQLite state, and a single heavy-job scheduler. The Tauri wrapper supplies native dialogs, window lifecycle, and signed application updates. The standalone engine serves the compiled studio without Tauri.

Desktop window and local browser -> React studio -> Rust API -> SQLite, managed files, and durable job queue -> native media and inference tools.

## Data flow

Import streams into managed storage, probes metadata, and creates a project. Generation extracts audio, transcribes words, selects clips, and records completed checkpoints. Editing creates revisioned documents. Rendering snapshots a revision, builds a filter plan and ASS track, writes temporary output, verifies it, then commits the export record.

Discovery persists source-word offsets, transcript-grounded candidate quotes, review candidates, batch offsets, and accepted suggestions before creating an insertion plan. Count and duration are editorial constraints, with complete phrases taking priority over padding. Per-clip caption jobs preserve raw recognition by source range and save an applied-document checkpoint before the optimistic edit transaction. Recovery recognizes that exact committed document instead of creating an extra revision. Preview seek commands are separate from passive playback updates so reviewing a word changes the actual media position.

All persisted times are integer milliseconds. Source word timing remains immutable; clip edits contain local overrides. Crop rectangles are normalized source coordinates, with sorted clip-relative keyframes and linear interpolation. Rendering and preview consume the same document and output geometry.

## Persistence

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

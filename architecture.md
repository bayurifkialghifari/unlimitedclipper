# Architecture

## Components

The React studio is shared by the Tauri window and local browser sessions. An Axum server in the Rust engine owns the versioned API, asset delivery, SQLite state, and a single heavy-job scheduler. The Tauri wrapper supplies native dialogs, window lifecycle, and signed application updates. The standalone engine serves the compiled studio without Tauri.

Desktop window and local browser -> React studio -> Rust API -> SQLite, managed files, and durable job queue -> native media and inference tools.

## Data flow

Import streams into managed storage, probes metadata, and creates a project. Generation extracts audio, transcribes words, selects clips, and records completed checkpoints. Editing creates revisioned documents. Rendering snapshots a revision, builds a filter plan and ASS track, writes temporary output, verifies it, then commits the export record.

All persisted times are integer milliseconds. Source word timing remains immutable; clip edits contain local overrides. Crop rectangles are normalized source coordinates, with sorted clip-relative keyframes and linear interpolation. Rendering and preview consume the same document and output geometry.

## Persistence

SQLite uses WAL, foreign keys, short transactions, busy timeout, and explicit migrations. Videos are files, not database blobs. Application data lives in the OS local-data directory, optionally overridden for development. Asset routes accept registered IDs; filenames and filesystem paths are not unrestricted API inputs.

## Local services

The API binds to loopback. Session bootstrap uses a one-time token, followed by an HttpOnly session cookie. Requests validate origin, and native permissions are limited to the studio origin. SSE includes sequence numbers and current job snapshots so reconnection can recover state. Browser and desktop share a single engine instance per data directory.

## Toolchain and portability

Tools are separately licensed executables launched without a shell. Their manifests specify platform, version, URL, size, and checksum. CPU inference is the initial portable baseline. The platform/toolchain boundary is replaceable for future macOS, Linux, and Android integrations. Android must use a native library integration rather than assuming desktop subprocess distribution works.

## Updates

Tauri verifies application update signatures and their signed version. Component updates use a separately signed manifest, architecture checks, immutable staged directories, executable health checks, and a persistent previous-version pointer. An idle restart applies DLL changes; rollback persists across another restart. Native application updates create a consistent SQLite backup with VACUUM INTO. Active jobs, including older jobs outside the recent-history view, and uncommitted editor leases prevent installation.

Queue admission, worker claiming, cancellation, retries, deletion, and update activation share an operation gate. Process job objects stop child processes when the owner exits. A cancelled job becomes terminal only after its process has stopped. Export IDs derive from the job, clip, and immutable revision so recovery cannot duplicate an already committed export.

Sessions survive engine restarts until their existing expiration. The data-directory file lock prevents concurrent owners. Interrupted upload files are removed only after acquiring that lock. Preview proxies and original source files remain separate managed assets.

# Render and export

Requirement: FMT-01 / EXP-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Render jobs bound the main decoder to at most two workers, the filter graph to one, and H.264
encoding to half the available cores, clamped to one through four. This limits CPU/thread
allocation; speed and memory still depend on geometry, source,
and layer count. Output verification checks dimensions, duration, and audio. Edited review
shows a loading state until video data is available. UI regression checks inspect painted
frames in addition to media readiness. The reported transient black preview was not consistently
reproduced; canvas lifecycle and first-load handling are hardened without claiming a GPU fix.

Render portrait, square, landscape, preserved composition, blur background, or gaming layouts. Export 720p/1080p/1440p/2160p MP4 plus SRT and ASS, individually or in batches.

The render snapshot is captured when the job is queued. Export IDs derive from the job, clip, and revision, so a retry can reuse a committed export even if its job checkpoint was interrupted. Batch progress includes the current item. All six compositions passed a real 720p timing test; native 1080p export passed separately.

Dense crop anchors use balanced piecewise expressions, preserving linear interpolation with
logarithmic expression nesting. Desktop FFmpeg reads the graph from a managed temporary
argument file through `-/filter_complex`, avoiding Windows command-line limits. Edited
previews share this path. Android retains its embedded inline graph adapter; native Android
rendering with dense motion is untested.

The recovery fixture cancels after the first completed item, retries the remainder, and reproduces a lost job checkpoint after exports have been committed. All five immutable files retain their hashes and modification times after explicit restart recovery. Five thirty-second exports from an 84-minute Indonesian source also passed 1080 × 1920 geometry, audio, duration, and full-decoding checks.

## File storage

Exports are managed files in the engine data directory's exports folder, with MP4, SRT,
and ASS sharing the export ID. Development uses .data/exports; installed applications use
their OS application-data location. A user-selectable export destination in Settings is
planned for a later change and is not implemented in this preview.

## Interface

Version 2 timelines concatenate video and audio together, normalize sample aspect ratio, and
share composition with 720p edited previews. Split layers use the selected output geometry.
Local B-roll keeps the soundtrack; registered audio layers use bounded offsets and limiting.
Multi-cut rendering with notes, punch-ins, split framing, B-roll, and imported audio passed a
six-layout Windows ARM64 media fixture. See editorial-timeline.md for timing and cache behavior.

POST /api/v1/clips/{id}/export; POST /api/v1/projects/{id}/export; GET /api/v1/exports

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Snapshot edit revisions, normalize timestamps, report actual FFmpeg progress, verify temporary files, and commit only valid outputs. Failed batches preserve completed exports.

## Acceptance scenarios

Test all layouts/resolutions, caption/title/watermark combinations, audio sync, cancellation, partial batch retry, and output duration.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

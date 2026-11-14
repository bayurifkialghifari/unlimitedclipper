# Render and export

Requirement: FMT-01 / EXP-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Render portrait, square, landscape, preserved composition, blur background, or gaming layouts. Export 720p/1080p/1440p/2160p MP4 plus SRT and ASS, individually or in batches.

The render snapshot is captured when the job is queued. Export IDs derive from the job, clip, and revision, so a retry can reuse a committed export even if its job checkpoint was interrupted. Batch progress includes the current item. All six compositions passed a real 720p timing test; native 1080p export passed separately.

Dense crop anchors use balanced piecewise expressions, preserving linear interpolation with
logarithmic expression nesting. Desktop FFmpeg reads the graph from a managed temporary
argument file through `-/filter_complex`, avoiding Windows command-line limits. Edited
previews share this path. Android retains its embedded inline graph adapter; native Android
rendering with dense motion is untested.

The recovery fixture cancels after the first completed item, retries the remainder, and reproduces a lost job checkpoint after exports have been committed. All five immutable files retain their hashes and modification times after explicit restart recovery. Five thirty-second exports from an 84-minute Indonesian source also passed 1080 × 1920 geometry, audio, duration, and full-decoding checks.

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

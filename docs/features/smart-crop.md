# Smart crop

Requirement: CRP-01. Status: implemented; actual runtime coverage is in ../validation.md.

## Behavior

YuNet detects faces through native ONNX Runtime at 640 × 640. One process-wide environment
supports repeated jobs and edited scenes; a changed runtime path requires restart. FFmpeg
streams frames through a two-frame bounded channel. Detection normally samples at 2 fps and
increases to 4 fps when faces move or the number of faces changes. Raw frames are not retained.

Tracking follows edited scene order and saves integer output-relative timestamps. Shot cuts
reset face association. Lightweight color descriptors, overlap, movement, and size keep a
consistent face within the shot. Dead zones, velocity limits, and headroom stabilize framing.
Missing detections hold the last crop and appear in the tracking report.

- Follow writes editable crop keyframes. Paired anchors at a cut prevent a slow pan through it.
- Two-face split creates one deterministic split layer per stable two-face shot. Existing
  manual split and punch-in layers take priority. Unsupported shots retain Follow framing.
- Facecam searches only the chosen gaming facecam region and fits its crop inside that region.
  The independent gameplay crop remains unchanged.

The job freezes the requested revision/document and checkpoints detected shots. Saving uses
one SQLite transaction for the optimistic clip update and committed revision marker. Retry
after that commit preserves the revision; later manual edits require a new tracking job.
Cancelled jobs stop their child process before becoming terminal.

## Limits

There is no active speaker detection. Face tracking does not know who is talking. Occlusion,
similar faces, small faces, fast motion, and severe lighting changes can defeat association.
Facecam uses one fitted region, not animated per-frame gaming keyframes. Review Edited preview
and adjust manual crops/layers where needed. Missing all faces preserves the edit and gives
an explicit error. Native Android tracking remains unavailable and untested.

## Interface

POST /api/v1/clips/{id}/track accepts revision and mode (follow, split, facecam). Empty legacy
requests remain supported. The editor flushes autosave before admission. PUT /api/v1/clips/{id}
continues to support manual crops and normalized keyframes.

## Acceptance scenarios

Exercise moving faces, multiple/no faces, edited scene order, cut anchors, constrained facecam,
manual-layer priority, export decoding, cancellation, and revision-safe recovery. Controlled
motion evidence does not certify identity tracking on all natural recordings.

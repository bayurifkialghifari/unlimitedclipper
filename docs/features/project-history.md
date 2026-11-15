# Project and clip history

Requirement: LIB-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

List real imported projects, suggested/manual clips, thumbnails, saved edits, and completed exports. Reopen projects without downloading their sources again.

Search and deletion operate on persistent records. Cleanup removes unreferenced managed assets while preserving watermarks shared by another clip. Source, preview, and thumbnail assets are distinct. Completed exports retain their immutable revision and registered MP4/SRT/ASS assets.

## Interface

Page headers and galleries use the available window width. Project search stays aligned with the
right content edge on desktop and spans the content width on narrow screens. The export gallery
shows real immutable records with revision/date metadata, download links, and an on-demand video
preview. Opening a preview loads the registered MP4 and converts its immutable SRT sidecar to a
browser VTT track. Closed previews do not download video media.

Projects open a gallery of saved clips with their actual names and source/output durations.
Edit clip opens its persistent /studio/:clipId route. Create a clip opens a separate source-range
page with seconds and playhead setters. Direct studio links restore the matching revision.
New imports refresh the project list without selecting a different clip in an active editor.
Gallery thumbnails currently reuse each project's source thumbnail.

GET /api/v1/projects; GET /api/v1/projects/{id}; GET /api/v1/exports

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Deletion is explicit and removes only managed project files after active work is stopped. Missing external exports are represented honestly.

## Acceptance scenarios

Check reopening, search, empty/filtered states, project deletion, exported revisions, and interrupted work.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

# Project and clip history

Requirement: LIB-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

List real imported projects, suggested/manual clips, thumbnails, saved edits, and completed exports. Reopen projects without downloading their sources again.

Search and deletion operate on persistent records. Cleanup removes unreferenced managed assets while preserving watermarks shared by another clip. Source, preview, and thumbnail assets are distinct. Completed exports retain their immutable revision and registered MP4/SRT/ASS assets.

## Interface

GET /api/v1/projects; GET /api/v1/projects/{id}; GET /api/v1/exports

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Deletion is explicit and removes only managed project files after active work is stopped. Missing external exports are represented honestly.

## Acceptance scenarios

Check reopening, search, empty/filtered states, project deletion, exported revisions, and interrupted work.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

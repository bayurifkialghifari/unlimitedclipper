# Caption editor

Requirement: CAP-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Edit timed words and selected groups, apply presets, customize typography, colors, outline, box/word highlighting, position, and animation. Undo/redo modifies the draft; autosave commits revisions.

Caption previews and exports consume the same ASS document. The browser also provides a source-relative VTT accessibility track; SRT and ASS remain clip-relative. Noto Sans, Arabic, Thai, Devanagari, CJK, DM Sans, and Oswald are bundled with pinned hashes. Text edits, selection, emphasis, per-word color, and word timing persist through revision-aware autosave.

## Interface

GET /api/v1/clips/{id}; PUT /api/v1/clips/{id}; GET /api/v1/clips/{id}/subtitles

## States and failure handling

ASS tracks wrap long lines inside the output margins. The same ASS document drives the browser renderer and FFmpeg export. Source-preview failures and subtitle-renderer failures have separate messages, so a video failure is not reported as a caption failure.

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Keep immutable source timings and clip-local edits. Reject negative/unsorted/out-of-range times. Revision conflicts retain the current draft and offer explicit reload. Preview and export use the same ASS and fonts.

## Acceptance scenarios

Validate text escaping, multilingual glyphs, word selection, timing edits, undo/redo, autosave conflicts, and rendered highlight frames.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

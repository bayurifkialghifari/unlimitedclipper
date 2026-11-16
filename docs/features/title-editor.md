# Title editor

Requirement: TTL-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Generate a hook locally from the selected clip or edit one manually. Configure preset, typography, position, color, and display duration.

The Hook editor supports multiline text, three reusable looks, typography, color, and vertical
position. Looks copy styling while preserving text and timing. Show from uses output-relative
seconds; Start at playhead sets that position. None, Fade, and Pop animations share ASS rendering
in Source, Edited, and export. Timing and animation controls require the timed_hooks health
capability. Older documents start at zero without animation. Empty text or zero duration hides
the hook. Display ends at the clip boundary; it never adds duration to the output.

The Hook tab presents compact numbered local ideas. Selecting one shows its transcript quote and
reason before choosing an overlay or opening card. The chosen idea seeks to its opening in the
player and enters Undo/Redo. Presentation-only edits leave the saved ideas usable; changing the
source range, scene order, or transcript makes them stale. Older proposal sets without a source
signature retain the previous revision guard. Manual controls can switch the current opening
between an overlay and a card without generating another idea. Preview hook seeks the current
overlay start; opening cards retain their own preview action.

Move a teaser to the start selects 0.3 to 5 seconds of existing clip footage and moves that
range before the other scenes. It does not duplicate the source moment or extend the clip.
The Rust preview endpoint remaps captions, layers, audio offsets, and motion to the new order.
The action enters normal Undo/Redo history and revision-aware autosave. A saved Hook proposal
becomes stale when its source order changes.

Generated titles use the saved clip transcript and an expected revision. A concurrent edit causes a conflict rather than being overwritten. Manual text, presets, font, size, color, vertical position, and timed display share the preview/export document. Real local title inference and native manual title editing passed.

Title generation and face tracking share an admission guard per clip. The interface disables those actions while a queued, running, or cancelling edit job exists. A retry reads the current revision before admission. The title prompt names the detected language explicitly; model output still requires review for language and factual accuracy.

## Interface

POST /api/v1/clips/{id}/title; PUT /api/v1/clips/{id}

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Validate locally generated text. Titles must fit the selected duration and export as part of the immutable document. Empty text hides the title.

## Acceptance scenarios

Check local generation, manual edits, multiple lines, escaping, preset changes, and timed removal.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

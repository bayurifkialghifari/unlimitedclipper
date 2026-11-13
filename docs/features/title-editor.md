# Title editor

Requirement: TTL-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Generate a hook locally from the selected clip or edit one manually. Configure preset, typography, position, color, and display duration.

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

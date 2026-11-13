# Clip discovery

Requirement: AI-02. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Extract audio, transcribe timed words, analyze bounded transcript windows locally, and suggest valid clips with titles and explanations. Users can create and resize clips manually.

Whisper small Q5_1 supplies source-timed words. Qwen3 4B Q4_K_M processes bounded transcript windows with a JSON schema, validates boundaries, ranks non-overlapping suggestions, and saves a durable insertion plan. Inference uses llama-completion with an explicit ChatML prompt. Speech configuration is frozen for retries. Suggestions require editorial review; scores describe model preference.

Selection groups up to twelve words into timed phrases and limits each window to 5,000 UTF-8 bytes. The full prompt reserves 2,048 tokens for JSON within the 8,192-token context. Completed sections persist a source-word offset; retries reuse the transcription and completed suggestions even when an application update changes window sizing. The progress display includes the current section and total.

A selected duration fixes the final clip length, bounded by the source duration. The engine centers that span on the suggested moment and resolves overlaps after adjusting boundaries. Automatic duration limits suggestions to 15–60 seconds. The title prompt asks for a grounded hook in the transcript language and skips routine introductions.

## Interface

POST /api/v1/projects/{id}/generate; POST /api/v1/projects/{id}/clips

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Use durable transcript and selection checkpoints. Validate model output against transcript/source boundaries. No speech returns a manual-edit path. Scores are suggestions, not predictions of views.

## Acceptance scenarios

Exercise long inputs, invalid structured output, selected languages, empty speech, manual boundaries, cancellation, and stage recovery.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

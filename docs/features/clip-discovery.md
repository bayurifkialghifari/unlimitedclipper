# Clip discovery

Requirement: AI-02. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Extract audio, transcribe timed words, analyze bounded transcript windows locally, and suggest valid clips with titles and explanations. Users can create and resize clips manually.

Whisper small Q5_1 or medium Q5_0 supplies source-timed words. Qwen3 4B Q4_K_M processes bounded transcript windows with a JSON schema, validates boundaries, ranks non-overlapping suggestions, and saves a durable insertion plan. Inference uses llama-completion with an explicit ChatML prompt. Speech configuration is frozen for retries. Suggestions require editorial review; scores describe model preference.

Selection groups up to twelve words into timed phrases and limits each window to 4,000 UTF-8 bytes. The full prompt reserves 2,048 tokens for JSON within the 8,192-token context. Completed sections persist a source-word offset; retries reuse the transcription and completed suggestions even when an application update changes window sizing. The progress display includes the current section and total.

Clip count is a maximum; duration is an editorial target. The prompt prefers complete 8–60-second moments and allows shorter complete reactions. It must not pad a cut with filler or fill a quota. The engine adjusts boundaries toward nearby complete phrases, adds 120 ms of lead and 180 ms of tail, rejects spans over 60 seconds, and resolves overlaps after adjustment.

Moment focus accepts up to 400 characters describing desired events. Strict, balanced, and broad interest filters use thresholds of 85, 70, and 50; new requests default to strict. Each candidate must quote a hook and payoff that occur as whole words inside its source range. A second local review receives those quotes and a bounded transcript excerpt, applies a common rubric, and can reject all candidates. Review batches and accepted results persist for retries. A no-result job explains that the user can adjust focus/filter or create a clip manually.

Selection currently analyzes speech transcripts. It does not understand silent gameplay events, facial expressions, or visual action the way a multimodal service may. Scores are editorial model preferences and cannot guarantee an interesting result or predict views. Review the source and refine individual captions before publication.

## Interface

POST /api/v1/projects/{id}/generate; POST /api/v1/projects/{id}/clips

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Use durable transcript and selection checkpoints. Validate model output against transcript/source boundaries. No speech returns a manual-edit path. Scores are suggestions, not predictions of views.

## Acceptance scenarios

Exercise long inputs, invalid structured output, selected languages, empty speech, manual boundaries, cancellation, and stage recovery.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

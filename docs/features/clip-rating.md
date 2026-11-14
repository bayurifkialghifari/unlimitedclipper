# Clip potential rating

Requirement: AI-03. Status: implemented; scoped evidence is in ../validation.md.

## Behavior

Clip options contains a local editorial review of the saved cut. Qwen3 4B assesses its title
and complete caption transcript. Hook, clarity, flow, and payoff each receive 0–25 points; the
engine sums them into a 0–100 score. The panel shows explanations, transcript quotes, a summary,
and one to four editing suggestions. Results use the selected UI language and original-language
quotes. The existing discovery score remains a separate selection hint.

This score describes editorial potential. It is not a probability of virality or a prediction
of views. No video, audio, audience, distribution, or trend signals are analyzed. The assessment
can be wrong even when its quoted evidence passes validation; creators should review it.

## Persistence and admission

Requests require the expected saved revision, nonempty captions, a ready Qwen model, an output
duration of at most two minutes, and a full transcript of at most 4,000 UTF-8 bytes. Oversized
transcripts are rejected without silent truncation. Another active rating for the same clip is
rejected. Android's media-only preview does not admit this job.

The single heavy-job queue freezes the clip revision and language. The engine checks exactly
four unique dimensions, bounded scores and explanations, and contiguous transcript evidence
for every positive dimension. Invalid structured output receives one bounded correction attempt;
remaining invalid or invented evidence fails visibly. Progress reports
inference and persistence milestones; it cannot show per-token completion.

Assessments live in a separate SQLite table and never modify captions, title, or edit revision.
A later edit marks the previous score stale. Completed results are checkpointed before saving;
an old retry cannot overwrite a newer revision's assessment. Cancellation is checked under the
shared operation gate. Deleting a clip removes its rating.

## Interface and states

GET /api/v1/clips/{id}/rating returns the current assessment or null.
POST /api/v1/clips/{id}/rating accepts { revision } and returns an assess job.

The panel handles loading and GET failures with retry, unrated and stale results, pending
submission, queued/running work, and request or worker failures. Unsaved edits, missing models,
empty or oversized transcripts, and unsupported Android processing disable the action with
an explanation. Job retries and cancellation remain in the activity popup and Processing page.

## Verification boundary

Browser tests exercise controlled rating states and real persisted caption style edits. The
separate validate-clip-rating script uses actual Whisper and Qwen inference on the public JFK
speech fixture, checks result persistence and score sums, and verifies unchanged edits and
stale-revision rejection. This is a functional fixture, not a calibrated quality benchmark.
Hosted media CI validates caption rendering without provisioning large AI weights.

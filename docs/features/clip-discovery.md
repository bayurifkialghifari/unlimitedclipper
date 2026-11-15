# Clip discovery

Requirement: AI-02. Status: implemented; runtime evidence and limitations are in ../validation.md.

## Behavior

Whisper small Q5_1 or optional medium Q5_0 supplies immutable source-timed words. New desktop
jobs offer Podcast/interview and Gaming/reaction profiles. Balanced is the default threshold
(70); Strict (85) and Broad (50) remain explicit choices. Count is a quality-bounded target.
The engine never adds weak filler to satisfy it, and zero results is valid.

Economy uses installed Qwen3 1.7B Q4_K_M for proposals and installed 4B for final review. With
one installed Qwen model, that model handles both stages. Quality prefers 4B for both stages.
Each stage loads its model once in a private supervised llama-server process; only one model
is resident at a time. Context is 4,096 tokens with 1,024 reserved for output and exact
tokenizer admission. CPU threads are half the available cores, clamped to 1–4.

Core transcript windows cover at most 60 seconds with up to 15 seconds of neighboring context
and byte limits. Sparse neighbors can share a batch up to 240 seconds of source time and
2,650 transcript bytes. Each prompt proposes up to four complete moments. Candidate spans
remain at most 60 seconds regardless of batch duration. The candidate pool is bounded by
max(12, 3 × requested count), with overlap removal and proposal ranking.
The proposal model chooses inclusive numbered phrase IDs instead of computing timestamps or
copying quotes. The engine maps those IDs to absolute source-word times and extracts opening/
ending quotes from the selected words. Phrase IDs, title, range bounds, and complete transcript
review are validated. Proposal priority combines word coverage and complete punctuation, with
part of the pool reserved for source-time diversity; it is not a displayed potential score.
Podcast candidates must last at least eight seconds; Gaming can retain shorter reactions.

Candidates quote their hook and payoff from inside the proposed range. Boundaries move toward
complete nearby phrases once, adding 120 ms lead and 180 ms tail. Independent final review
receives the entire candidate transcript, including its ending, without its proposal score.
Four dimensions—hook, clarity, flow, and payoff—each require an exact quote and a 0–25 score.
Acceptance requires the chosen total threshold and at least 10 in every dimension. One
correction attempt handles invalid review quotes. Oversized complete candidates are rejected
with a context-limit reason rather than reviewed from a truncated excerpt.

If non-overlapping accepted clips fall short, one extra adjacent-context pass examines at most
eight windows, excluding accepted ranges. It uses installed 4B for recovery proposals as well
as review, or the sole installed model. Podcast recovery samples neighbors across the recording;
Gaming prioritizes audio-change hints. Review stops once the requested count is reached.
Results expose the actual accepted/target count, below-threshold rejections, invalid evidence,
and duration/context limits. Windows, offsets, transcript snapshots, model IDs/hashes, evidence,
accepted results, and the insertion plan persist. Retry retains completed work and clip IDs.

Gaming adds source-timed RMS/audio-change hints from the original mono audio without another
AI model. Loudness does not prove an interesting moment. Newly generated cuts with more than
10% low-confidence words can queue optional medium refinement on those cuts only; deterministic
child job IDs prevent duplicate refinement on retries.
Availability is frozen with the insertion plan, and a later manual clip revision prevents
automatic refinement from being queued by an old discovery retry.

## Limits

Content profiles include Podcast, Gaming, Motivation, Education, and Other content. Motivation
prioritizes concrete obstacles, turning points, and complete practical lessons. Education keeps
examples, answers, and necessary caveats. Other content uses self-contained stories/outcomes
without assuming a podcast. Every non-Gaming profile requires at least eight seconds and the
same independent grounded review. A profile changes editorial instructions, not model size,
the context window, or the quality threshold. Accuracy on these categories is not certified.

Selection is transcript-based. It cannot understand silent action, expressions, or active
speakers, and poor recognition can produce poor suggestions. Small models may miss good clips
or provide invalid evidence. Scores do not predict views. Review the source, edit captions,
and adjust boundaries before publishing. Requested duration is an editorial target, not
padding. Android's unverified native path and old queued jobs retain the legacy CLI selector.

## Interface and recovery

POST /api/v1/projects/{id}/generate accepts count, duration, language, focus, interest threshold,
and optional content_profile. Settings persist ai_mode and content_profile. Manual clipping
remains available through POST /api/v1/projects/{id}/clips. Missing models, invalid output,
cancelled children, and context errors expose actionable job states. A registry hash change
requires a new discovery job instead of mixing model versions across a retry.

The current speech parser preserves censored words such as s*** and only suppresses bounded,
closed decoder annotations. New jobs can rebuild old project words from matching saved
Whisper JSON without inference; the parser version is part of transcript configuration.
Existing clip edits and frozen discovery retries keep their saved words. If matching raw
recognition was cleaned up, the normal speech transcription path runs again.

## Acceptance scenarios

Exercise real speech, grounded quote validation, shortfalls, overlapping candidates, selected
languages, empty speech, cancellation, and durable recovery. See ../validation.md for checks
actually executed; this specification does not certify AI accuracy.

# Caption editor

Requirement: CAP-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Edit timed words and selected groups, apply presets, customize typography, colors, outline, box/word highlighting, position, and animation. Undo/redo modifies the draft; autosave commits revisions.

New edits use bold DM Sans, amber word emphasis, and short phrases. The engine supplies 18
original recipes. Category filters and sample previews use the current clip's words; an empty
clip uses a labeled styling sample. Bold and uppercase never rewrite stored speech. Applying a
recipe preserves caption visibility and vertical position. Existing documents retain their colors.

| Category  | Recipes                                                    |
| --------- | ---------------------------------------------------------- |
| Minimal   | Clean, Documentary, Soft, Whisper                          |
| Bold      | Impact, Headline, Punch, Editorial                         |
| Highlight | Studio, Word box, Marker, Blue box, Amber, Teal, Underline |
| Motion    | Single word, Kinetic, Reveal                               |

Kinetic and Editorial emphasize marked keywords with larger type. Box recipes retain the phrase
while boxing its active word. Reveal progressively exposes words and reserves the widths of
future words, including during internal pauses, so the phrase stays in place. Underline affects
only the spoken word. Fade and pop animations also work with plain phrase styles. Word grouping
still respects measured width, speech pauses, and source cuts. A recipe does not improve recognition.

Save this style stores a named copy in SQLite for reuse across projects. Names contain 1–60
characters and the library supports 50 saved styles. Font registration, colors, sizing, modes,
and other values are validated by the engine. Removing a saved style leaves applied clip styling
intact; built-in styles cannot be deleted. The gallery reports loading, empty, saving, and failure
states and supports keyboard selection. Existing font, timing, color, position, and per-word
controls remain editable after selecting a recipe.

ASS, SRT, and VTT share phrase boundaries: punctuation, a pause over 450 ms, word count, a
2.2-second span, source cuts, or measured glyph width. Bundled font metrics determine width and
long-phrase sizing. Highlights stop near the word end; surrounding text remains stable through
short internal pauses. Typography scales against the shorter output dimension and retains margins.

Optional acoustic refinement follows Whisper recognition with native CTC when the verified
Indonesian/English pack is installed. Timing records distinguish estimated, aligned, and manual
source anchors, with separate alignment confidence. Manual edits survive proposals and retries.
Pack export checks passed; native pack inference and measured caption accuracy remain pending.
See speech-quality-pack.md and editorial-timeline.md for that verification boundary.

Refine captions locally runs Whisper small or medium on the original cut with two seconds of surrounding audio. The speech model, language, vocabulary hint, and expected edit revision are frozen in the job. It uses DTW without VAD, joins subword tokens, and records token confidence. Completed recognition is reusable on retry; a committed edit is not applied twice after recovery. A changed revision cannot be overwritten. The source transcript and the clip's visual styling remain unchanged.

Review uncertain words selects words below the 0.65 confidence threshold or with unusually long timing and seeks to the first one. Equal alignment anchors are distributed without overlapping words and marked for review. Confidence is a heuristic, not a calibrated accuracy percentage. Manual text corrections clear the recognition confidence. Music, simultaneous speech, shouting, slang, and game names still require human review; a larger model can also make mistakes. Vocabulary hints may help names but must describe words actually heard in the cut.

Caption previews and exports consume the same ASS document. The browser also provides a source-relative VTT accessibility track; SRT and ASS remain clip-relative. Noto Sans, Arabic, Thai, Devanagari, CJK, DM Sans, and Oswald are bundled with pinned hashes. Text edits, selection, emphasis, per-word color, and word timing persist through revision-aware autosave.

## Interface

GET /api/v1/clips/{id}; PUT /api/v1/clips/{id}; GET /api/v1/clips/{id}/subtitles

GET/POST /api/v1/caption-presets; DELETE /api/v1/caption-presets/{id}

POST /api/v1/clips/{id}/captions

## States and failure handling

ASS tracks wrap long lines inside the output margins. The same ASS document drives the browser renderer and FFmpeg export. Source-preview failures and subtitle-renderer failures have separate messages, so a video failure is not reported as a caption failure.

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Keep immutable source timings and clip-local edits. Reject negative/unsorted/out-of-range times. Revision conflicts retain the current draft and offer explicit reload. Preview and export use the same ASS and fonts.

## Acceptance scenarios

Validate text escaping, multilingual glyphs, word selection, timing edits, undo/redo, autosave conflicts, and rendered highlight frames.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

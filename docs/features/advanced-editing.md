# Advanced editing implementation contract

Status: accepted implementation scope. Items below are pending unless individually verified
in ../validation.md. Existing implemented behavior remains documented in its feature files.

The focused gallery and composed-preview slice is implemented and validated. Version 4
independent opening/closing cards passed separate media, browser, and Windows ARM64 native
checks. Manual camera and text/note motion now pass scoped real-media, browser, and Windows
ARM64 native checks. Registered B-roll motion passed real-media, browser, and native interaction
checks. Hook proposals passed local inference, persistence, and browser checks. A bounded
Auto Motion proposal passed real-media inference, browser Undo/Redo, restart, and export decode.
Verified silence proposals expose source-time cuts, but the optional quality pack was absent
from this host, so full acoustic removal remains unverified. Optional local card narration
passed scoped real-media, browser, and native WebView2 playback checks; remaining AI work is
pending.

## Delivery sequence

1. Focused project gallery, manual range page, and one visible live/exact preview surface.
2. EditDocument v4 timing for intro/outro cards and camera/text/media keyframes with easing.
3. Eight transcript-grounded hook proposals, editable overlay or intro card, and optional local
   narration. Narration starts disabled. Cards do not repeat or reorder source footage.
4. Reviewable Auto Motion, active audiovisual speaker framing, and talent lock/filtering.
5. Twelve additional original kinetic caption recipes, two-font styling, timing/refinement,
   Indonesian/English phrase translation, and optional foreground text masks.
6. B-roll recommendations from local collections and licensed public stock, editable closing
   cards, and reviewable silence removal.
7. Runtime/recovery validation, documented model/platform limits, atomic commits, CI, tagged
   preview delivery, current screenshots/examples, and disposable-cache cleanup.

## Timing and proposal invariants

Version 4 keeps all content tracks on the content clock. Intro/outro cards have independent
local clocks. Content duration and final duration are distinct. Source/output mappings return
no source while a card is visible; subtitles are offset once at final composition. Versions
1–3 remain readable without automatically rewriting saved documents.

Camera tracks control normalized x/y/zoom in portrait, square, and landscape layouts. Text/note
tracks control normalized x/y, scale, and opacity for layers up to 120 seconds. Registered B-roll
tracks control normalized center, zoom from one to four, and opacity, with at most 24 anchors
on layers up to 120 seconds. All use linear, ease-in, ease-out, smooth, hold, and custom-curve
transitions. The engine resolves their motion for preview/export, scene remaps, and immutable
revisions. Animated filter parameters are pending; unsupported layer kinds reject motion.

Proposals are typed, revision-bound, persistent, and reviewable. Applying one requires its
original revision and a clean editor. AI must quote source evidence rather than invent facts.
Translation retains phrase intervals and does not pretend translated words have acoustic
alignment. Speaker/mask uncertainty needs fallback states. One heavy job and one inference
model remain the resource baseline.

## Hook proposals

The Hook tab requests up to eight distinct local Qwen 4B ideas from the saved transcript.
Each stored idea includes a contiguous source quote and an explanation. The accepted count may
be smaller when the transcript does not support eight distinct ideas. Generation does not
change the clip. The latest set survives restart and remains visible after later edits, marked
stale until new ideas are requested.

Applying an idea requires an unchanged proposal source and a clean draft. Overlay replaces the
opening card and sets a timed title over the first three seconds of content. Opening card clears
the overlay and adds an independent silent two-second card by default. Both choices enter the
normal undo/redo history and autosave revision checks. Manual title and card editing remain
available. The existing direct title endpoint remains for older clients, but the Studio uses
reviewable ideas. Local Qwen output is advisory; grounded quotes do not guarantee an engaging
hook or correct interpretation. A separate optional narration job can add speech to an existing
opening or closing card; Hook selection never starts synthesis automatically.

New proposal sets also freeze the clip's source range, ordered scene boundaries, and caption
word identities, text, and timing. The editor checks that source signature against the current
saved revision before applying an idea. Style, title, and card edits can therefore reuse the same
ideas without another inference job. A source or transcript change invalidates them. The saved
clip revision is still fetched before each application, so another editor cannot be overwritten.

## Auto Motion and silence review

The existing local automatic-edit job offers an optional camera-motion proposal. A saved clip
revision freezes its source scenes and transcript. When legacy crop anchors exist, their pan path
is retained; otherwise the engine samples only scenes with one detected face. It skips
multi-face samples instead of guessing the active speaker. Up to four transcript-selected words
receive a modest 12-percent zoom pulse. Motion is limited to clips of at most 60 seconds within
a ten-minute source envelope, matching automatic editing. Existing manual camera motion must
be removed before requesting a new proposal. No usable face movement or emphasis may yield zero
new keyframes.

The Source segments inspector lists anchor times/values and lets the user seek to each source
moment. Motion becomes visible on the canvas after the proposal is applied; the editor then
allows Undo, Redo, and manual adjustment. Generated proposals stay separate from the saved clip,
survive engine restart, and are disabled when the edit revision changes. The latest job remains
addressable beyond the 200-item recent-jobs view.

If verified silence removal is selected and the optional quality pack is installed, the same
proposal lists each removed interior gap in source milliseconds and its total duration. A seek
control reviews the original frame near each gap. The algorithm still uses acoustic alignment,
VAD, an energy guard, word protection, and padding; it does not remove leading or trailing
silence. This UI and gap accounting passed unit checks, but a native quality-pack removal run is
pending because the pack is not installed on the tested host.

## Local models and rights

Optional narration uses a verified snapshot of
[Supertonic 3 M1](https://huggingface.co/Supertone/supertonic-3). Settings downloads the exact
manifest files with hashes, progress, cancellation, retry, and the OpenRAIL-M license. A
revision-bound job generates Indonesian or English speech from the saved card text. The user
reviews the result before applying it through Undo/Redo; text changes invalidate the audio.
Generated audio must fit a card of at most ten seconds. A real-media fixture passed synthesis,
browser playback, export decoding, restart, cancellation, and retry. Human voice quality,
long-form narration, and speaker output quality remain unverified. Native WebView2 advanced the
card audio clock during playback, but that check did not measure physical speaker output.

[Light-ASD](https://github.com/Junhua-Liao/Light-ASD) is the MIT audiovisual speaker candidate;
native ONNX export and reference parity are pending.
[SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) is the
Apache-2.0 identity candidate after landmark alignment.
[MODNet](https://github.com/ZHKKKe/MODNet) is the Apache-2.0 selected-clip foreground candidate.
Downloads require verified hashes, sizes, licenses, progress, cancellation, and recovery.
Unvalidated packs cannot be advertised as ready.

Stock recommendations require no API key. Wikimedia Commons may supply public-domain, CC0,
or CC-BY assets; attribution/source/license metadata are retained. Download and register media
before applying proposals. Synthetic image/video generation, cloud processing, campaign
marketplaces, and scheduled posting are outside scope.

Android remains build-only for the Snapdragon 8+ Gen 1 / 12 GB target. Do not run local device
or emulator tests. New native packs and desktop subprocess assumptions need compatibility gates.

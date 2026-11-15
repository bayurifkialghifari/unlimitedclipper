# Advanced editing implementation contract

Status: accepted implementation scope. Items below are pending unless individually verified
in ../validation.md. Existing implemented behavior remains documented in its feature files.

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

Camera tracks control normalized x/y/zoom. Text and registered media tracks control normalized
x/y, scale, and opacity with explicit easing. Filter parameters do not animate. The engine
resolves motion for preview/export, scene remaps, and immutable revisions.

Proposals are typed, revision-bound, persistent, and reviewable. Applying one requires its
original revision and a clean editor. AI must quote source evidence rather than invent facts.
Translation retains phrase intervals and does not pretend translated words have acoustic
alignment. Speaker/mask uncertainty needs fallback states. One heavy job and one inference
model remain the resource baseline.

## Local models and rights

Optional narration uses [Supertonic 3](https://huggingface.co/Supertone/supertonic-3), subject
to an immutable verified snapshot, native integration, and carried OpenRAIL-M model terms.
Its Indonesian/English support does not constitute verified application integration.

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

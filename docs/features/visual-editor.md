# Local visual editor

Status: implemented; current browser interaction checks passed for scene operations. Native
preview.3 package verification is pending until recorded in ../validation.md.

## Workspace

The desktop workspace fits the available window height with a clip/transcript panel, central
player, right inspector, and bottom timeline. The inspector and transcript scroll independently.
At narrower widths the side panels use labeled toggles; phones stack the player and selected
panel. Project, processing, export, and settings pages use the full content width.

## Transcript and scenes

Click a transcript word to seek its output time. Shift-click selects a continuous word range.
The active word follows playback. A single selected word exposes its text field; the Captions
inspector retains word timing, emphasis, color, and manual insertion controls.

Remove caption text changes only captions. Cut from video removes the selected output range
through the Rust remapper, including intervening footage, and preserves surviving captions,
crop anchors, and layer media offsets. At least one scene must remain.

Scenes support dragging to reorder, edge trimming, splitting at the playhead, deletion, and
explicit move-earlier/later buttons. Trimming can extend into unused source coverage but cannot
overlap another scene. The Source segments inspector provides exact numeric boundaries.
The engine accepts at most 32 identified scenes and rejects repeated source content. Older
hosts without version 3 support show a restart/upgrade explanation and disable scene operations.

## Timeline transactions

Caption words and visual/audio layers have separate tracks. Layers can move or trim; left
trimming advances audio/B-roll source offsets, while moving preserves them. Numeric controls
remain in the inspector for shorter items and precise offsets. Layer selection opens its
inspector controls. Disabled layers stay visible with a muted track.

Snapping starts enabled and targets scene boundaries, word boundaries, and the playhead within
eight screen pixels. S toggles it outside text inputs. Zoom ranges from fit to 16 times fit.
Arrow keys on timeline items/handles move or trim by 100 ms; Shift increases this to one second.
Scene body arrows reorder one position. Escape cancels a captured drag. Drag previews stay
temporary; release applies one transaction. An asynchronous scene response must match the same
clip and draft snapshot before it can apply. Undo/redo and revision-aware autosave remain shared.

## Two preview modes

Source follows output scene order in the original/proxy video without rendering a new file.
It skips omitted ranges and drives captions/playhead in output time. It provides quick cut and
base-framing review; it does not compose B-roll or audio layers. Small playback discontinuities
can occur when the browser seeks between scenes.

Edited uses the same media composition as export, with a manual 720p render. The hidden player
pauses when modes switch. Caption-only edits reuse the current proxy and live ASS overlay.
Video/audio changes mark it stale, pause playback, disable its controls/seek, and hide the live
caption overlay until a refreshed render finishes. Pointer movement never launches a media job.

This editor does not provide real-time GPU compositing, source repetition, generative B-roll,
cloud publishing, or a guarantee of OpusClip-equivalent AI selection/caption accuracy. Android
runtime remains untested.

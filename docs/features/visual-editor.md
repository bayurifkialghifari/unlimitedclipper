# Local visual editor

Status: implemented. Browser scene interactions and the optimized preview.3 Windows ARM64 host
passed separate checks. Native import, scene reorder, caption autosave, composed playback, and
export playback were exercised. Installer/updater execution and physical x64 runtime remain
pending. See ../validation.md for the evidence and scope.

## Workspace

The Hook inspector also contains independent opening/closing cards. Add one from existing
title/transcript text, then edit its styling or remove it. A closing card can reuse the opening
card text when a manual clip has no transcript. Preview card seeks the composition
player without changing source scene ranges. The composition player shows the final duration;
the editable scene timeline and transcript keep content-relative positions. Normal timeline
seeks skip the opening card and preserve source/word provenance. A card is silent by default;
optional reviewed local narration adds audio without changing scene or word timing.
The Hook tab also lists saved local ideas with transcript quotes and explanations. Choosing an
idea explicitly replaces the other opening mode, can be undone, and requires the matching saved
revision. Revisions that changed since generation show the old ideas as disabled evidence.

Projects open a clip gallery at /projects/:projectId. Editing a clip opens /studio/:clipId,
with one player, a right inspector, and a bottom timeline. Manual range selection has its own
/projects/:projectId/manual page; creating the range opens that clip in the studio. Imports
remain available on Projects. Finishing an import never replaces a clip being edited.
The clip gallery and export history link directly to /studio/:clipId?panel=captions for styling.
The inspector's selected panel follows this route and updates its link when tabs change. Caption
and video filter edits belong to the current clip and autosave without running clip discovery.

Studio tools sit above the player as compact icon and text tabs. Arrow keys, Home, and End move
between tabs. Undo and Redo use labeled icon buttons. The phone layout uses four tool columns
and keeps the timeline horizontally scrollable for precise scene selection.

The desktop inspector starts at 360 pixels so the player has more room. Smaller screens stack
the player and settings. Transcript range selection is directly visible inside Captions.
Project, processing, export, and settings pages use the full content width. A gallery currently
uses the source thumbnail for each clip.

Selecting a scene, visual layer, or audio layer opens its matching controls and hides unrelated
media groups. Inspector tabs and selected layers reset their scroll position to the top. The
full Source segments tab remains available for adding media when nothing is selected.

The right inspector has one themed scrollbar in its body, with fixed tabs and an outer
panel that does not scroll. Desktop, narrow, and phone layouts retain keyboard tab navigation.
Forced-color mode uses the native scrollbar for accessibility.

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

The timeline now has sticky track names, source-frame scene strips, an adaptive time ruler, and
vertical timing guides. The ruler supports pointer scrubbing, 100 ms Arrow steps, one-second
Shift+Arrow steps, and Home/End. Short clips use sub-second labels without duplicate timestamps.
Caption blocks share the transcript's selected-word state and show the currently playing word.
Empty tracks name the inspector panel that can fill them. Frame loading or failure never blocks
scene edits, and a failed frame job has an explicit retry action.
Storyboard frame jobs report their state in the timeline and clip rail without opening the
global progress panel over the editor.

The Source audio row below scene footage shows measured RMS energy from the registered preview
video's audio. One managed FFmpeg job samples mono PCM at 200 Hz, groups it into adaptive source-time
buckets, and caches at most 12,001 byte peaks per project. The display normalizes the visible cut
for legibility and maps each bar back to its source range when scenes move or trim. It does not
invent audio where the source is silent. Missing audio, unavailable tools, processing, failure,
and explicit retry have separate states. Sources beyond 24 hours do not receive a waveform.
Background waveform jobs obey the single-heavy-job scheduler and do not cover the workspace with
the global job popup. Android does not advertise this feature.

Each registered audio layer also requests a per-asset waveform. Its visible bars map the
layer's source offset to its output range, so trimming the layer or changing its source offset
changes the displayed section. Selecting a layer shows a larger waveform with retry feedback.
Dragging an imported sound to an audio track places it at the drop time; Add at playhead remains
available for keyboard and touch use. These waveforms show input energy, not the final mixed
gain or ducking. A failed waveform never blocks editing or export.

The separate B-roll Studio tab has a project library with local upload, managed preview, thumbnail,
and a CC0-only Wikimedia Commons search. A selected video can be added at the playhead or dragged
to the B-roll track. Imports create a browser-compatible proxy for review; export keeps the
original registered video. Search results display source and license links. Downloads require
network access and are capped at 250 MiB; local imports are capped at 2 GiB and ten minutes.
Removing a library video is blocked while any clip still references it. Existing clips that
refer to another registered project video remain readable. The editor does not redistribute
stock files as built-in assets.

Find B-roll uses the installed local Qwen 4B model on saved transcript words in the first two
minutes of a clip. It skips occupied five-second windows, validates an exact source quote, and
tries up to three concrete English stock queries. The engine imports one video whose title
matches a query term and whose Commons metadata passes the CC0, MIME, host, and size checks.
The result retains its source link and license. The editor previews the imported video and
places it at the suggested output time only after the user chooses Place in timeline. The
suggestion is tied to the saved revision; a changed edit cannot apply it. Placement uses normal
Undo/Redo and autosave. Run Find B-roll again for another suggestion. No match leaves the clip
unchanged and offers manual search or local import. Internet access is required to search and
download; the model and media tools run locally. Android does not offer automatic B-roll.

Camera, text, and B-roll motion controls now show a row of selectable diamond keyframes and one
value panel for the selected key. Timeline diamonds still seek to their exact time. Easing and
manual numeric edits remain available; choosing a key does not create a new revision by itself.

The clip rail uses actual project clips, current names and durations, and a frame from each
clip's first edited scene. Selecting another clip flushes the current draft before navigation;
save failure keeps the current clip open. On narrow screens the timeline and rail precede the
inspector. The storyboard API samples source time from the registered preview proxy, keeps at
most 128 frames per project, and reports unavailable media without fabricating thumbnails.
Project thumbnails are not repeated as scene or clip images.

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

The Crop inspector adds camera keyframes at the playhead and edits their time, center, zoom,
and easing. Its marker row seeks each anchor. Portrait, square, and landscape layouts support
camera motion; other layouts disable the add control with an explanation. A selected text/note
layer exposes equivalent position, scale, opacity, and easing controls plus timeline markers.
The canvas drag handles move the current camera or text position with pointer or arrow keys.
Adding a keyframe after the document changes during preview-plan loading shows an error instead
of applying stale values. Edits use the existing undo/redo and revision-aware autosave path.

A registered B-roll layer also exposes center, zoom, opacity, and easing keyframes in its
inspector. Zoom remains between one and four to keep the video covering the frame. The visible
preview uses the topmost active B-roll layer when they overlap, matching export order. Up to 24
anchors and a 120-second layer are supported. B-roll motion uses numeric fields and timeline
markers; direct canvas dragging is currently limited to camera and text positions.

The Source segments inspector can request optional Auto Motion during automatic editing. Its
saved proposal lists camera anchor times, center, zoom, single-face samples, and skipped
multi-face samples. Select an anchor to inspect its source moment; applying the full proposal
shows motion on the canvas and supports Undo/Redo. Existing manual camera motion blocks a new
motion proposal. A verified silence-removal proposal also lists source-time gaps and allows
seeking near each original gap before application.

## Live and exact preview

One visible Canvas2D surface combines decoded footage and CPU libass graphics. Live preview
follows edited scene order, crops, split/gaming framing, enabled B-roll, image watermarks, and
caption/hook graphics. Color adjustments update immediately through an RGB approximation.
Camera motion and animated text/note layers use engine-compiled easing from the preview plan.
Seeking between scenes can cause a short discontinuity. Reaching the end of the source file
continues into the next edited scene when that scene was moved earlier in the clip.

The revision-checked preview-plan API validates the document and registered assets and returns
the engine ASS track. Caption rendering uses the pinned libass WASM in one worker, with one
in-flight frame request. Track changes discard stale frame responses. Canvas size has a
720-pixel maximum edge. Paused footage reuses its composition until an edit or seek changes it.

Render edited preview produces a fully baked 720p video through the export pipeline, including
captions and audio. The same canvas paints it, avoiding stacked native video/GPU surfaces.
Live preview stays available during rendering. The finished render is shown only while its
clip and entire edit-document signature match. Editing returns to live preview and marks the
previous render stale. No pointer movement launches a render job. Asset leases renew every
30 seconds while the matching cached preview is retained.

Live preview uses the source soundtrack. Imported audio layers are heard in the exact render.
Warmth and other live RGB adjustments approximate the export's YUV filters; the exact render
is the final color and audio review. Loading, worker/media errors, and render progress remain
visible. Preview jobs never create export records.

This editor does not provide real-time GPU compositing, source repetition, generative B-roll,
cloud publishing, or a guarantee of OpusClip-equivalent AI selection/caption accuracy. Android
runtime remains untested.

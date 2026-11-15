# Local visual editor

Status: implemented. Browser scene interactions and the optimized preview.3 Windows ARM64 host
passed separate checks. Native import, scene reorder, caption autosave, composed playback, and
export playback were exercised. Installer/updater execution and physical x64 runtime remain
pending. See ../validation.md for the evidence and scope.

## Workspace

Projects open a clip gallery at /projects/:projectId. Editing a clip opens /studio/:clipId,
with one player, a right inspector, and a bottom timeline. Manual range selection has its own
/projects/:projectId/manual page; creating the range opens that clip in the studio. Imports
remain available on Projects. Finishing an import never replaces a clip being edited.

The desktop inspector starts at 440 pixels and supports pointer or keyboard resizing from
400 to 560 pixels on wide windows. Smaller screens stack the player and settings. The inspector
toggle keeps its contents mounted so hiding it does not discard field values. Transcript range
selection is expandable inside Captions. Project, processing, export, and settings pages use
the full content width. A gallery currently uses the source thumbnail for each clip.

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

## Live and exact preview

One visible Canvas2D surface combines decoded footage and CPU libass graphics. Live preview
follows edited scene order, crops, split/gaming framing, enabled B-roll, image watermarks, and
caption/hook graphics. Color adjustments update immediately through an RGB approximation.
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

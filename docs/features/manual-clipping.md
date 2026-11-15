# Manual clipping

Status: implemented. No AI model or transcript is required.

Create a clip is available in the Studio toolbar while a source is open. Start and end inputs
are seconds in the original video, with millisecond precision. The dialog shows the output
duration and formatted source range before submission. For example, 90 to 120 creates a
30-second clip. Empty names, non-finite values, reversed bounds, and positions beyond the
source are rejected. Submission displays processing state and prevents duplicate requests.

When opened from an existing edited clip, the current output playhead maps back to its source
position. This also works for reordered scenes. Creating the clip flushes current edits,
selects the new persistent clip, and retains the source. Escape cannot dismiss an active
submission. Saved clips can be adjusted with source segments, timeline cuts, and normal
revision-aware autosave. Multi-range edits remain limited to 32 disjoint source scenes.

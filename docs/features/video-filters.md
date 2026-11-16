# Video filters

Status: implemented. See ../validation.md for the checks actually run.

The Video filters inspector offers Natural, Crisp, Warm, Cool, and Monochrome recipes.
Brightness, contrast, saturation, and warmth are editable integer values from -100 to 100.
Reset restores neutral values. Choosing a recipe selects its preview; Apply to whole clip saves
those values, while Add at playhead creates a timed block. Subsequent adjustments remain editable
and support undo, autosave, and revision conflict detection.

Each recipe has a thumbnail using the same actual source frame. A larger color preview
updates with the four sliders. The existing source player supplies a frame after loading
or seeking; Use source player frame refreshes it manually. A managed project thumbnail is
the fallback. Captures have a maximum 320-pixel edge, stay in memory, and create no extra
decoder, render job, SQLite record, or file. Missing images have an explicit fallback;
capture stays disabled until source frames are available.

Thumbnail transforms are lightweight RGB approximations. The exporter adjusts YUV footage
and preserves luminosity during shadow color balance, so a still thumbnail is not an exact
rendered frame. The interface directs final review to Render Edited. Recipe buttons retain
names, pressed states, keyboard selection, and visible focus. The inspector keeps one scrollbar.

The engine applies adjustments after footage composition and B-roll, before titles, captions,
and watermarks. Preview and export share this filter graph. Render Edited to see the exact
result. Live preview shows RGB approximations immediately; the exact render uses the saved
YUV composition. Changes make an existing exact preview stale. These are color adjustments,
not restoration or AI enhancement.

Older documents default to neutral values. Health advertises video_adjustments so an older
host disables these controls. No image assets or arbitrary filter expressions are accepted.
Native Android rendering remains untested.

Version 5 adds a dedicated filter track. Drag a recipe to an output time or add it at the
playhead to create a three-second span. Drag or trim that block to change its range; the selected
block's sliders edit only that span. Whole-clip adjustments remain available when no block is
selected. Filter spans cannot overlap and are limited to 32. Live preview approximates the
active values; the exact render applies the timed FFmpeg graph. Placing a filter on an older manual
clip assigns stable scene IDs before saving version 5, so the edit survives reload.

Scene boundaries offer Cut or Dip to black. Dip overlays black around the boundary without
extending the content duration or moving caption timestamps. Its duration is 100 to 600 ms and
cannot exceed either neighboring scene. Scene remaps retain transitions only while their
incoming scene survives. The local real-media render fixture covers a timed filter and Dip;
other codecs and operating systems still need runtime checks.

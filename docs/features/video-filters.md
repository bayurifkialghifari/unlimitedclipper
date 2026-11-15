# Video filters

Status: implemented. See ../validation.md for the checks actually run.

The Video filters inspector offers Natural, Crisp, Warm, Cool, and Monochrome recipes.
Brightness, contrast, saturation, and warmth are editable integer values from -100 to 100.
Reset restores neutral values. Choosing a recipe copies its values into the clip; subsequent
adjustments remain editable and support undo, autosave, and revision conflict detection.

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

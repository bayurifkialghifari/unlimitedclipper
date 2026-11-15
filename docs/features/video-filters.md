# Video filters

Status: implemented. See ../validation.md for the checks actually run.

The Video filters inspector offers Natural, Crisp, Warm, Cool, and Monochrome recipes.
Brightness, contrast, saturation, and warmth are editable integer values from -100 to 100.
Reset restores neutral values. Choosing a recipe copies its values into the clip; subsequent
adjustments remain editable and support undo, autosave, and revision conflict detection.

The engine applies adjustments after footage composition and B-roll, before titles, captions,
and watermarks. Preview and export share this filter graph. Render Edited to see the exact
result. Source is a fast framing/cut review and does not show color adjustments. Changes make
an existing Edited preview stale. These are color adjustments, not restoration or AI enhancement.

Older documents default to neutral values. Health advertises video_adjustments so an older
host disables these controls. No image assets or arbitrary filter expressions are accepted.
Native Android rendering remains untested.

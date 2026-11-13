# Watermark

Requirement: BRD-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Add a text or uploaded image watermark. Persist normalized position, size, opacity, and text style within the clip document.

Image uploads are decoded and checked for valid dimensions before registration. Image placement uses the remaining composition space, keeping the image inside the frame. Text styling is rendered through ASS. Shared images survive deletion of another clip that references the same asset.

## Interface

POST /api/v1/assets/upload; PUT /api/v1/clips/{id}

## States and failure handling

Image overlays preserve their intrinsic aspect ratio and fit both output width and height. The preview shows an actionable error when its registered image cannot load. Text overlays use edge-aware alignment and a bounded font size to keep the configured position within the output.

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Image watermarks use managed asset IDs and validated image formats. Missing images produce a clear failure rather than an incorrect successful export.

## Acceptance scenarios

Verify image/text modes, transparent PNG, text escaping, placement, opacity, and project reopen.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

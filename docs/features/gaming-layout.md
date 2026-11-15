# Gaming split layout

Requirement: GAM-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Crop gameplay and facecam independently and arrange them into one vertical output. Adjust the split ratio, crop position, and scale while reviewing the source.

The facecam occupies the upper region and gameplay occupies the lower region. Both normalized rectangles and the split ratio are independently editable. The 720p integration fixture rendered a real four-second split composition; additional output resolutions and combinations are tracked in validation.

Five real Windah Basudara clips also passed 1080p rendering and full decoding. Source-camera position was reviewed per clip: the lower-right region is used for one clip and the lower-left region for the others. A static facecam rectangle must be adjusted when the recording changes camera placement; do not assume one position applies to the whole recording.

## Interface

The focused Studio toolbar exposes Composition, including Gaming split, without opening the
inspector. Choosing Gaming split places the facecam region above gameplay. The Crop tab keeps
the independent facecam/gameplay rectangles and split ratio near the top. Auto-detect facecam
is an explicit action that saves the current edit and runs the local framing job; the user must
review its result because camera placement can change within a recording.
The tracking worker resolves the packaged ONNX Runtime filename for Windows, Linux, or macOS.
The native Windows interaction passed; packaged Unix face detection remains to be tested.

PUT /api/v1/clips/{id}

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Both rectangles remain valid normalized source regions. Rendering and preview use identical output proportions.

## Acceptance scenarios

Test top/bottom composition, non-square source regions, split ratios, captions, titles, and watermarks together.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

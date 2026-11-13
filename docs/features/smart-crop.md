# Smart crop

Requirement: CRP-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Detect faces locally, track a consistent subject, and create editable crop keyframes. Manual crops and normalized keyframes remain available independently of AI.

YuNet runs through native ONNX Runtime at 640 by 640. Sampling is capped at 96 frames and follows the face nearest the current crop center with temporal smoothing. The preview supports dragging and arrow-key framing; Shift uses a larger step. Existing motion receives a keyframe at the playhead.

## Interface

POST /api/v1/clips/{id}/track; PUT /api/v1/clips/{id}

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Clamp crops to source bounds and selected aspect. Sort clip-relative keyframes and interpolate continuously. Missing faces preserve the current edit and return an explicit manual-positioning error.

## Acceptance scenarios

Test single/multiple/no faces, subject choice, edge crops, keyframe ordering, interpolation, and final framing.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

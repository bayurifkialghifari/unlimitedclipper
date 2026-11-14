# Local AI setup

Requirement: AI-01 / TXT-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Install hash-verified Whisper and Qwen models. Downloads resume from partial files and remain usable offline. Small speech is default; medium is an optional quality upgrade.

Installed models have a readiness marker bound to their SHA-256 and modification timestamp. Repair rehashes the bytes. Importing replacement models is blocked during active processing. Small, medium, and Qwen3 4B have real Windows ARM64 inference evidence in ../validation.md. This does not establish word-perfect recognition or verification on other systems.

Settings provides one dropdown for the supported model registry: Whisper small, Whisper medium,
Qwen3 1.7B, and Qwen3 4B. Each option shows its actual size and readiness. Download model queues the selected
model through the existing hash-verified downloader. The global popup displays queue/download/
verification progress. Installed models expose repair; manual file import remains in a disclosure
and stays disabled during processing. The optional speech pack remains experimental and uses its
separate manual ZIP import under Advanced caption timing.

Word alignment uses Whisper DTW on the original audio with flash attention disabled. Do not combine CLI VAD with direct DTW token offsets: the tested CLI remaps segment times to the source but leaves token DTW times on a compressed speech timeline. VAD requires an explicit tested mapping before it can be enabled.

Economy discovery uses the 1.7B model for proposals and installed 4B for final review. One
installed Qwen model handles both stages; Quality prefers 4B. The pinned 1.7B Q4_K_M download
is 1,282,439,264 bytes under Apache-2.0. Model/hash readiness is checked before starting a
private inference session. Models load sequentially with a 4,096-token context and at most
four CPU threads. This bounds memory demand without guaranteeing speed or selection quality.
Android does not use this executable server path and remains untested.

## Interface

The optional native [speech quality pack](speech-quality-pack.md) adds a separate source-timed
CTC/VAD pass rather than combining CLI VAD with DTW offsets. Its native frontend and real accuracy
checks are pending. Development fixtures can borrow one canonical model directory with
UC_MODELS_DIR and prevent mutations using UC_MODELS_READ_ONLY=1.

GET /api/v1/models; POST /api/v1/models/{id}/download; POST /api/v1/models/{id}/import

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Missing models explain what to install. Invalid checksums never activate a model. Model installation does not overwrite a working version. Show actual download sizes and errors.

## Acceptance scenarios

Verify interrupted/resumed downloads, wrong size/hash, cancellation, existing models, and offline processing.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

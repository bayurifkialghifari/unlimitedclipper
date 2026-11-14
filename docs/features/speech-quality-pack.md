# Optional speech quality pack

Status: model export/reference checks passed in CI; native application inference is pending.

The pack adds Indonesian/English CTC word alignment, source-timed Silero speech regions, and ECAPA
speaker embeddings. It runs through native ONNX Runtime. Python and PyTorch are build dependencies
used in CI, not application runtime dependencies. Whisper still supplies the recognized words.
Alignment changes timing, not recognition accuracy.

The version 1 manifest contains ten files totaling 1,725,866,911 bytes, approximately 1.61 GiB.
Sources are pinned in scripts/export-quality-pack.py and resources/quality-models.json. The
[pack build](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43567427934)
compared exported ONNX inference against PyTorch at multiple input lengths. That check does not
verify the Rust frontend, diarization, real caption accuracy, or physical-device performance.

Settings accepts the verified quality-pack ZIP. The engine checks entry names, duplicates, sizes,
symlinks, and SHA-256 against its embedded manifest before activation. Extraction uses a staged
directory; activation temporarily moves the working pack aside and rolls back a failed replacement.
The previous copy is removed after successful activation to avoid retaining duplicate model files. A readiness
marker binds expected hashes to file size and modification time. Unverified files never activate.
Keep enough disk space for the upload, staging, and an existing pack. Installation is blocked
during heavy processing and on Android.

CTC processes bounded audio windows. Unsupported characters and uncertain anchors retain estimated
timing for review. Manual text/time corrections retain manual provenance. Recognition confidence
and alignment confidence are separate model signals, not calibrated accuracy percentages.

Speaker extraction uses a native 80-band log-mel frontend with sentence mean subtraction. Cosine
clustering produces at most eight anonymous speaker groups. Native frontend parity and real
multiple-speaker validation remain pending; do not describe this as certified diarization.

GET /api/v1/models/quality-pack returns size, supported languages, and actual installed readiness.
POST /api/v1/models/import-pack installs a verified ZIP. No stable public pack download is
published yet; the CI artifact is temporary and requires repository access. Local artifact transfer
failed during this validation pass, so the pack is not installed on the development machine.

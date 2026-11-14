# Storage and workspace cleanup

Application cleanup and development-workspace cleanup have different scopes.

Settings clears unreferenced temporary processing files only when heavy jobs have stopped. It
reports actual removed bytes and protected entries. Retryable job audio and recognition
checkpoints remain available, including jobs outside the recent-history list. Registered previews,
source files, exports, and models are retained. Symbolic links are not followed for deletion.

For the development workspace:

```powershell
node scripts/cleanup-workspace.mjs
node scripts/cleanup-workspace.mjs --apply
node scripts/cleanup-workspace.mjs --apply --keep=target
```

The first command only audits. The second deletes verified allowlisted rebuildable outputs and
unused tool/archive directories. It rejects symlinks/junctions, checks canonical containment, and
protects paths referenced by running processes. Duplicate model stores are deleted only after
size and SHA-256 comparisons with .data/models. Delivery files and the canonical .data library
are outside the deletion allowlist. Review the audit before applying it.

The first 2026-11-14 cleanup reclaimed 42,702,334,654 bytes, approximately 39.77 GiB. A later audited
pass reclaimed another 6,128,626,801 bytes after owned test installations stopped, while retaining
the current target build. Evidence is .cache/storage-cleanup-initial.json and
.cache/storage-cleanup.json. Later builds grow target again; reclaimed bytes are not the same as
the net workspace-size change. The previous workspace measurement was about 55.46 GiB.
The earlier measurement after cleanup and validation builds was 16,163,312,034 bytes, approximately
15.05 GiB, including the current build output. See .cache/storage-final.json.
All 42 registered assets in the canonical .data library resolved to existing files after cleanup.

## Preview.4 cleanup

After preview.3 delivery was verified, obsolete preview.2 staging, cold media/test libraries, and
preview.3 staging/download copies reclaimed 511,929,696, 79,147,615, and 1,024,253,942 bytes
respectively. Fixture videos shared with the canonical library were hard links; their retained
bytes were excluded from the reclaimed-byte count. Evidence: .cache/preview3-staging-cleanup.json,
.cache/preview3-fixture-cleanup.json, and .cache/preview3-staging-completed-cleanup.json.

Once both local preview.4 builds finished, another reviewed pass removed cold fixtures, tool
download archives, and selected Rust debug/build/bundle directories, reclaiming 11,107,053,847
bytes (10.34 GiB). The audit checked resolved containment, rejected symlinks/junctions, and
protected running-process paths before deletion. Canonical models, required tools, managed videos,
and the open native application were retained. Rebuilds will recreate the removed build caches.
Evidence: .cache/preview4-cleanup-audit.json and .cache/preview4-cleanup-applied.json.

Fixtures use configurable UC_FIXTURE_DIR and UC_TEST_DATA_DIR paths. UC_MODELS_DIR selects a shared
model store at engine startup; UC_MODELS_READ_ONLY=1 rejects model mutations. Tests borrow models
instead of creating additional multi-gigabyte copies. Dev/test Rust profiles disable debug symbols
to reduce rebuildable output.

## Preview.5 cleanup

Completed test libraries and obsolete native snapshots reclaimed 802,951,073 bytes. Shared
hard-linked footage was excluded from the reclaimed-byte count. After source checks and a
stable native snapshot were complete, unused Rust debug caches reclaimed 5,824,391,710 bytes.
After public release verification, obsolete preview.4 staging, temporary installer extraction,
archive tools, and old executables reclaimed 3,983,058,559 bytes. This pass totals
10,610,401,342 bytes (9.88 GiB), including temporary outputs created during validation.

Every removal used an explicit allowlist, resolved-path containment, symlink/junction rejection,
and process-reference checks. The published ARM64 application runs from .cache/preview5-live
with its own copied studio files, independent of rebuildable frontend output. All six registered
assets and three ready models remained present; the two real projects were preserved. Publisher
keys and the Git history backup live outside the repository and were retained.

The final workspace measured 15,814,138,228 unique file bytes (14.73 GiB), excluding symlink
traversal and including both downloaded Windows installers. New builds will grow target again.
Evidence: .cache/preview5-cold-cleanup-applied.json, .cache/preview5-build-cleanup-applied.json,
.cache/preview5-final-cleanup-applied.json, .cache/preview5-storage-final.json, and
.cache/preview5-native-final.json.

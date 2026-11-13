# Settings and diagnostics

Requirement: OPS-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Select language, speech model, export defaults, and update behavior. Inspect tool/model status, storage usage, processing errors, and diagnostic records.

Interface preferences are synchronized from SQLite on bootstrap, including new tabs. Settings expose model install/import/repair, update feeds, manual update checks, component rollback, diagnostics, and temporary-cache cleanup. Unrestricted active-job checks protect cleanup even when a job is older than the recent-history list.

## Interface

GET /api/v1/settings; PUT /api/v1/settings; GET /api/v1/diagnostics

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Validate settings before applying them. Logs avoid session tokens and signed URLs. Storage cleanup must not remove originals or assets referenced by active jobs.

## Acceptance scenarios

Check invalid settings, missing tools, model repair, diagnostic export, storage cleanup, and localization.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

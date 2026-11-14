# Settings and diagnostics

Requirement: OPS-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Select language, speech model, export defaults, and update behavior. Inspect tool/model status, storage usage, processing errors, and diagnostic records.

Interface preferences are synchronized from SQLite on bootstrap, including new tabs. Settings expose
a model download dropdown, optional manual import/repair, simple update controls, component rollback,
diagnostics, and temporary-cache cleanup. Update server addresses remain in the shared API contract
and publisher configuration; the normal UI does not ask users to enter them. Unrestricted active-job
checks protect cleanup even when a job is older than the recent-history list.

The private preview has no public automatic-update service. Its automatic-update toggle is disabled
with a plain explanation, and Check for updates opens the GitHub release page. Native desktop uses
a fixed-URL command; browser uses a new tab. A running older development host can open the browser
studio when it does not yet support that command. Configured deployments retain signed, idle-only
update checks and installation. No unavailable update service is presented as working.

## Interface

Settings action buttons use consistent Phosphor icons alongside their visible translated labels.
Headers and sections follow the window width. Processing history uses compact responsive rows,
visible percentages, and expandable full error details. The activity popup anchors below the page
header so it does not cover search or toolbar controls.

Processing rows reserve the same title, meter, date, and action columns regardless of job status.
On desktop the title and percentage share a row, with the stage message above the meter. Narrow
screens stack the stage/meter under the title. Retry and cancellation use small labeled icons
with native tooltips, visible focus, and 44-pixel hit areas; pending requests disable their action.

Temporary cleanup reports reclaimed bytes and protected entries. It retains failed/cancelled job
checkpoints for retry, nested temporary references, project transcription checkpoints, and every
registered temporary asset. Originals, exports, and models are outside this cleanup scope.
The repository cleanup helper is dry-run by default; see ../storage.md.

GET /api/v1/settings; PUT /api/v1/settings; GET /api/v1/diagnostics

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Validate settings before applying them. Logs avoid session tokens and signed URLs. Storage cleanup must not remove originals or assets referenced by active jobs.

## Acceptance scenarios

Check invalid settings, missing tools, model repair, diagnostic export, storage cleanup, and localization.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

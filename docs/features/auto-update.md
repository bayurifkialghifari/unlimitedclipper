# Automatic updates

Requirement: UPD-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Check startup/daily, download signed updates, and install only when idle following a postponable countdown. Update media components using a signed manifest with architecture selection.

Components use a signed manifest with an architecture-specific package, bounded download, checksum verification, safe extraction, and executable health checks. Activation is deferred by active jobs and editor leases, then requires an idle restart for inference DLLs. Previous directory and version metadata persist across rollback and restart. The native application bridge verifies signed versions and creates a VACUUM INTO backup before installation. Production signing and release validation remain explicit gates.

## Interface

GET /api/v1/updates; POST /api/v1/updates/check; desktop updater bridge

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Use immutable staging, checksum/signature verification, health checks, and previous component recovery. Preserve database backups and project data. Production feeds require configured signing keys.

## Acceptance scenarios

Test signature rejection, interrupted downloads, wrong architecture, active-job deferral, countdown postponement, rollback, and migration failure.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

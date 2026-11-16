# Automatic updates

Requirement: UPD-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Check startup/daily, download signed updates, and install only when idle following a postponable countdown. Update media components using a signed manifest with architecture selection.

Components use a signed manifest with an architecture-specific package, bounded download, checksum verification, safe extraction, and executable health checks. Activation is deferred by active jobs and editor leases, then requires an idle restart for inference DLLs. Previous directory and version metadata persist across rollback and restart. The native application bridge verifies signed versions and creates a VACUUM INTO backup before installation. Production signing and release validation remain explicit gates.

Normal Settings only presents an automatic-update preference and Check for updates. Publisher
configuration supplies server addresses through the existing API. Previews without that
configuration use a fixed GitHub download page and disable automatic installation. Existing
configured deployments keep their signed update workflow. The native download-page command accepts
no URL argument, so the studio cannot use it as an unrestricted external opener.

Build-time Windows tool provisioning extracts entries through .NET ZIP streams, overwrites existing
files inside the extraction directory, and rejects rooted paths or traversal outside that directory.
This supports Windows PowerShell 5.1 when runner ZIP modules expose incompatible extraction overloads.

Desktop packaging stages the matching WebView2 loader inside the workspace and uses resource
paths relative to the Tauri project. The Cargo SDK cache may live on a different Windows drive.
Tagged CI now stages Linux x64/ARM64 AppImages and macOS Intel/ARM disk images alongside Windows
installers. The application update manifest still lists only Windows installers. Unix packages
are manual preview downloads until their updater artifact and installation behavior are tested.
The tagged workflow verifies pinned corresponding-source coverage and a recorded platform notice
audit before creating a draft, uploading artifacts, and making that tag public. The current audit
remains pending, so a new tag is blocked before release creation. Rerunning the same tag can
resume a draft, while an already published tag must match the staged artifacts.
Tagged version preparation changes version values in place so the Android source checks see
Prettier-formatted configuration files.

## Interface

GET /api/v1/updates; POST /api/v1/updates/check; desktop updater bridge

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Use immutable staging, checksum/signature verification, health checks, and previous component recovery. Preserve database backups and project data. Production feeds require configured signing keys.

## Acceptance scenarios

Test signature rejection, interrupted downloads, wrong architecture, active-job deferral, countdown postponement, rollback, and migration failure.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

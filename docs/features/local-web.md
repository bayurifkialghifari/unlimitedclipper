# Local browser studio

Requirement: WEB-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

Serve the same compiled React studio and API on loopback. Browser users upload files and access the same projects, editor, models, and exports as desktop users.

The Tauri WebView and browser use one loopback engine and database. Exact origin checks reject other localhost services. Session cookies survive an idle engine restart until their original expiration. The Open browser studio desktop control issues a fresh one-time bootstrap link.

## Interface

POST /api/v1/session; /api/v1 routes; GET /api/v1/events

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Bootstrap an authenticated local session. Validate request origins. Reconnecting clients fetch a fresh state snapshot. A web page cannot execute yt-dlp without the local engine.

## Acceptance scenarios

Check authentication, origin rejection, uploads, media range requests, SSE reconnect, desktop/browser revision conflicts, and browser downloads.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

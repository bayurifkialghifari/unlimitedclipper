# Source import

Requirement: SRC-01. Status: implemented; validation coverage is recorded in ../validation.md.

## Behavior

YouTube URLs, native file selection, browser uploads, and drag-and-drop create managed projects. Metadata includes duration, dimensions, audio availability, and source identity.

Keep the original source for export. Generate a managed H.264/AAC preview at up to 1280 by 720 and 30 fps, preserving source-relative timing. Preview progress reports encoded source time. Retrying a cancelled preview reuses the completed download.

Native dialog import and real browser upload passed separate interaction checks. The downloader streams progress and supervises child processes. Interrupted upload files are removed on startup only after acquiring the exclusive data-directory lock. Real channel recordings are validated independently of small test fixtures.

## Interface

POST /api/v1/imports/upload; POST /api/v1/imports/youtube; GET /api/v1/projects

## States and failure handling

Every data view provides empty, loading, success, and error states. Disabled actions explain their prerequisites. Probe before accepting media. Reject unsupported/corrupt inputs with useful errors. Preserve partial download checkpoints and completed source files. Cancellation must stop the downloader before becoming terminal.

## Acceptance scenarios

Import Unicode filenames, public YouTube links, video without audio, corrupt files, interrupted downloads, and duplicate sources.

## Evidence

Record completed runtime and interaction checks in ../validation.md. This document specifies required behavior; it does not claim unrun checks have passed.

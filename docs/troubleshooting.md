# Troubleshooting

| Symptom                                                  | Recovery                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI action is unavailable                                 | Install the selected speech model and Qwen3 4B in Settings. Manual clips remain available.                                                             |
| A model is missing or damaged                            | Use Repair model. It verifies the installed bytes and downloads the pinned model when verification fails.                                              |
| A download stops                                         | Retry its job. Model downloads resume from verified server byte ranges.                                                                                |
| A job was interrupted by closing the app                 | Reopen Processing and retry. Generation reuses saved selections; completed export identities are stable across retries.                                |
| Clip save reports a conflict                             | Reload the saved clip after reviewing the unsaved draft. Another editor or AI job changed the revision. The engine rejects stale writes.               |
| Preview cannot play the original format                  | Import waits for a managed H.264/AAC MP4 preview. Export uses the original source. Check the import job for decoder errors.                            |
| No speech or face is detected                            | Select another model, adjust the crop region, or create/edit the clip manually. AI detection depends on the recording.                                 |
| YouTube download fails                                   | Check the URL and network. A restricted, removed, or unavailable video may be inaccessible to yt-dlp. Retry after repairing or updating the toolchain. |
| Another engine owns this library                         | Use its existing studio or close it before launching another engine. Desktop Open in browser uses the same process and database.                       |
| Authorization link has expired                           | Reopen the browser from the desktop or restart the standalone engine to obtain a new link. A link can bootstrap one session.                           |
| An update is deferred                                    | Finish active jobs and save edits in every open studio. The countdown pauses while busy and can be postponed for one hour.                             |
| Signature or checksum verification fails                 | Keep the installed version. The package is never activated. Check the configured publisher feed and retry.                                             |
| A development build cannot replace the engine executable | Stop the process running that executable. Windows prevents replacing an executable while it runs.                                                      |

Download diagnostics from Settings. Diagnostics contain job metadata and error messages; review them before sharing because names, source URLs, or local paths may identify your projects.

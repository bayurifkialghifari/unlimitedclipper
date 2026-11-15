# Sound effects

Status: implemented. See ../validation.md for processing and interaction evidence.

The audio library includes 13 whooshes and eight clicks/taps. The 21 original upstream WAV
files total 532,354 bytes and ship with the Studio, so audition and import work offline.
Sources are artisticdude's Swishes Sound Pack and Kenney's UI Sound Effects, both marked
CC0 1.0 by their authors on OpenGameArt. resources/sfx.json pins archive and file hashes;
the packaged directory includes license/source credits. No soundboard audio is redistributed
without established permission.

Listen with the named play/pause button, then add at the current output playhead. Import
checks SHA-256 and size before registering a managed audio asset. A successful placement
creates an enabled audio layer at 35% gain, clipped to the output endpoint. The timeline
provides drag, numeric offsets, source offset, trimming, gain, enable/disable, and deletion.
Imported copies remain in the library when their layer is deleted. Maximum: 16 audio layers.

Import waits for heavy processing to finish. A clip change during import preserves the library
asset and reports that placement needs repeating. Integrity or missing-file failures give
reinstallation guidance. Missing assets fail export explicitly. Original audio is retained
and a limiter protects the mix; this is not automatic loudness mastering or music ducking.

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

The Audio panel also lists imported sounds with search, individual playback, and Add at playhead.
Imported sounds can also be dragged onto an audio track at the desired output time. An audio
layer shows the measured waveform for the section starting at its source offset, and the selected
layer has a larger waveform with explicit retry on decode failure. Click and keyboard placement
remain available when drag is unsuitable. The waveform is a source preview and does not include
the final gain, fades, normalization, or ducking.
The SFX collection has category and text filters. An external soundboard link opens in the
browser; sounds from that site are not bundled or imported automatically. Imported audio stays
registered as a managed asset, so the editor can reuse it in another clip.

Import waits for heavy processing to finish. A clip change during import preserves the library
asset and reports that placement needs repeating. Integrity or missing-file failures give
reinstallation guidance. Missing assets fail export explicitly. Original audio is retained
and a limiter protects the mix. The updated desktop engine offers editable fade in/out,
optional single-pass loudness normalization for a layer, and sidechain ducking of a layer
against source audio. These settings affect exact preview and export; live playback is an
editing approximation. Older engines disable the mixing controls. This is not a guarantee
of a target integrated loudness for the finished clip.

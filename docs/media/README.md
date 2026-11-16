# README media

These assets show the actual application and real exported footage. They are committed so the README
works from a fresh checkout without relying on ignored cache or application-data files.

## Screenshots

Eight README screenshots and one additional B-roll capture were taken on 16 November 2026 from an isolated
Windows ARM64 desktop development build through its native WebView2 window at 1600 × 1000. The
Tauri bridge was present. The source was the reviewed podcast export in docs/media/editor-demo.mp4,
imported into a separate desktop library. Its matching editor-demo.srt phrases were added to the
manual cut, then that cut was divided into two source scenes. This is a layout and interaction
fixture, not a new automatic-selection or transcription result. The owner's existing library and
the desktop instance on port 43179 were unchanged.

- studio.png: compact top tools, two actual-source scene strips, and a waveform measured from the
  source audio beneath them.
- clips.png: the project clip list with one Edit clip action per card.
- captions.png: caption looks populated by the matching subtitle sidecar.
- broll-library.png: a decoded local B-roll preview with source details in the Studio inspector.
- broll.png: a placed B-roll layer and its motion controls.
- filters.png: video filter previews from the same source frame.
- projects.png: the imported podcast MP4 and its actual source thumbnail.
- settings.png: a fresh library with optional AI models missing and local media tools ready.
- exports.png: a completed MP4 shown directly with native playback controls and download links.

The native check decoded a scene frame and measured 163 audio buckets with nonzero levels present.
It exported the edited clip, loaded its video element, and advanced playback without page errors.
Evidence:
scripts/validate-native-layout.mjs and .cache/native-layout-validation.json. Installer execution
and runtime behavior on other operating systems are separate validation tasks. The old rating.png
is retained as historical browser evidence and is not referenced in the current README.

## Video examples

`editor-demo.mp4` is a 16.26-second manual edit from
[Matan's podcast](https://www.youtube.com/watch?v=duo5XCX91YM), source range
404,480–420,740 ms. It preserves export revision 3 of the separate Local editor demo clip,
export ID `99e756eb-d089-57c4-872f-a9d991499abc`. Native controls applied an Impact opening
hook with Pop animation, Impact captions, Warm adjustments, and a downloaded CC0 whoosh.
The original revision-9 clip was preserved. The source belongs to its creator and implies
no endorsement. The demo includes strong language.

Its original 1080 x 1920 MP4 passed full decode and native playback. The README copy is
720 x 1280 H.264/AAC with fast-start metadata; geometry, duration, audio, and full decode
passed independently. `editor-demo.png` is its frame at 1.2 seconds; `editor-demo.srt` retains
the original output-relative timing. Evidence: .cache/editor-tools-native-demo.json and
.cache/editor-demo-readme-media.json. Reported rendering times reuse existing captions,
on an eight-core Snapdragon X laptop with approximately 16 GB RAM.

Source: [Windah Basudara's Sunnybrook recording](https://www.youtube.com/watch?v=qTJIbYC2mFc). The footage
belongs to its original creator. The examples demonstrate editing and rendering, not endorsement.

| File           | Source range           | Saved revision | Original export                        |
| -------------- | ---------------------- | -------------- | -------------------------------------- |
| `escape.mp4`   | 1,436,500–1,446,900 ms | 20             | `2c914cc2-b98d-546a-8d5b-a1466d942018` |
| `dinosaur.mp4` | 2,504,700–2,513,400 ms | 6              | `9969e61a-7f92-5b1f-9888-b63f9b147fcf` |

Original deliveries live in the ignored `.data/deliveries/windah-refined-2026-11-13/` directory. These
README copies use 720 × 1280 H.264 video, AAC audio, and MP4 fast-start metadata. Re-encoding preserves
the full cut, composition, burned captions, and titles. Both copies passed geometry, audio, duration,
and complete FFmpeg decoding checks. Their `.srt` files retain the original clip-relative timings.

Poster frames are taken directly from these videos at 1.2 and 2.2 seconds. The README links posters to
the MP4 files instead of relying on a video HTML element that GitHub may strip. Download the MP4 if a
particular repository viewer does not provide playback.

Local recognition was followed by manual corrections and tighter source boundaries. These clips are
reviewed examples, not unedited automatic selections or evidence of universal caption accuracy.

## README references

Reviewed the current READMEs and repository metadata on 13 November 2026:

- [LocalSend](https://github.com/localsend/localsend): product screenshots, concise navigation, and
  platform-specific setup.
- [Excalidraw](https://github.com/excalidraw/excalidraw): a visible product preview before detailed
  features and contribution information.
- [Ollama](https://github.com/ollama/ollama): a short introduction, practical commands, and deeper
  documentation links.

These informed the reading order. Their logos, screenshots, copy, and promotional claims were not
copied into this project.

# README media

These assets show the actual application and real exported footage. They are committed so the README
works from a fresh checkout without relying on ignored `.cache` or `.data` files.

## Screenshots

Captured on 14 November 2026 from the browser studio at a 1920 × 1080 viewport. Settings uses a
1920 × 1503 full-page capture. The interface uses its English dictionary. A consistent SQLite
snapshot and hard-linked managed footage provided an isolated copy of the actual library.
Creating the manual demo changed only that copy. No competitor screenshots were substituted.

- `studio.png`: an 18-second manual podcast review with two scenes and the Motion style filter.
- `captions.png`: the same review with the Word box look and a selected transcript word.
- `projects.png`: two real imports of the 48-minute Matan podcast.
- `settings.png`: actual installed models, download/import actions, and update controls.
- `rating.png`: an actual Qwen transcript assessment of the manual review, scored 74/100.

Podcast source: “Matan Finally Confronts Mike Majlak About Logan Paul,” already imported in the
user library. This is a manual interface demonstration, not an AI-quality benchmark. The footage
belongs to its original creator and does not imply endorsement. Capture evidence:
`.cache/preview5-readme-validation.json`. Screenshots use the current graphite/amber palette;
Noto Sans previews load the same bundled font as rendering. The Windah video examples below
remain unchanged. Rating explanations describe transcript evidence rather than predicted views.

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

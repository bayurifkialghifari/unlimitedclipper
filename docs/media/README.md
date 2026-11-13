# README media

These assets show the actual application and real exported footage. They are committed so the README
works from a fresh checkout without relying on ignored `.cache` or `.data` files.

## Screenshots

Captured on 13 November 2026 from the Windows ARM64 native application with its WebView2 bridge. The
studio viewport was 1800 × 1120; full-page editor screenshots include the saved clip rail. The
interface uses its Indonesian dictionary. No mock data or competitor screenshots were substituted.

- `studio.png`: dinosaur cut at 2.2 seconds, with the Impact caption look.
- `captions.png`: escape cut at 1.2 seconds, with the Word box caption look.
- `projects.png`: the imported Windah recording in the persistent library.

## Video examples

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

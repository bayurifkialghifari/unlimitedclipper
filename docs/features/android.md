# Android application

Status: in development. No Android package or processing workflow has passed runtime validation yet.

## Goal

Run the same local clipping library, revisioned edits, captions, and exports on an Android device.
Android must own its Rust engine and private application data. A connection to a desktop computer is
not a substitute for on-device processing.

The first target is Android ARM64, API 29 or later, on a Snapdragon 8+ Gen 1 device with 12 GB RAM.
An x86_64 emulator remains a future integration-test target. The owner requested an APK build without
local Android runtime tests. Model suitability and sustained processing limits remain unmeasured;
see ../android.md for provisional requirements.

## Native boundaries

- Supply data, media resources, compiled studio files, and a loopback port through explicit engine
  configuration. Do not guess an Android data directory through desktop environment variables.
- Use Android's document picker and content resolver. Copy selected media into managed private
  storage before creating import jobs; never treat a content URI as a normal filesystem path.
- Call packaged native media and inference libraries. Android 10 restricts execution of binaries
  from writable application directories, so downloading desktop-style executables is unsuitable.
- Keep scheduling, source timing, caption documents, edit revisions, export identity, and persistent
  recovery in Rust. The Android bridge supplies native operations and lifecycle integration.
- Use foreground processing for long jobs, explicit cancellation, and native completion callbacks.
  Cancellation becomes terminal only after native execution stops.
- Preserve the original source and keep models, previews, temporary files, and exports outside the
  installed APK. Export or share completed files through the platform's document/URI APIs.
- Expose actual runtime capabilities. Unsupported operations must be disabled with a visible reason;
  a package that cannot import and export a real clip is not a completed Android delivery.

## Implementation sequence

1. Explicit engine configuration and Android cross-compilation, preserving the desktop startup path.
2. Native media execution with probing, source import, preview generation, and captioned rendering.
3. Shared Tauri studio, scoped document access, export sharing, and lifecycle/recovery handling.
4. Packaged Whisper and local selection inference, with source-timed word alignment and bounded
   prompts preserved. Validate model memory and cancellation separately from desktop behavior.
5. Local yt-dlp integration and a supported embedded JavaScript challenge runtime, verified against
   real sources before enabling YouTube imports.
6. Signed APK distribution and physical ARM64 validation, followed by measured resource limits.

FFmpegKit Next is being evaluated as a native media boundary. Its current official release is
source-only, so the project must build and verify its native libraries instead of pointing at a
nonexistent Maven download. Prefer an LGPL configuration with Android's media codecs; do not silently
replace separately executed desktop GPL tools with linked GPL libraries.

## Acceptance evidence

Run a real speech/video fixture on Android, import it through scoped storage, create a clip, change
its captions and framing, reload the application, and export with audio and expected dimensions.
Check source versus clip-relative timing, immutable revisions, cancelled jobs, restart recovery, and
sharing the completed file. Exercise touch and keyboard navigation, portrait/landscape layouts,
backgrounding, and interruption during processing.

CI must produce APKs. Device/emulator interaction and media-decoding evidence are deferred for the
initial build at the owner's request. An ARM64 build alone is not evidence of native ARM64 runtime
behavior. The current Windows ARM64 development machine is not supported by the official Android
Emulator; a supported host is required when runtime testing resumes.

## Sources

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/).
- [Android executable-file restrictions](https://developer.android.com/about/versions/10/behavior-changes-10?hl=en#execute-permission).
- [Android Studio host requirements](https://developer.android.com/studio/install?hl=en).
- [FFmpegKit Next](https://github.com/arthenica/ffmpeg-kit-next) and its
  [source-only release](https://github.com/arthenica/ffmpeg-kit-next/releases/tag/v9.0.2).

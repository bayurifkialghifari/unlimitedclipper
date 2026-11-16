# Android application

Status: experimental media-only ARM64 APK built and inspected. Android runtime validation has not
been performed.

## Goal

Run the same local clipping library, revisioned edits, captions, and exports on an Android device.
Android must own its Rust engine and private application data. A connection to a desktop computer is
not a substitute for on-device processing.

The first target is Android ARM64, API 29 or later, on a Snapdragon 8+ Gen 1 device with 12 GB RAM.
An x86_64 emulator remains a future integration-test target. The owner requested an APK build without
local Android runtime tests. Model suitability and sustained processing limits remain unmeasured;
see ../android.md for provisional requirements.

## Native boundaries

The Rust execution-provider contract is implemented. Hosts expose supported tools, receive argument
arrays, and return only after native completion. The health contract distinguishes native providers
and reports each supported tool. Unsupported generation, speech refinement, title inference,
tracking, downloader, model installation, and component-update jobs are rejected before admission
in the initial media-only configuration. Desktop capture keeps its previous executable backend.

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

The current host includes the shared studio, private Rust engine/SQLite state, native media
argument execution, foreground processing, scoped local import, and scoped export saving. Android
controls for AI, YouTube, and automatic updates are disabled with visible status. Native AI and
downloader adapters remain subsequent work. See ../android.md for the preview build instructions
and signing limitations.

1. Explicit engine configuration and Android cross-compilation, preserving the desktop startup path.
2. Native media execution with probing, source import, preview generation, and captioned rendering.
3. Shared Tauri studio, scoped document access, export sharing, and lifecycle/recovery handling.
4. Packaged Whisper and local selection inference, with source-timed word alignment and bounded
   prompts preserved. Validate model memory and cancellation separately from desktop behavior.
5. Local yt-dlp integration and a supported embedded JavaScript challenge runtime, verified against
   real sources before enabling YouTube imports.
6. Stable release signing and physical ARM64 validation, followed by measured resource limits.

The initial native media boundary uses FFmpegKit Next, built from its pinned official source. The
ARM64 source build and archive inspection passed in
[media run 43450248163](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43450248163).
Its source-only release supplies no prebuilt Maven package. The application resolves the inspected
archive from the local Maven repository for every Gradle project. The configuration uses libass and
Android's media codecs without GPL/x264 linkage. This build evidence does not verify media execution
on a phone.

## Acceptance evidence

Run a real speech/video fixture on Android, import it through scoped storage, create a clip, change
its captions and framing, reload the application, and export with audio and expected dimensions.
Check source versus clip-relative timing, immutable revisions, cancelled jobs, restart recovery, and
sharing the completed file. Exercise touch and keyboard navigation, portrait/landscape layouts,
backgrounding, and interruption during processing.

CI produces a debug-signed ARM64 preview APK with SDK, signature, architecture, checksum, and 16 KB
alignment inspection. See [the build and download evidence](../android.md). Device/emulator
interaction and media-decoding evidence are deferred for the
initial build at the owner's request. An ARM64 build alone is not evidence of native ARM64 runtime
behavior. The current Windows ARM64 development machine is not supported by the official Android
Emulator; a supported host is required when runtime testing resumes.

The tagged preview workflow can rebuild the pinned native media dependency and attach the
inspected debug APK, native AAR, build evidence, license, and pinned source/build-script snapshot
to the same release as desktop packages. APK signing remains debug-only and
may change between CI runs. The APK is labeled experimental; on-device import and export are
still unverified.

The preview.10 tagged workflow passed APK packaging and staged it in a draft release. This APK
supports media-only manual clipping; native AI and downloader adapters remain pending.

## Sources

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- [Tauri mobile plugin development](https://v2.tauri.app/develop/plugins/develop-mobile/).
- [Android executable-file restrictions](https://developer.android.com/about/versions/10/behavior-changes-10?hl=en#execute-permission).
- [Android Studio host requirements](https://developer.android.com/studio/install?hl=en).
- [FFmpegKit Next](https://github.com/arthenica/ffmpeg-kit-next) and its
  [source-only release](https://github.com/arthenica/ffmpeg-kit-next/releases/tag/v9.0.2).

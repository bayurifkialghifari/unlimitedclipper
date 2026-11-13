# Android build and requirements

**Android runtime is untested.** The current delivery targets an ARM64 APK. Local device and emulator
processing tests are intentionally deferred at the owner's request. A successful build does not
certify import, inference, export, battery usage, or thermal behavior on a phone.

## Target device

The first intended device uses a Qualcomm Snapdragon 8+ Gen 1 with 12 GB RAM. Its exact Android
version has not been provided. This device profile guides the initial memory budget; it is not a
completed compatibility test.

## Technical baseline

| Item             | Current build requirement                                                           |
| ---------------- | ----------------------------------------------------------------------------------- |
| Android          | Android 10, API 29, or later.                                                       |
| Architecture     | 64-bit ARM, `arm64-v8a`.                                                            |
| Native libraries | NDK 28.2; the build gate requires 16 KB ELF load alignment.                         |
| Internet         | Needed for model downloads, YouTube imports when supported, and configured updates. |
| Media access     | Android's document picker and scoped URI access, with managed private copies.       |

The committed source of build settings is [resources/android.json](../resources/android.json).
YouTube importing and native AI support must be documented for the actual APK before claiming
desktop feature parity. The app must not fall back to a remote computer or cloud AI silently.

## Provisional resource budget

These are engineering estimates, not measured minimum requirements:

- **RAM:** budget 8 GB or more for the intended local AI workflow; 12 GB is the initial target.
  A measured lower bound and Android memory limits are still pending.
- **Storage:** start with at least 8 GB free for tools, models, and small projects. Long recordings
  need additional space for originals, preview proxies, temporary files, and exports.
- **Models:** the existing Whisper small and Qwen3 4B manifests total about 2.69 GB. Optional Whisper
  medium adds about 539 MB. Installing those files alone does not prove native Android inference.
- **Processing:** one heavy job at a time. Start with short sources and 720p exports during the first
  device evaluation. Processing time, peak memory, power use, and sustained heat are unmeasured.

## Initial APK scope

The shared Tauri studio hosts its own Rust engine and SQLite library in private Android storage.
The Android bridge provides the document picker, managed source copies, native FFmpeg/FFprobe
execution, progress callbacks, and export saving through scoped document access. Media rendering
uses Android MediaCodec H.264 at a 5 Mbps target instead of the desktop x264 encoder. Codec support,
visual parity, caption glyphs, cancellation, backgrounding, and saved-file playback remain untested.

The studio shows an Android preview notice. Local import, manual clips, caption-word editing,
framing, titles entered manually, project history, and export controls use the shared workflow.
Automatic transcription, clip discovery, caption refinement, generated titles, face tracking,
YouTube imports, model installation, and automatic updates are disabled in this APK. The engine also
rejects unsupported jobs before queueing and on retries. Do not install the desktop model downloads
for this media-only preview; their native Android adapters are not packaged yet.

Long media operations request a foreground data-sync service and a bounded wake lock. Android can
still interrupt the application, and recent Android versions impose service time limits. Existing
Rust checkpoints provide restart recovery; physical-device lifecycle evidence is pending.

## Building a preview

Use Node 24, Rust with the aarch64-linux-android target, JDK 21, Android SDK/build-tools 36, and the
pinned NDK from resources/android.json. The Android Gradle project is checked in; rebuilding it does
not require running Tauri initialization again.

1. Run the Android native media workflow in GitHub Actions. It builds the pinned LGPL source and
   retains the inspected Maven archive plus build evidence.
2. Run the Android ARM64 preview APK workflow with that successful media workflow run ID. It builds
   the studio and ARM64 application and checks SDK metadata, signature, ELF architecture, and 16 KB
   native/ZIP alignment without launching a device or emulator.
3. Download the artifact named UnlimitedClipper-android-arm64-preview-UNTESTED. It contains the APK,
   checksum evidence, package metadata, signature details, and this untested-runtime note.

For a local compilation, download the media artifact into .cache/android-native-tools and run:

```powershell
npm ci
npm run build:android
npm run inspect:android
```

Set ANDROID_HOME, JAVA_HOME, and NDK_HOME for SDK installations outside the workspace. Set
UC_ANDROID_MEDIA_MAVEN to the inspected artifact's maven directory when stored elsewhere. The build
verifies its pinned revision and archive checksum before using it and bundles verified caption
fonts with their licenses.

The initial APK is an experimental debug-signed preview, not a production-signed release or a Play
Store distribution. CI debug signing keys can differ between builds; Android will reject an update
signed with another key. Export files before uninstalling a preview, because uninstalling removes
its private project library. Stable signing and Android automatic updates remain future work.

## Current evidence

The Rust engine cross-compiled for `aarch64-linux-android` with NDK r28c on the Windows ARM64
development machine. That artifact is an engine build, not an installable Android application.
The Android Rust application and native bridge also passed target-specific Clippy with warnings
denied. Native media compilation and APK assembly are in progress; no device/emulator tests have
been performed.

FFmpegKit Next is built from its pinned official source because its current release provides no
prebuilt Maven package. The media build workflow retains its source revision, native architecture
and alignment inspection, archive checksum, and diagnostics. APK artifacts will carry an explicit
untested-runtime status.

See [the Android feature document](features/android.md), [platform support](platform-support.md), and
[validation](validation.md) for the implementation and evidence boundaries.

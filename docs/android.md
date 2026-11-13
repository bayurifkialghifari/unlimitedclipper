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

## Build status

The Rust engine cross-compiled for `aarch64-linux-android` with NDK r28c on the Windows ARM64
development machine. That artifact is an engine build, not an installable Android application.
The native media library and APK integration are in progress.

FFmpegKit Next is built from its pinned official source because its current release provides no
prebuilt Maven package. The media build workflow retains its source revision, native architecture
and alignment inspection, archive checksum, and diagnostics. APK artifacts will carry an explicit
untested-runtime status.

See [the Android feature document](features/android.md), [platform support](platform-support.md), and
[validation](validation.md) for the implementation and evidence boundaries.

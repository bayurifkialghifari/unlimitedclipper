# Setup

## Installed desktop application

Use the installer matching the processor: ARM64 for Snapdragon Windows PCs, x64 for Intel or AMD PCs. Install for the current Windows user. The package contains FFmpeg, FFprobe, yt-dlp, Deno, Whisper, llama.cpp, ONNX Runtime, the face detector, caption fonts, and the studio. A separate Python installation or AI service account is not required.

Open Settings and install Whisper small and Qwen3 4B. Their combined download is approximately 2.69 GB. Whisper medium is an optional 539 MB speech model. Downloads resume after interruption and are checked against the committed SHA-256 manifest. Select the installed speech model before generating clips.

Import a local video or a YouTube URL. Create a manual clip immediately, or find clips with local AI after model setup. Review the transcript and suggested boundaries. Changes save locally; export snapshots the saved revision. Completed MP4, SRT, and ASS files are available in Exports.

## Development on Windows

Requirements: Node.js 24, npm, Rust 1.92 or later, and Git for source management. The workspace supports a portable ARM64 LLVM-MinGW compiler when a Windows SDK and MSVC toolchain are unavailable.

Run these commands from the repository root:

```powershell
npm install
npm run setup:compiler
npm run setup:tools -- --arch=arm64
npm run dev
```

For an x64 toolchain, use --arch=x64. The portable compiler requires the stable-aarch64-pc-windows-gnullvm Rust host toolchain. scripts/cargo.mjs selects it for the workspace without changing the global default. Use UC_USE_MSVC=1 to use a configured MSVC environment.

The development frontend listens on http://127.0.0.1:5173. The engine listens on http://127.0.0.1:43179. Development uses .data unless UC_DATA_DIR is set. The production engine serves the compiled frontend and prints a one-time authorization link. Open that complete link to establish a browser session.

```powershell
npm run build
npm run dev:engine
npm run build:desktop
```

The desktop bundle script includes the matching native tool directory and compiled studio. Signing a distributable update requires publisher keys; see release.md.

## Storage and offline use

Installed data uses the OS local application-data directory. Videos, preview proxies, thumbnails, models, exports, temporary files, and SQLite state are separate from installed binaries. Changing UC_DATA_DIR selects a different library. An engine lock prevents two processes from owning the same directory.

After tools and models are installed, local imports, editing, speech recognition, clip selection, face tracking, and exports run offline. YouTube imports, model downloads, and configured update feeds require network access. Clear processing cache from Settings after jobs finish. Project deletion removes its managed source, preview, thumbnails, exports, and images that no remaining clip references.

# UnlimitedClipper

A local video clipping studio with a Rust engine, React Atomic Design frontend, SQLite storage, and a Tauri desktop shell. Windows 11 ARM64 and x64 are the first release targets.

## Development

Requirements: Node.js 22+, Rust 1.92+, and a Windows native linker. Run npm ci, npm run setup:tools, and npm run dev. The development launcher starts the engine and frontend together.

If Visual Studio C++ tools are missing, npm run setup:compiler prepares a workspace-local LLVM toolchain. It does not change the global Rust default toolchain. Windows CI uses MSVC; local ARM64 and x64 builds can use portable LLVM.

Use npm run dev:desktop for the desktop shell. Use npm run build and npm run build:engine for a standalone local server.

## Quality checks

Run npm run check, npm run test:rust, and npm run test:e2e. Native desktop and media verification results belong in docs/validation.md.

## Documentation

- [Product requirements](PRD.md)
- [Architecture](architecture.md)
- [Contributor instructions](AGENTS.md)
- [Design direction](DESIGN.md)
- [Feature documents](docs/features/README.md)
- [Research](docs/research.md)
- [Setup](docs/setup.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Validation](docs/validation.md)

Models download once during setup. Local video processing then works offline. YouTube imports and update checks require internet access. No cloud AI provider is used.

The studio includes real imports, manual and AI clip selection, caption and title editing, crop keyframes, gaming composition, image/text watermarks, revisioned autosave, and single/batch MP4 exports with SRT and ASS. Desktop file dialogs and browser uploads use the same Rust API. Each export captures a saved revision.

To improve a cut, open Captions, choose a look, and use Refine captions locally with an installed speech model. Medium is optional. Review uncertain words and correct names/slang before export. Clip discovery accepts a moment focus and interest filter; count is a maximum and duration is a target. Selection analyzes transcripts and may return fewer clips or none. See [caption editing](docs/features/caption-editor.md) and [clip discovery](docs/features/clip-discovery.md) for limitations.

Bundled media tools, caption fonts, and YuNet are pinned in resources/toolchains.json and resources/assets.json. Application and component update feeds must be signed with a trusted release key. Development fixtures use separate ignored keys; no production feed is configured by default.

Development status and native certification are documented explicitly; do not infer release readiness from screenshots.

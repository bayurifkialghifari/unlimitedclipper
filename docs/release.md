# Release preparation

Build the studio, install the toolchain for the target architecture, and run the validation commands in AGENTS.md. The bundle script packages the compiled studio and the matching tools under resources/studio and resources/tools.

```powershell
npm run build
npm run build:desktop
```

The current NSIS package installs for the current Windows user. Production releases require application signing, publisher-controlled HTTPS feeds, and independent checks for each processor architecture.

## Update signing

The tag workflow validates the frontend and Rust engine before building Windows ARM64 and x64
NSIS installers, Linux packages, macOS disk images, and an experimental Android ARM64 APK. It
synchronizes package versions to the tag, signs version-bound Windows updater artifacts, and
stages checksums. Public publication is gated by linked media source and notice coverage.
The workflow starts when a `v*` tag is pushed. It does not create tags from commits. After all
platform jobs pass, `publish` stages the installers and APK, verifies source coverage, creates
or updates a draft GitHub Release, uploads assets, and makes it public only after the checks pass.

The v0.1.0-preview.1 workflow was cancelled before publication. The
[v0.1.0-preview.2 workflow](https://github.com/bayurifkialghifari/unlimitedclipper/actions/runs/43577933322)
could not start because GitHub reported failed account payments or a spending-limit restriction.
It ran no validation or build steps. Local validation passed separately; local installer production
uses an isolated checkout of source commit 961e30143bc6e8f0c013138f424fb2511042e075 with the same
tag-version transformation and publisher keys. This is not a successful hosted CI run.

The [published Windows preview](https://github.com/bayurifkialghifari/unlimitedclipper/releases/tag/v0.1.0-preview.2)
contains ARM64 and x64 installers, their version-bound signatures, two architecture manifests,
the merged application.json, and SHA256SUMS. The installers are 225,562,120 and 286,362,857 bytes
respectively. Staging uses the fix in b3e0d84 to prevent the string-key environment from conflicting
with the signer's explicit file-key argument. Node's Ed25519/BLAKE2b verifier checked both
signatures, signed versions, and file hashes; GitHub's eight asset digests matched the local files.
The optimized ARM64 host was tested separately from installer execution. Install/uninstall,
native application-update installation, and physical x64 runtime certification remain pending.
Some Tauri-specific installer messages fall back to English when Indonesian is selected.

Configure APP_UPDATE_PRIVATE_KEY and APP_UPDATE_PUBLIC_KEY repository secrets before tagging. APP_UPDATE_KEY_PASSWORD is optional for an encrypted key. COMPONENT_UPDATE_PUBLIC_KEY embeds the separate component verifier when configured. Missing publisher keys stop the workflow before an unsigned updater release can be published. Development fixture keys are not publisher keys.

Quality CI also compiles and tests the engine on Ubuntu, macOS Intel, and macOS Apple Silicon.
The preview.10 tagged workflow built draft Linux, macOS, Windows, and Android packages, but the
source coverage audit remains pending and those packages are not a public release. The CI builds
do not certify installed runtime behavior on Linux, macOS, Windows x64, or Android. Private
GitHub release URLs require authentication and are not a public customer update feed. Configure
the publisher-controlled feed separately.
The current source-coverage report for preview.10 has 335 missing platform/component entries
across seven targets, representing 78 distinct component names. The four staged source archives
contain FFmpeg, two desktop build-script snapshots, and the FFmpegKit Next wrapper. They do not
contain corresponding source for all statically linked media dependencies. The
`resources/media-source-audit.json` status remains `pending`; do not change it to `complete`
until the exact source revisions, notices, and packaged binaries have been reviewed.

Keep application and component private keys outside source control. Embed their trusted public keys when building with UC_APP_PUBLIC_KEY and UC_COMPONENT_PUBLIC_KEY. Application updates use the Tauri updater verifier. Component feeds contain a signed manifest whose exact bytes identify architecture-specific ZIP artifacts and SHA-256 checksums.

Set TAURI_SIGNING_PRIVATE_KEY_PATH to the publisher key file, then generate an artifact manifest:

```powershell
node scripts/release-manifest.mjs --kind=components --version=0.1.1 --platform=windows-arm64 --file=components.zip --url=https://updates.example.org/components.zip
```

For application updates, use --kind=application and a Tauri updater artifact. The script binds the application signature to the announced version. Combine the architecture entries when publishing a multi-architecture feed. Do not distribute development signing keys.

Components ZIP files contain ffmpeg, yt-dlp, deno, whisper, llama, onnxruntime, fonts, yunet.onnx, and required license/source notices at their roots. Extraction rejects traversal and symbolic links. The engine checks package hashes and executable health before staging. Installation requires an idle engine, uses immutable component directories, and retains the previous activation for recovery.

Application installation creates a consistent SQLite backup using VACUUM INTO before handing the verified package to Tauri. Transactional migrations run on the next engine startup. Exercise update interruption, signature failures, processor mismatch, busy-editor deferral, rollback, migration failure, and native restart before publishing.

## Distribution obligations

Include the exact notices and corresponding-source materials required by the bundled media builds. FFmpeg is a separate GPL-enabled executable; its build dependencies and configuration determine the applicable distribution requirements. Follow third-party-notices.md and review the actual release archive before commercial distribution. An installer build alone is not a release certification.

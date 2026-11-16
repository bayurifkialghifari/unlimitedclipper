# Third-party software and model notices

UnlimitedClipper uses original application source and does not incorporate competitor assets.

| Component                       | Upstream                                                                      | Notice                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FFmpeg / FFprobe                | https://ffmpeg.org/                                                           | The packaged build enables GPL components. Retain the build's licenses, configuration, and required corresponding-source materials. See https://ffmpeg.org/legal.html. |
| yt-dlp                          | https://github.com/yt-dlp/yt-dlp                                              | The source and standalone executable have distinct dependency notices. Distribute the exact executable's notices.                                                      |
| Deno                            | https://github.com/denoland/deno                                              | MIT plus bundled third-party notices.                                                                                                                                  |
| whisper.cpp and Whisper models  | https://github.com/ggml-org/whisper.cpp and https://github.com/openai/whisper | MIT; retain model and implementation notices.                                                                                                                          |
| llama.cpp                       | https://github.com/ggml-org/llama.cpp                                         | MIT plus dependency notices.                                                                                                                                           |
| Qwen3 4B                        | https://huggingface.co/Qwen/Qwen3-4B-GGUF                                     | Apache-2.0; the pinned model manifest records the exact revision and checksum.                                                                                         |
| ONNX Runtime                    | https://github.com/microsoft/onnxruntime                                      | MIT plus third-party notices.                                                                                                                                          |
| YuNet                           | https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet    | Retain the model directory's MIT license and attribution.                                                                                                              |
| Caption fonts                   | https://github.com/google/fonts                                               | SIL Open Font License files are retained beside the bundled fonts.                                                                                                     |
| flag-icons                      | https://github.com/lipis/flag-icons                                           | MIT; the bundled SVG selection and license text are retained in the Studio resources.                                                                                  |
| Supertonic 3 M1 narration pack  | https://huggingface.co/Supertone/supertonic-3                                 | OpenRAIL-M; the optional downloaded snapshot includes its license. Exact revision, file sizes, and SHA-256 hashes appear in resources/narration-pack.json.             |
| JASSUB                          | https://github.com/ThaUnknown/jassub                                          | The wrapper and its WASM distribution include separate libass, FreeType, HarfBuzz, and other notices. Preserve the package's complete license text.                    |
| Tauri                           | https://github.com/tauri-apps/tauri                                           | MIT or Apache-2.0 plus WebView and installer dependencies.                                                                                                             |
| React and frontend dependencies | package-lock.json                                                             | Retain package-level notices for the exact locked versions.                                                                                                            |

Windows native archives and upstream notice/source files are retained under
.tools/windows-ARCH/licenses-and-source. Unix CI stages hash-pinned binaries, upstream license
texts, ONNX Runtime third-party notices, and a provenance map inside each package. A separate
notice archive accompanies each Unix package. Linux FFmpeg/FFprobe comes from the
[FFmpeg-Builds release](https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/tag/autobuild-2026-11-12-15-40),
with [FFmpeg source revision f1acb0a266](https://github.com/FFmpeg/FFmpeg/tree/f1acb0a266)
and [dependency build scripts at c9fe511](https://github.com/FFmpeg-Builds/FFmpeg-Builds/tree/c9fe5114060e507409f7ee07edfd82efaf25d767).
The macOS pair comes from the
[Jellyfin FFmpeg portable release](https://github.com/jellyfin/jellyfin-ffmpeg/releases/tag/v8.1.3-2)
and [source revision 7250de8](https://github.com/jellyfin/jellyfin-ffmpeg/tree/7250de8375a4959ac1c25c139ce9789fdac199fb).
The tagged workflow attaches checksum-verified archives of those FFmpeg source trees and the
Linux build scripts alongside the packages. Linked dependency sources are referenced by the
build scripts; they are not included in those three desktop source archives.
For example, the pinned Linux scripts reference x264 at
0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee and libass at
f61db567e6593df3470e91594bcd4ad2d0473aff. The pinned macOS scripts reference the same
x264 revision and libass at 4a05d8127f525943ebf45fdc6497c9e665947f0d. Those library
source trees are absent from the staged FFmpeg source snapshots. Additional linked
dependencies still require audit.

The final distributable must provide corresponding source for the exact binaries and linked
libraries. Audit the complete source set and availability before publication; source pointers
alone do not establish that obligation.

The Android preview uses [FFmpegKit Next v9.0.2](https://github.com/arthenica/ffmpeg-kit-next/tree/v9.0.2)
under LGPL-3.0-or-later, built from commit 9f04bf1e3c97def70b98e198cb80a57b43ef5b45. Its configuration
enables libass and Android media codecs without GPL/x264 linkage. Retain the native media archive,
build evidence, LGPL text, dependency notices, and exact corresponding source with distributions.
The tagged release also attaches the pinned FFmpegKit Next source/build-script snapshot.
It also attaches the inspected native AAR, build evidence, and LGPL text used by the APK.
The project's Android build sources allow rebuilding the APK with replacement native libraries;
production signing and distribution still require a complete corresponding-source/notice bundle.
Caption fonts keep their OFL files in the embedded studio resources. The checked-in Android shell
and Gradle glue derive from official Tauri framework templates, using the project's existing UC
text icon rather than Tauri branding.

Validation fixtures use the Whisper repository's JFK sample and scikit-image's NASA astronaut photograph. They remain in ignored test storage and are not product imagery or endorsements.

The offline SFX library distributes unmodified selected WAV files from artisticdude's
[Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) and Kenney's
[UI Sound Effects](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks),
published under CC0 1.0. File/source archive hashes appear in resources/sfx.json; the packaged
sfx/LICENSE.txt retains author/source/license information. These authors do not endorse the app.

The optional speech pack retains model cards for
[Indonesian XLSR](https://huggingface.co/cahya/wav2vec2-large-xlsr-indonesian),
[English Wav2Vec2](https://huggingface.co/facebook/wav2vec2-base-960h), and
[ECAPA VoxCeleb](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb), published with Apache-2.0
metadata. Silero VAD retains its MIT license. Exact source revisions and binary hashes appear in
resources/quality-models.json and scripts/export-quality-pack.py. Original export wrappers, CTC
alignment, and speaker frontend code are maintained in this repository. Font metric files retain
their OFL notices in resources/caption-fonts. Native runtime verification remains pending.

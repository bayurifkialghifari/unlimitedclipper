# Third-party software and model notices

UnlimitedClipper uses original application source. It does not incorporate SupoClip source or editorial reference assets.

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
| JASSUB                          | https://github.com/ThaUnknown/jassub                                          | The wrapper and its WASM distribution include separate libass, FreeType, HarfBuzz, and other notices. Preserve the package's complete license text.                    |
| Tauri                           | https://github.com/tauri-apps/tauri                                           | MIT or Apache-2.0 plus WebView and installer dependencies.                                                                                                             |
| React and frontend dependencies | package-lock.json                                                             | Retain package-level notices for the exact locked versions.                                                                                                            |

Native archives and upstream notice/source files are retained under .tools/windows-ARCH/licenses-and-source. The final distributable must contain the required materials for the exact binaries it ships. Review omissions before publishing; a source URL alone does not replace every corresponding-source obligation.

The Android preview uses [FFmpegKit Next v9.0.2](https://github.com/arthenica/ffmpeg-kit-next/tree/v9.0.2)
under LGPL-3.0-or-later, built from commit 9f04bf1e3c97def70b98e198cb80a57b43ef5b45. Its configuration
enables libass and Android media codecs without GPL/x264 linkage. Retain the native media archive,
build evidence, LGPL text, dependency notices, and exact corresponding source with distributions.
The project's Android build sources allow rebuilding the APK with replacement native libraries;
production signing and distribution still require a complete corresponding-source/notice bundle.
Caption fonts keep their OFL files in the embedded studio resources. The checked-in Android shell
and Gradle glue derive from official Tauri framework templates, using the project's existing UC
text icon rather than Tauri branding.

Validation fixtures use the Whisper repository's JFK sample and scikit-image's NASA astronaut photograph. They remain in ignored test storage and are not product imagery or endorsements.

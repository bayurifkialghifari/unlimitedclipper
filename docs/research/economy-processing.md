# Local inference and framing strategy

The implementation targets CPU processing on lower-memory PCs. It trades model context and
candidate breadth against editorial quality; it does not claim parity with a hosted service.

## Primary references

[Qwen3's official model release](https://qwenlm.github.io/blog/qwen3/) describes the small dense
model family and its thinking/non-thinking modes. Discovery uses non-thinking prompts and
pinned quantized weights. [The pinned llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/b12345/tools/server/README.md)
documents tokenization, structured completion, slots, and prompt caching. Exact token counting
and one stage-long server avoid repeated model loads and arbitrary byte-to-token assumptions.

[OpusClip's subject tracking](https://help.opus.pro/docs/article/subject-tracking) and
[layout/reframing documentation](https://help.opus.pro/docs/article/layout-and-reframing)
describe editable subject framing and layouts. Their documentation does not disclose enough
implementation detail to reproduce their tracking or quality. UnlimitedClipper uses its own
shot/identity association around [OpenCV's YuNet detector](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet).
There is no speaker-aware inference claim.

## Practical choices

- Start with Whisper small and Qwen 1.7B. Add 4B for independent final review if memory allows.
- Use 720p exports and short source excerpts on a constrained PC. Export resolution does not
  improve recognition or moment selection.
- Keep one heavy job active, cap inference threads, and load proposal/review models sequentially.
- Give small models complete bounded conversation context. Combine sparse transcript windows
  within the prompt budget rather than analyzing isolated fragments.
- Ask the proposal model to select numbered phrases. Rust owns source-time mapping and quote
  extraction, leaving the model fewer numerical and copying tasks.
- Validate exact quotes and full endings, retain only qualifying non-overlapping cuts, and
  report shortfalls. More output clips do not establish better quality.
- Spend optional medium recognition on uncertain short cuts; keep manual correction available.
- Stream face frames, preserve scene order, hold missing detections, and review split layers.

Runtime measurements and remaining checks are recorded in ../validation.md. Working-set
samples are measurements on the tested ARM64 PC, not minimum RAM certification.

An early paired-model run used approximately 2.68 GiB of process-tree working set during
1.7B proposal inference and 5.48 GiB during 4B review. These figures exclude the operating
system and other applications. An 8 GB small-model-only setup and a 12-16 GB paired setup
are planning estimates; only the 16 GB ARM64 machine was exercised. Installing 4B still
requires room for its review stage even when Economy uses 1.7B for proposals.

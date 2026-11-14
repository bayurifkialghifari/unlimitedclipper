"""Build native model files in CI; the installed application does not run Python."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request
import zipfile

import numpy as np
import onnxruntime as ort
import torch
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCTC, AutoProcessor

DESTINATION = Path(os.environ.get("UC_PACK_DIR", "quality-pack"))
DESTINATION.mkdir(parents=True, exist_ok=True)
torch.manual_seed(0)
torch.set_num_threads(2)
MODELS = [
    ("alignment-id", "cahya/wav2vec2-large-xlsr-indonesian",
     "fe66c9f1114e958d0c08de5dcc7e82bb8001d4a1"),
    ("alignment-en", "facebook/wav2vec2-base-960h",
     "22aad52d435eb6dbaf354bdad9b0da84ce7d6156"),
]
files = []


def record(filename, license_name):
    path = DESTINATION / filename
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    files.append({"filename": filename, "size": path.stat().st_size,
                  "sha256": digest.hexdigest(), "license": license_name})


class CtcModel(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, audio):
        return self.model(audio).logits


for identifier, repository, revision in MODELS:
    processor = AutoProcessor.from_pretrained(repository, revision=revision)
    model = CtcModel(AutoModelForCTC.from_pretrained(repository, revision=revision)).eval()
    filename = identifier + ".onnx"
    example = torch.randn(1, 32000)
    torch.onnx.export(model, example, DESTINATION / filename, opset_version=17,
                      input_names=["audio"], output_names=["logits"],
                      dynamic_axes={"audio": {1: "samples"}, "logits": {1: "frames"}},
                      dynamo=False)
    session = ort.InferenceSession(str(DESTINATION / filename),
                                   providers=["CPUExecutionProvider"])
    errors = []
    for length in [16000, 48000]:
        sample = torch.randn(1, length)
        with torch.no_grad():
            expected = model(sample).numpy()
        actual = session.run(None, {"audio": sample.numpy()})[0]
        np.testing.assert_allclose(actual, expected, rtol=0.002, atol=0.002)
        errors.append(float(np.max(np.abs(actual - expected))))
    vocabulary = processor.tokenizer.get_vocab()
    config = {"vocabulary": vocabulary,
              "blank_id": model.model.config.pad_token_id,
              "normalize": processor.feature_extractor.do_normalize,
              "sample_rate": 16000, "repository": repository, "revision": revision,
              "reference_max_errors": errors}
    config_name = identifier + ".json"
    (DESTINATION / config_name).write_text(json.dumps(config, indent=2), encoding="utf-8")
    license_source = hf_hub_download(repository, "README.md", revision=revision)
    license_name = identifier + "-MODEL-CARD.md"
    shutil.copyfile(license_source, DESTINATION / license_name)
    for name in [filename, config_name, license_name]:
        record(name, "Apache-2.0")
    del session, model

vad_url = ("https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/"
           "src/silero_vad/data/silero_vad.onnx")
with urllib.request.urlopen(vad_url, timeout=30) as response:
    (DESTINATION / "vad.onnx").write_bytes(response.read())
with urllib.request.urlopen("https://raw.githubusercontent.com/snakers4/silero-vad/"
                            "v6.2.3/LICENSE", timeout=30) as response:
    (DESTINATION / "vad-LICENSE.txt").write_bytes(response.read())
record("vad.onnx", "MIT")
record("vad-LICENSE.txt", "MIT")

from speechbrain.lobes.models.ECAPA_TDNN import ECAPA_TDNN

speaker_revision = "0f99f2d0ebe89ac095bcc5903c4dd8f72b367286"
speaker_repository = "speechbrain/spkrec-ecapa-voxceleb"
speaker = ECAPA_TDNN(input_size=80, channels=[1024, 1024, 1024, 1024, 3072],
                    kernel_sizes=[5, 3, 3, 3, 1], dilations=[1, 2, 3, 4, 1],
                    attention_channels=128, lin_neurons=192).eval()
checkpoint = hf_hub_download(speaker_repository, "embedding_model.ckpt",
                             revision=speaker_revision)
speaker.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
torch.onnx.export(speaker, torch.randn(1, 300, 80), DESTINATION / "speaker.onnx",
                  input_names=["features"], output_names=["embedding"], opset_version=17,
                  dynamic_axes={"features": {1: "frames"}}, dynamo=False)
session = ort.InferenceSession(str(DESTINATION / "speaker.onnx"),
                               providers=["CPUExecutionProvider"])
sample = torch.randn(1, 240, 80)
with torch.no_grad():
    reference = speaker(sample).numpy()
np.testing.assert_allclose(session.run(None, {"features": sample.numpy()})[0],
                           reference, rtol=0.002, atol=0.002)
card = hf_hub_download(speaker_repository, "README.md", revision=speaker_revision)
shutil.copyfile(card, DESTINATION / "speaker-MODEL-CARD.md")
record("speaker.onnx", "Apache-2.0")
record("speaker-MODEL-CARD.md", "Apache-2.0")

manifest = {"version": 1, "files": files, "models": MODELS,
            "speaker_revision": speaker_revision, "vad_version": "v6.2.3"}
(DESTINATION / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
with zipfile.ZipFile("quality-pack.zip", "w", compression=zipfile.ZIP_STORED) as archive:
    for file in DESTINATION.iterdir():
        archive.write(file, arcname=file.name)
print(json.dumps(manifest, indent=2))

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path


def inspect_libraries(archive):
    libraries = []
    with zipfile.ZipFile(archive) as bundle:
        for name in bundle.namelist():
            if not name.startswith("lib/") or not name.endswith(".so"):
                continue
            if not name.startswith("lib/arm64-v8a/"):
                raise ValueError("Unexpected APK architecture: " + name)
            data = bundle.read(name)
            if data[:6] != b"\x7fELF\x02\x01" or struct.unpack_from("<H", data, 18)[0] != 183:
                raise ValueError("Expected an ARM64 native library: " + name)
            offset = struct.unpack_from("<Q", data, 32)[0]
            entry_size, count = struct.unpack_from("<HH", data, 54)
            for index in range(count):
                entry = offset + index * entry_size
                kind = struct.unpack_from("<I", data, entry)[0]
                alignment = struct.unpack_from("<Q", data, entry + 48)[0]
                if kind == 1 and alignment < 16384:
                    raise ValueError("APK library lacks 16 KB load alignment: " + name)
            libraries.append(name)
    for required in ["libunlimitedclipper_app.so", "libffmpegkit.so", "libffmpegkit_abidetect.so"]:
        if not any(name.endswith("/" + required) for name in libraries):
            raise ValueError("APK is missing " + required)
    return libraries


def main():
    parser = argparse.ArgumentParser(description="Inspect an ARM64 preview APK without running it.")
    parser.add_argument("--apk-directory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / "resources/android.json").read_text(encoding="utf-8"))
    version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
    archives = list(args.apk_directory.rglob("*.apk"))
    if len(archives) != 1:
        raise ValueError("Expected exactly one ARM64 preview APK, found " + str(len(archives)))
    archive = archives[0]
    libraries = inspect_libraries(archive)
    sdk = Path(os.environ.get("ANDROID_HOME") or root / ".tools/android/sdk")
    build_tools = sdk / "build-tools/36.0.0"
    executable = ".exe" if os.name == "nt" else ""
    metadata = subprocess.check_output(
        [str(build_tools / ("aapt2" + executable)), "dump", "badging", str(archive)], text=True
    )
    if "package: name='app.unlimitedclipper.studio'" not in metadata:
        raise ValueError("Unexpected Android application identifier.")
    for label, expected in [("sdkVersion", manifest["min_sdk"]), ("targetSdkVersion", manifest["target_sdk"])]:
        value = re.search(label + r":'(\d+)'", metadata)
        if not value or int(value.group(1)) != expected:
            raise ValueError("APK SDK requirement does not match " + label)
    signature = subprocess.check_output(
        [str(build_tools / ("apksigner.bat" if os.name == "nt" else "apksigner")),
         "verify", "--verbose", "--print-certs", str(archive)], text=True
    )
    subprocess.run(
        [str(build_tools / ("zipalign" + executable)), "-c", "-P", "16", "4", str(archive)], check=True
    )
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    delivered = output / ("UnlimitedClipper-" + version + "-android-arm64-preview.apk")
    shutil.copy2(archive, delivered)
    evidence = {
        "apk": delivered.name,
        "version": version,
        "source_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True
        ).strip(),
        "sha256": hashlib.sha256(delivered.read_bytes()).hexdigest(),
        "size_bytes": delivered.stat().st_size,
        "min_sdk": manifest["min_sdk"],
        "target_sdk": manifest["target_sdk"],
        "abis": ["arm64-v8a"],
        "libraries": libraries,
        "signed": True,
        "distribution": "debug-signed experimental preview",
        "runtime_tested": False,
    }
    (output / "build-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    (output / "package-metadata.txt").write_text(metadata, encoding="utf-8")
    (output / "signature.txt").write_text(signature, encoding="utf-8")
    shutil.copy2(root / "docs/android.md", output / "ANDROID-UNTESTED.md")
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path


def validate_archive(archive, abis):
    machines = {"arm64-v8a": 183, "x86_64": 62}
    libraries = []
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        if "classes.jar" not in names:
            raise ValueError("The Android archive contains no Kotlin/Java API.")
        for abi in abis:
            prefix = "jni/" + abi + "/"
            matching = [name for name in names if name.startswith(prefix) and name.endswith(".so")]
            if not any(name.endswith("/libffmpegkit.so") for name in matching):
                raise ValueError("FFmpeg native execution is missing for " + abi)
            for name in matching:
                data = bundle.read(name)
                if len(data) < 64 or data[:6] != b"\x7fELF\x02\x01":
                    raise ValueError("Expected a little-endian 64-bit ELF library: " + name)
                machine = struct.unpack_from("<H", data, 18)[0]
                if machine != machines[abi]:
                    raise ValueError("Native architecture mismatch: " + name)
                offset = struct.unpack_from("<Q", data, 32)[0]
                entry_size, count = struct.unpack_from("<HH", data, 54)
                for index in range(count):
                    entry = offset + index * entry_size
                    program_type = struct.unpack_from("<I", data, entry)[0]
                    alignment = struct.unpack_from("<Q", data, entry + 48)[0]
                    if program_type == 1 and alignment < 16384:
                        raise ValueError("Native library lacks 16 KB load alignment: " + name)
                libraries.append(name)
    return libraries


def main():
    parser = argparse.ArgumentParser(description="Build the pinned Android media library.")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--validate-only", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    manifest = json.loads((root / "resources/android.json").read_text(encoding="utf-8"))
    media = manifest["media"]
    if media["gpl"]:
        raise ValueError("The current Android integration requires the LGPL media configuration.")
    if args.validate_only:
        print(json.dumps(validate_archive(args.validate_only, manifest["abis"])))
        return
    source = args.source.resolve(strict=True)
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=source, text=True
    ).strip()
    if revision != media["commit"]:
        raise ValueError("Android media source does not match the pinned commit.")
    sdk = Path(os.environ["ANDROID_SDK_ROOT"])
    env = os.environ.copy()
    env["ANDROID_NDK_ROOT"] = str(sdk / "ndk" / manifest["ndk_version"])
    arguments = [
        "bash",
        "android.sh",
        "--jobs=2",
        "--api-level=" + str(media["native_api"]),
        "--arch=" + ",".join(manifest["abis"]),
    ]
    for library in media["libraries"]:
        arguments.append("--enable-lib-" + library)
    subprocess.run(arguments, cwd=source, env=env, check=True)
    archives = list((source / "prebuilt").rglob("ffmpeg-kit-next-" + media["version"] + ".aar"))
    if len(archives) != 1:
        raise ValueError("Expected exactly one native Android archive.")
    archive = archives[0]
    libraries = validate_archive(archive, manifest["abis"])
    output = args.output.resolve()
    artifact = output / "maven/com/arthenica/ffmpeg-kit-next" / media["version"]
    artifact.mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive, artifact / archive.name)
    shutil.copy2(archive.with_suffix(".pom"), artifact / archive.with_suffix(".pom").name)
    for name in ["LICENSE", "README.md"]:
        shutil.copy2(source / name, output / name)
    evidence = {
        "repository": media["repository"],
        "commit": revision,
        "version": media["version"],
        "abis": manifest["abis"],
        "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "libraries": libraries,
        "runtime_tested": False,
    }
    (output / "build-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()

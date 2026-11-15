import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { root } from './cargo.mjs';

const platform = process.argv.find((value) => value.startsWith('--platform='))?.slice(11);
const variants = {
  'linux-x64': [
    [
      'yt-dlp',
      'yt-dlp/yt-dlp',
      '2026.10.26',
      'yt-dlp_linux',
      '767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795',
    ],
    [
      'deno',
      'denoland/deno',
      'v2.9.8',
      'deno-x86_64-unknown-linux-gnu.zip',
      'e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609',
    ],
    [
      'ffmpeg',
      'FFmpeg-Builds/FFmpeg-Builds',
      'autobuild-2026-11-12-15-40',
      'ffmpeg-n8.1.3-35-gf1acb0a266-linux64-gpl-8.1.tar.xz',
      '320c1f97653ad0740343f87abe2303656b85eb119c3f06abcb639837e9beaed3',
    ],
    [
      'whisper',
      'ggml-org/whisper.cpp',
      'b5454',
      'whisper-bin-ubuntu-x64.tar.gz',
      'a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c',
    ],
    [
      'llama',
      'ggml-org/llama.cpp',
      'b12420',
      'llama-b12420-bin-ubuntu-x64.tar.gz',
      '68499631ccab30d2b8fc1ada8903e80e340be7516480d7ceb6f1571ef7412217',
    ],
    [
      'onnxruntime',
      'microsoft/onnxruntime',
      'v1.32.0',
      'onnxruntime-linux-x64-1.32.0.tgz',
      'bb169b7e374731730d2ae406fb39de7be4b315f413a9132efe896261c31bb503',
    ],
  ],
  'linux-arm64': [
    [
      'yt-dlp',
      'yt-dlp/yt-dlp',
      '2026.10.26',
      'yt-dlp_linux_aarch64',
      'e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483',
    ],
    [
      'deno',
      'denoland/deno',
      'v2.9.8',
      'deno-aarch64-unknown-linux-gnu.zip',
      'd49596c20b9788cf8f5d8ddf644103d4bde56ed239753f0bdb92ba9361d51905',
    ],
    [
      'ffmpeg',
      'FFmpeg-Builds/FFmpeg-Builds',
      'autobuild-2026-11-12-15-40',
      'ffmpeg-n8.1.3-35-gf1acb0a266-linuxarm64-gpl-8.1.tar.xz',
      '50c5f6f9fd6fb84e7c7f6cb99675b16b50973703a7cd55b2f3d0a431ec6b5e6d',
    ],
    [
      'whisper',
      'ggml-org/whisper.cpp',
      'b5454',
      'whisper-bin-ubuntu-arm64.tar.gz',
      '6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149',
    ],
    [
      'llama',
      'ggml-org/llama.cpp',
      'b12420',
      'llama-b12420-bin-ubuntu-arm64.tar.gz',
      '0811385717107f90deeca50e9671a3c82c9dff4514a9a605bb9841f913bfcb6f',
    ],
    [
      'onnxruntime',
      'microsoft/onnxruntime',
      'v1.32.0',
      'onnxruntime-linux-aarch64-1.32.0.tgz',
      '81a46251dd90da4122f4b9ceb4433f836fbc79ee1eddffca7c09033af81a1939',
    ],
  ],
  'macos-x64': [
    [
      'yt-dlp',
      'yt-dlp/yt-dlp',
      '2026.10.26',
      'yt-dlp_macos',
      '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa',
    ],
    [
      'deno',
      'denoland/deno',
      'v2.9.8',
      'deno-x86_64-apple-darwin.zip',
      '4b2f5edd2639b7470f034238b321d7002d8dfb4726d8558f52c17afac370eb2c',
    ],
    [
      'ffmpeg',
      'jellyfin/jellyfin-ffmpeg',
      'v8.1.3-2',
      'jellyfin-ffmpeg_8.1.3-2_portable_mac64-gpl.tar.xz',
      'd394180f1155f84857544a48a99869f5741ccc50c5a1f73d2797429a2b326448',
    ],
    [
      'llama',
      'ggml-org/llama.cpp',
      'b12420',
      'llama-b12420-bin-macos-x64.tar.gz',
      '8bfd2a32644feae37a7b03daae5bf253b6bde626823b1fbc6e575e7889a6b3ef',
    ],
  ],
  'macos-arm64': [
    [
      'yt-dlp',
      'yt-dlp/yt-dlp',
      '2026.10.26',
      'yt-dlp_macos',
      '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa',
    ],
    [
      'deno',
      'denoland/deno',
      'v2.9.8',
      'deno-aarch64-apple-darwin.zip',
      '9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e',
    ],
    [
      'ffmpeg',
      'jellyfin/jellyfin-ffmpeg',
      'v8.1.3-2',
      'jellyfin-ffmpeg_8.1.3-2_portable_macarm64-gpl.tar.xz',
      'd898cc819e7c4e9219d6410ddbdaada0838f14bec6ff89e283639915394cb43f',
    ],
    [
      'llama',
      'ggml-org/llama.cpp',
      'b12420',
      'llama-b12420-bin-macos-arm64.tar.gz',
      '1b9e418c21f9a32488de140d447bc4d791a09303b56c584102d9e855dbd85e4b',
    ],
    [
      'onnxruntime',
      'microsoft/onnxruntime',
      'v1.32.0',
      'onnxruntime-osx-arm64-1.32.0.tgz',
      '8ddca23f532b9d4fbb279ba9b08dab6c0ac94fdc9aec2eb44a1db7049216c043',
    ],
  ],
};

if (!platform || !Object.hasOwn(variants, platform)) {
  throw new Error('Choose linux-x64, linux-arm64, macos-x64, or macos-arm64.');
}
if (process.platform === 'win32') {
  throw new Error('Unix toolchains must be staged on their native CI runner.');
}
const expectedSystem = platform.startsWith('macos') ? 'darwin' : 'linux';
const expectedArchitecture = platform.endsWith('arm64') ? 'arm64' : 'x64';
if (process.platform !== expectedSystem || process.arch !== expectedArchitecture) {
  throw new Error('The native runner does not match the selected toolchain.');
}

const destination = path.join(root, '.tools', platform);
const cache = path.join(root, '.cache/unix-tools', platform);
await mkdir(destination, { recursive: true });
await mkdir(cache, { recursive: true });

const noticeFiles = {
  'yt-dlp': [
    [
      'LICENSE.txt',
      'https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.10.26/LICENSE',
      '7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c',
    ],
  ],
  deno: [
    [
      'LICENSE.md',
      'https://raw.githubusercontent.com/denoland/deno/v2.9.8/LICENSE.md',
      'f62497fffecc0852960c8d3e6934b9db86d16396e9b604072e923892cae3a588',
    ],
  ],
  ffmpeg: [
    [
      'COPYING.GPLv3',
      platform.startsWith('macos')
        ? 'https://raw.githubusercontent.com/jellyfin/jellyfin-ffmpeg/v8.1.3-2/COPYING.GPLv3'
        : 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/f1acb0a266/COPYING.GPLv3',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
    ],
  ],
  whisper: [
    [
      'LICENSE.txt',
      platform.startsWith('macos')
        ? 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/d1be6fde11ac6e0407606b4e42fe72d34add8037/LICENSE'
        : 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/b5454/LICENSE',
      '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d',
    ],
  ],
  llama: [
    [
      'LICENSE.txt',
      'https://raw.githubusercontent.com/ggml-org/llama.cpp/b12420/LICENSE',
      '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d',
    ],
  ],
  onnxruntime: [
    [
      'LICENSE.txt',
      'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.32.0/LICENSE',
      '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c',
    ],
    [
      'ThirdPartyNotices.txt',
      'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.32.0/ThirdPartyNotices.txt',
      'd8696258afcf9df7827a5e01d6b6d55ee9b461b4e82020f5f48242deb9cc2270',
    ],
  ],
};

function run(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      command + ' failed: ' + (result.stderr || result.stdout || result.error?.message),
    );
  }
  return result.stdout;
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function download(spec) {
  const [family, repo, version, name, digest] = spec;
  const filename = path.join(cache, name);
  const valid = await stat(filename)
    .then(async () => (await sha256(filename)) === digest)
    .catch(() => false);
  if (!valid) {
    const url = 'https://github.com/' + repo + '/releases/download/' + version + '/' + name;
    const response = await fetch(url, { headers: { 'User-Agent': 'UnlimitedClipper-Toolchain' } });
    if (!response.ok || !response.body) {
      throw new Error(family + ' download failed: ' + response.status);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(filename));
  }
  if ((await sha256(filename)) !== digest) {
    throw new Error(family + ' archive checksum mismatch.');
  }
  return filename;
}

async function stageNotices(family) {
  const directory = path.join(destination, 'licenses-and-source', family);
  await mkdir(directory, { recursive: true });
  for (const [name, url, digest] of noticeFiles[family]) {
    const filename = path.join(cache, family + '-' + name);
    const valid = await stat(filename)
      .then(async () => (await sha256(filename)) === digest)
      .catch(() => false);
    if (!valid) {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'UnlimitedClipper-Toolchain' },
      });
      if (!response.ok || !response.body) {
        throw new Error(family + ' notice download failed: ' + response.status);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(filename));
    }
    if ((await sha256(filename)) !== digest) {
      throw new Error(family + ' notice checksum mismatch: ' + name);
    }
    await copyFile(filename, path.join(directory, name));
  }
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(location)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(location);
    }
  }
  return files;
}

async function stageArchive(spec, archive) {
  const [family, , , name] = spec;
  const output = path.join(destination, family);
  await mkdir(output, { recursive: true });
  if (!name.includes('.')) {
    await copyFile(archive, path.join(output, family));
    await chmod(path.join(output, family), 0o755);
    return;
  }
  const extracted = path.join(cache, family);
  await mkdir(extracted, { recursive: true });
  if (name.endsWith('.zip')) {
    run('unzip', ['-q', '-o', archive, '-d', extracted]);
  } else {
    run('tar', ['-xf', archive, '-C', extracted]);
  }
  const required = {
    deno: ['deno'],
    ffmpeg: ['ffmpeg', 'ffprobe'],
    whisper: ['whisper-cli'],
    llama: ['llama-cli', 'llama-completion', 'llama-server'],
    onnxruntime: [platform.startsWith('macos') ? 'libonnxruntime.dylib' : 'libonnxruntime.so'],
  }[family];
  const candidates = await filesUnder(extracted);
  for (const basename of required) {
    const source = candidates.find((candidate) => path.basename(candidate) === basename);
    if (!source) {
      throw new Error(family + ' archive is missing ' + basename);
    }
    await copyFile(source, path.join(output, basename));
    if (!basename.startsWith('lib')) {
      await chmod(path.join(output, basename), 0o755);
    }
  }
  for (const source of candidates) {
    const basename = path.basename(source);
    if (/^lib.+(\.dylib|\.so(?:\.[0-9.]+)?)$/.test(basename) && !required.includes(basename)) {
      await copyFile(source, path.join(output, basename));
    }
    if (/^(LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT)(?:[._-].*)?$/i.test(basename)) {
      const notice = path.join(
        destination,
        'licenses-and-source',
        family,
        path.relative(extracted, source),
      );
      await mkdir(path.dirname(notice), { recursive: true });
      await copyFile(source, notice);
    }
  }
}

for (const spec of variants[platform]) {
  await stageArchive(spec, await download(spec));
  await stageNotices(spec[0]);
}
if (platform.startsWith('macos')) {
  await stageNotices('whisper');
}
if (platform === 'macos-x64') {
  await stageNotices('onnxruntime');
}

const ffmpegSource = platform.startsWith('macos')
  ? {
      source:
        'https://github.com/jellyfin/jellyfin-ffmpeg/tree/7250de8375a4959ac1c25c139ce9789fdac199fb',
      build: 'https://github.com/jellyfin/jellyfin-ffmpeg/releases/tag/v8.1.3-2',
    }
  : {
      source: 'https://github.com/FFmpeg/FFmpeg/tree/f1acb0a266',
      build:
        'https://github.com/FFmpeg-Builds/FFmpeg-Builds/tree/c9fe5114060e507409f7ee07edfd82efaf25d767',
    };
const provenance = variants[platform].map(([family, repository, version, asset, sha256]) => ({
  family,
  binary: 'https://github.com/' + repository + '/releases/download/' + version + '/' + asset,
  sha256,
  ...(family === 'ffmpeg'
    ? ffmpegSource
    : {
        source:
          family === 'whisper' && platform.startsWith('macos')
            ? 'https://github.com/ggml-org/whisper.cpp/tree/d1be6fde11ac6e0407606b4e42fe72d34add8037'
            : 'https://github.com/' + repository + '/tree/' + version,
      }),
}));
if (platform.startsWith('macos')) {
  provenance.push({
    family: 'whisper',
    source: 'https://github.com/ggml-org/whisper.cpp/tree/d1be6fde11ac6e0407606b4e42fe72d34add8037',
    build: 'scripts/build-macos-tools.mjs',
  });
}
if (platform === 'macos-x64') {
  provenance.push({
    family: 'onnxruntime',
    source:
      'https://github.com/microsoft/onnxruntime/tree/fab30a46491a40f5e4c968b80e8a59acbbb91b53',
    build: 'scripts/build-macos-tools.mjs',
  });
}
await writeFile(
  path.join(destination, 'licenses-and-source', 'tool-provenance.json'),
  JSON.stringify({ platform, tools: provenance }, null, 2) + String.fromCharCode(10),
);

if (platform.startsWith('macos')) {
  run('node', [path.join(root, 'scripts/build-macos-tools.mjs'), '--platform=' + platform]);
}

run('node', [path.join(root, 'scripts/setup-assets.mjs'), '--platform=' + platform]);

for (const [family, binary, arguments_] of [
  ['ffmpeg', 'ffmpeg', ['-version']],
  ['ffmpeg', 'ffprobe', ['-version']],
  ['yt-dlp', 'yt-dlp', ['--version']],
  ['deno', 'deno', ['--version']],
  ['whisper', 'whisper-cli', ['--help']],
  ['llama', 'llama-completion', ['--version']],
  ['llama', 'llama-server', ['--version']],
]) {
  run(path.join(destination, family, binary), arguments_);
}

const filters = run(path.join(destination, 'ffmpeg/ffmpeg'), ['-filters']);
const encoders = run(path.join(destination, 'ffmpeg/ffmpeg'), ['-encoders']);
if (!filters.includes('subtitles') || !encoders.includes('libx264')) {
  throw new Error('The packaged FFmpeg needs libass subtitles and libx264 encoding.');
}
await writeFile(
  path.join(destination, 'licenses-and-source', 'ffmpeg', 'build-configuration.txt'),
  run(path.join(destination, 'ffmpeg/ffmpeg'), ['-buildconf']),
);
if (!(await stat(path.join(destination, 'yunet.onnx'))).isFile()) {
  throw new Error('The face detector is missing from the packaged resources.');
}

process.stdout.write('Verified native toolchain: ' + platform + '\n');

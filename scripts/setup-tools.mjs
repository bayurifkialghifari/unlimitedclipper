import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { root } from './cargo.mjs';

const selectedArch = process.argv.find((value) => value.startsWith('--arch='))?.split('=')[1];
const selectedFamily = process.argv.find((value) => value.startsWith('--family='))?.split('=')[1];
const nativeArm =
  process.platform === 'win32'
    ? execFileSync(
        'powershell',
        ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor).Architecture'],
        { encoding: 'utf8', windowsHide: true },
      ).trim() === '12'
    : os.machine().toLowerCase().includes('arm');
const arch = selectedArch ?? (nativeArm ? 'arm64' : 'x64');
const platform = 'windows-' + arch;
const destination = path.join(root, '.tools', platform);
const cache = path.join(root, '.cache/downloads');
const manifestPath = path.join(root, 'resources/toolchains.json');
const headers = {
  'User-Agent': 'UnlimitedClipper-Toolchain',
  Accept: 'application/vnd.github+json',
};

if (process.platform !== 'win32' || !['arm64', 'x64'].includes(arch)) {
  throw new Error('This release supports Windows ARM64 and x64 toolchains.');
}

await mkdir(destination, { recursive: true });
await mkdir(cache, { recursive: true });

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Metadata request failed: ' + response.status + ' ' + url);
  }
  return response.json();
}

async function releaseAsset(repo, matches) {
  const releases = await json('https://api.github.com/repos/' + repo + '/releases?per_page=6');
  for (const release of releases) {
    if (release.tag_name === 'latest') {
      continue;
    }
    const asset = release.assets.find((candidate) => matches(candidate.name));
    if (asset) {
      return {
        repo,
        version: release.tag_name,
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: asset.digest?.replace('sha256:', '') ?? null,
      };
    }
  }
  throw new Error('No matching native artifact found for ' + repo);
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function download(spec) {
  const filename = path.join(cache, platform + '-' + spec.name);
  if (!existsSync(filename) || (spec.sha256 && (await hashFile(filename)) !== spec.sha256)) {
    process.stdout.write('Downloading ' + spec.name + '\n');
    const response = await fetch(spec.url, { headers });
    if (!response.ok || !response.body) {
      throw new Error('Download failed: ' + spec.name + ' (' + response.status + ')');
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(filename));
  }
  const actual = await hashFile(filename);
  if (spec.sha256 && actual !== spec.sha256) {
    throw new Error('Checksum mismatch: ' + spec.name);
  }
  spec.sha256 = actual;
  return filename;
}

async function unpack(filename, directory) {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'scripts/extract.ps1'),
        filename,
        directory,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Archive extraction failed: ' + filename));
      }
    });
  });
}

async function flatten(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await flatten(source, output);
    } else if (/\.(exe|dll)$/i.test(entry.name) && path.dirname(source) !== output) {
      await copyFile(source, path.join(output, entry.name));
    }
  }
}

let manifests = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
let specs = manifests[platform];

if (!specs || process.argv.includes('--refresh')) {
  const ffmpegArch = arch === 'arm64' ? 'winarm64' : 'win64';
  specs = await Promise.all([
    releaseAsset(
      'yt-dlp/yt-dlp',
      (name) => name === (arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe'),
    ),
    releaseAsset(
      'denoland/deno',
      (name) =>
        name === 'deno-' + (arch === 'arm64' ? 'aarch64' : 'x86_64') + '-pc-windows-msvc.zip',
    ),
    releaseAsset('FFmpeg-Builds/FFmpeg-Builds', (name) =>
      name.includes(ffmpegArch + '-gpl-8.1.zip'),
    ),
    releaseAsset(
      'ggml-org/whisper.cpp',
      (name) =>
        name === (arch === 'arm64' ? 'whisper-bin-win-cpu-arm64.zip' : 'whisper-bin-x64.zip'),
    ),
    releaseAsset('ggml-org/llama.cpp', (name) => name.endsWith('-bin-win-cpu-' + arch + '.zip')),
    releaseAsset(
      'microsoft/onnxruntime',
      (name) =>
        /^onnxruntime-win-(arm64|x64)-[\d.]+\.zip$/.test(name) &&
        name.includes('win-' + arch + '-'),
    ),
  ]);
}

for (const spec of specs) {
  if (selectedFamily && !spec.repo.toLowerCase().includes(selectedFamily.toLowerCase())) {
    continue;
  }
  const archive = await download(spec);
  const family = spec.repo.split('/')[1].toLowerCase().replace('.cpp', '').replace('-builds', '');
  const toolDirectory = path.join(destination, family);
  await mkdir(toolDirectory, { recursive: true });
  if (spec.name.endsWith('.exe')) {
    await copyFile(archive, path.join(toolDirectory, 'yt-dlp.exe'));
  } else {
    const unpacked = path.join(destination, 'licenses-and-source', spec.repo.split('/')[1]);
    await unpack(archive, unpacked);
    await flatten(unpacked, toolDirectory);
  }
}

if (!selectedFamily) {
  execFileSync(process.execPath, [path.join(root, 'scripts/setup-assets.mjs'), '--arch=' + arch], {
    stdio: 'inherit',
    windowsHide: true,
  });
}
const latestManifests = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : {};
manifests = { ...latestManifests, [platform]: specs };
await writeFile(manifestPath, JSON.stringify(manifests, null, 2) + '\n');
await writeFile(
  path.join(destination, 'manifest.json'),
  JSON.stringify({ platform, tools: specs }, null, 2),
);
process.stdout.write('Native toolchain ready: ' + destination + '\n');

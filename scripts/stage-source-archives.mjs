import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { root } from './cargo.mjs';

const sources = [
  {
    filename: 'ffmpeg-core-f1acb0a266-source.tar.gz',
    revision: 'f1acb0a2666c78d92688f4c3d2803a132f5590f6',
    url: 'https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/f1acb0a2666c78d92688f4c3d2803a132f5590f6',
    sha256: '3d9e59cb878618b9a334d2ce752fa6d9c6896bff39947bc3c3d299e63088f68d',
    covers: ['ffmpeg'],
    platforms: ['windows-arm64', 'windows-x64', 'linux-arm64', 'linux-x64'],
  },
  {
    filename: 'ffmpeg-linux-build-c9fe511-source.tar.gz',
    revision: 'c9fe5114060e507409f7ee07edfd82efaf25d767',
    url: 'https://codeload.github.com/FFmpeg-Builds/FFmpeg-Builds/tar.gz/c9fe5114060e507409f7ee07edfd82efaf25d767',
    sha256: 'fb708487f587ffbf6c80c8d34fe0f96f7da8a1f88b8b6b5d1b27d91715fa2595',
    covers: ['ffmpeg-build-scripts'],
    platforms: ['windows-arm64', 'windows-x64', 'linux-arm64', 'linux-x64'],
  },
  {
    filename: 'ffmpeg-macos-7250de8-source.tar.gz',
    revision: '7250de8375a4959ac1c25c139ce9789fdac199fb',
    url: 'https://codeload.github.com/jellyfin/jellyfin-ffmpeg/tar.gz/7250de8375a4959ac1c25c139ce9789fdac199fb',
    sha256: '7367430190d99cd756470e24d9cb5f64e1f60977d226c3cbcf41c79151e20ab9',
    covers: ['ffmpeg', 'ffmpeg-macos-build'],
    platforms: ['macos-arm64', 'macos-x64'],
  },
  {
    filename: 'android-media-9f04bf1-source.tar.gz',
    revision: '9f04bf1e3c97def70b98e198cb80a57b43ef5b45',
    url: 'https://codeload.github.com/arthenica/ffmpeg-kit-next/tar.gz/9f04bf1e3c97def70b98e198cb80a57b43ef5b45',
    sha256: 'cac8fd7edad24da9c10ce5c8ae5143b1e16a3216debee992de9d0f390ea6447c',
    covers: ['ffmpeg-kit-next'],
    platforms: ['android-arm64'],
  },
];

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

const output = path.join(root, '.cache/release-files');
await mkdir(output, { recursive: true });
for (const source of sources) {
  const destination = path.join(output, source.filename);
  const valid = await stat(destination)
    .then(async () => (await sha256(destination)) === source.sha256)
    .catch(() => false);
  if (!valid) {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'UnlimitedClipper-Source-Archive' },
    });
    if (!response.ok || !response.body) {
      throw new Error('Cannot download ' + source.filename + ': ' + response.status);
    }
    const temporary = destination + '.part';
    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      if ((await sha256(temporary)) !== source.sha256) {
        throw new Error('Source archive checksum mismatch: ' + source.filename);
      }
      await rm(destination, { force: true });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  if ((await sha256(destination)) !== source.sha256) {
    throw new Error('Source archive checksum mismatch: ' + source.filename);
  }
}
await writeFile(
  path.join(output, 'source-archives.json'),
  JSON.stringify({ sources }, null, 2) + String.fromCharCode(10),
);
process.stdout.write('Verified media source archives: ' + sources.length + String.fromCharCode(10));

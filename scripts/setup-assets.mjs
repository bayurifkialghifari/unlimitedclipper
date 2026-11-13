import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const manifestPath = path.join(root, 'resources/assets.json');
const headers = { 'User-Agent': 'UnlimitedClipper-Assets' };
const architecture = process.argv.find((argument) => argument.startsWith('--arch='))?.slice(7);

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Asset metadata request failed: ' + response.status);
  }
  return response.json();
}

let assets;
if (process.argv.includes('--refresh')) {
  assets = [];
  const fonts = await json('https://api.github.com/repos/google/fonts/commits/main');
  for (const family of [
    'notosans',
    'dmsans',
    'oswald',
    'notosansarabic',
    'notosansthai',
    'notosansdevanagari',
  ]) {
    const files = await json(
      'https://api.github.com/repos/google/fonts/contents/ofl/' + family + '?ref=' + fonts.sha,
    );
    for (const file of files) {
      if (file.name.endsWith('.ttf') || file.name === 'OFL.txt') {
        assets.push({
          path: 'fonts/' + family + '-' + file.name,
          url: file.download_url,
          license: 'OFL-1.1',
          revision: fonts.sha,
        });
      }
    }
  }
  const cjk = await json('https://api.github.com/repos/notofonts/noto-cjk/commits/main');
  for (const [source, target] of [
    ['Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf', 'fonts/NotoSansCJKsc-Regular.otf'],
    ['Sans/LICENSE', 'fonts/noto-cjk-LICENSE.txt'],
  ]) {
    assets.push({
      path: target,
      url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/' + cjk.sha + '/' + source,
      license: 'OFL-1.1',
      revision: cjk.sha,
    });
  }
  const detector = await json('https://api.github.com/repos/opencv/opencv_zoo/commits/main');
  assets.push({
    path: 'yunet.onnx',
    url:
      'https://media.githubusercontent.com/media/opencv/opencv_zoo/' +
      detector.sha +
      '/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
    license: 'MIT',
    revision: detector.sha,
  });
  assets.push({
    path: 'licenses-and-source/yunet-LICENSE.txt',
    url:
      'https://raw.githubusercontent.com/opencv/opencv_zoo/' +
      detector.sha +
      '/models/face_detection_yunet/LICENSE',
    license: 'MIT',
    revision: detector.sha,
  });
} else {
  assets = JSON.parse(await readFile(manifestPath, 'utf8'));
}

for (const asset of assets) {
  const cached = path.join(root, '.cache/assets', asset.path);
  let bytes = existsSync(cached) ? await readFile(cached) : undefined;
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  if (!bytes || (asset.sha256 && hash(bytes) !== asset.sha256)) {
    const response = await fetch(asset.url, { headers });
    if (!response.ok) {
      throw new Error('Asset download failed: ' + asset.path + ' (' + response.status + ')');
    }
    bytes = Buffer.from(await response.arrayBuffer());
    if (asset.sha256 && hash(bytes) !== asset.sha256) {
      throw new Error('Asset checksum mismatch: ' + asset.path);
    }
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, bytes);
  }
  asset.sha256 = hash(bytes);
  asset.size = bytes.length;
  for (const target of architecture ? [architecture] : ['arm64', 'x64']) {
    if (!['arm64', 'x64'].includes(target)) {
      throw new Error('Choose arm64 or x64.');
    }
    const destination = path.join(root, '.tools/windows-' + target, asset.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(cached, destination);
  }
}
await writeFile(manifestPath, JSON.stringify(assets, null, 2) + String.fromCharCode(10));
process.stdout.write(
  'Pinned fonts and face detector verified: ' +
    assets.length +
    ' assets.' +
    String.fromCharCode(10),
);

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

const inputs = [
  ['jfk.wav', 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav'],
  [
    'astronaut.png',
    'https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png',
  ],
];
await mkdir(fixtureDirectory, { recursive: true });
const manifest = [];
for (const [filename, url] of inputs) {
  const destination = path.join(fixtureDirectory, filename);
  let bytes = await readFile(destination).catch(() => null);
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error('Fixture download failed: ' + response.status + ' ' + url);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, bytes);
  }
  manifest.push({ filename, url, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
execFileSync(
  path.join(toolDirectory, 'ffmpeg', executable),
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    path.join(fixtureDirectory, 'astronaut.png'),
    '-i',
    path.join(fixtureDirectory, 'jfk.wav'),
    '-vf',
    'scale=640:640,setsar=1',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    path.join(fixtureDirectory, 'speech-face.mp4'),
  ],
  { windowsHide: true, stdio: 'inherit', timeout: 60_000 },
);
await writeFile(path.join(fixtureDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
process.stdout.write('Generated speech-face.mp4 in ' + fixtureDirectory + '\n');

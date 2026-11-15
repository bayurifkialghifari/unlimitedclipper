import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const platform = process.env.UC_RELEASE_PLATFORM;
const target = process.env.CARGO_BUILD_TARGET;
const version = process.env.GITHUB_REF_NAME?.replace(/^v/, '');
if (!platform || !target || !version || !/^(macos|linux)-(x64|arm64)$/.test(platform)) {
  throw new Error('A tagged Unix platform and Cargo target are required.');
}

const bundleKind = platform.startsWith('macos') ? 'dmg' : 'appimage';
const suffix = platform.startsWith('macos') ? '.dmg' : '.AppImage';
const directory = path.join(root, 'target', target, 'release/bundle', bundleKind);
const candidates = (await readdir(directory)).filter((name) => name.endsWith(suffix));
if (candidates.length !== 1) {
  throw new Error('Expected exactly one native ' + platform + ' bundle.');
}

const output = path.join(root, '.cache/release-files');
await mkdir(output, { recursive: true });
const filename = 'UnlimitedClipper-' + version + '-' + platform + suffix;
const artifact = path.join(output, filename);
await copyFile(path.join(directory, candidates[0]), artifact);

const hash = createHash('sha256');
for await (const chunk of createReadStream(artifact)) {
  hash.update(chunk);
}
await writeFile(
  path.join(output, 'package-' + platform + '.json'),
  JSON.stringify(
    {
      version,
      platform,
      filename,
      bytes: (await stat(artifact)).size,
      sha256: hash.digest('hex'),
      runtime_tested: false,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write('Staged ' + filename + '\n');

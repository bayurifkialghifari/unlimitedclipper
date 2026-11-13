import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './cargo.mjs';

const option = (name) =>
  process.argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const kind = option('kind') ?? 'components';
const version = option('version');
const platform = option('platform');
const file = option('file');
const url = option('url');
const key = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (
  !version ||
  !platform ||
  !file ||
  !url ||
  !key ||
  !['components', 'application'].includes(kind)
) {
  throw new Error(
    'Provide --kind, --version, --platform, --file, --url and TAURI_SIGNING_PRIVATE_KEY_PATH.',
  );
}
const parsed = new URL(url);
if (
  parsed.protocol !== 'https:' &&
  !(process.argv.includes('--development') && parsed.hostname === '127.0.0.1')
) {
  throw new Error('Release artifact URLs require HTTPS.');
}
if (!['windows-arm64', 'windows-x64'].includes(platform)) {
  throw new Error('Choose windows-arm64 or windows-x64.');
}
const output = path.resolve(option('out') ?? path.join(root, '.cache/releases'));
await mkdir(output, { recursive: true });
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
function sign(filename, bindVersion = false) {
  const args = [cli, 'signer', 'sign', '-f', path.resolve(key)];
  if (bindVersion) {
    args.push('--app-version', version);
  }
  args.push(filename);
  execFileSync(process.execPath, args, { stdio: 'ignore', windowsHide: true });
}
const artifact = path.resolve(file);
const hash = createHash('sha256');
for await (const chunk of createReadStream(artifact)) {
  hash.update(chunk);
}
if (kind === 'components') {
  const manifest = JSON.stringify({
    version,
    platforms: {
      [platform]: { url, size: (await stat(artifact)).size, sha256: hash.digest('hex') },
    },
  });
  const filename = path.join(output, 'components-manifest.json');
  await writeFile(filename, manifest);
  sign(filename);
  const signature = Buffer.from(
    (await readFile(filename + '.sig', 'utf8')).trim(),
    'base64',
  ).toString('utf8');
  await writeFile(
    path.join(output, 'components.json'),
    JSON.stringify({ manifest, signature }, null, 2) + '\n',
  );
} else {
  sign(artifact, true);
  const signature = (await readFile(artifact + '.sig', 'utf8')).trim();
  const target = platform === 'windows-arm64' ? 'windows-aarch64' : 'windows-x86_64';
  await writeFile(
    path.join(output, 'application.json'),
    JSON.stringify(
      { version, pub_date: new Date().toISOString(), platforms: { [target]: { url, signature } } },
      null,
      2,
    ) + '\n',
  );
}
process.stdout.write('Signed ' + kind + ' manifest written to ' + output + '\n');

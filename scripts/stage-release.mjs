import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const directory = path.join(root, '.cache/release-files');
await mkdir(directory, { recursive: true });
const version = process.env.GITHUB_REF_NAME?.replace(/^v/, '');
if (!version) {
  throw new Error('A release tag is required.');
}
if (process.argv.includes('--publish')) {
  const platforms = {};
  for (const architecture of ['arm64', 'x64']) {
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'application-windows-' + architecture + '.json'), 'utf8'),
    );
    if (manifest.version !== version) {
      throw new Error('The release contains an artifact for another version.');
    }
    Object.assign(platforms, manifest.platforms);
  }
  await writeFile(
    path.join(directory, 'application.json'),
    JSON.stringify({ version, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n',
  );
  const files = (await readdir(directory)).map((name) => path.join(directory, name));
  execFileSync(
    'gh',
    [
      'release',
      'create',
      process.env.GITHUB_REF_NAME,
      ...files,
      '--verify-tag',
      '--title',
      'UnlimitedClipper ' + version,
      '--notes-file',
      path.join(root, 'CHANGELOG.md'),
      ...(/-/.test(version) ? ['--prerelease'] : []),
    ],
    { stdio: 'inherit' },
  );
} else {
  const architecture = process.env.UC_RELEASE_ARCH;
  const target = process.env.CARGO_BUILD_TARGET;
  if (
    !['arm64', 'x64'].includes(architecture) ||
    !target ||
    !process.env.TAURI_SIGNING_PRIVATE_KEY
  ) {
    throw new Error('The release architecture, Cargo target, and signing key are required.');
  }
  const bundles = path.join(root, 'target', target, 'release/bundle/nsis');
  const filename = (await readdir(bundles)).find((name) =>
    name.endsWith('_' + version + '_' + architecture + '-setup.exe'),
  );
  if (!filename) {
    throw new Error('The tagged installer was not produced.');
  }
  const artifact = path.join(directory, filename);
  await copyFile(path.join(bundles, filename), artifact);
  const keyPath = path.join(root, '.cache/release-signing.key');
  await writeFile(keyPath, process.env.TAURI_SIGNING_PRIVATE_KEY, { mode: 0o600 });
  const url =
    'https://github.com/' +
    process.env.GITHUB_REPOSITORY +
    '/releases/download/' +
    process.env.GITHUB_REF_NAME +
    '/' +
    filename;
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, 'scripts/release-manifest.mjs'),
        '--kind=application',
        '--version=' + version,
        '--platform=windows-' + architecture,
        '--file=' + artifact,
        '--url=' + url,
        '--out=' + directory,
      ],
      {
        env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath },
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    const manifest = path.join(directory, 'application.json');
    await copyFile(manifest, path.join(directory, 'application-windows-' + architecture + '.json'));
    await unlink(manifest);
  } finally {
    await unlink(keyPath);
  }
}

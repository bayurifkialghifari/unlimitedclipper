import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const directory = path.join(root, '.cache/release-files');
await mkdir(directory, { recursive: true });
const version = process.env.GITHUB_REF_NAME?.replace(/^v/, '');
if (!version) {
  throw new Error('A release tag is required.');
}
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
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
  for (const platform of ['linux-x64', 'linux-arm64', 'macos-x64', 'macos-arm64']) {
    const packageManifest = JSON.parse(
      await readFile(path.join(directory, 'package-' + platform + '.json'), 'utf8'),
    );
    const suffix = platform.startsWith('macos') ? '.dmg' : '.AppImage';
    let expectedArchitecture;
    if (platform.startsWith('macos')) {
      expectedArchitecture = platform.endsWith('arm64') ? 'arm64' : 'x86_64';
    } else {
      expectedArchitecture = platform.endsWith('arm64') ? 183 : 62;
    }
    const expectedFilename = 'UnlimitedClipper-' + version + '-' + platform + suffix;
    const expectedNotices = 'UnlimitedClipper-' + version + '-' + platform + '-notices.tar.gz';
    const artifact = path.join(directory, packageManifest.filename);
    if (
      packageManifest.version !== version ||
      packageManifest.platform !== platform ||
      packageManifest.architecture !== expectedArchitecture ||
      packageManifest.filename !== expectedFilename ||
      packageManifest.notice_filename !== expectedNotices ||
      packageManifest.bytes !== (await stat(artifact)).size ||
      packageManifest.sha256 !== (await sha256(artifact)) ||
      packageManifest.notice_sha256 !==
        (await sha256(path.join(directory, packageManifest.notice_filename)))
    ) {
      throw new Error('The ' + platform + ' bundle did not pass release staging checks.');
    }
  }
  const androidDirectory = path.join(root, '.cache/android-package');
  const androidEvidence = JSON.parse(
    await readFile(path.join(androidDirectory, 'build-evidence.json'), 'utf8'),
  );
  const androidSource = path.join(androidDirectory, androidEvidence.apk);
  if (
    androidEvidence.version !== version ||
    androidEvidence.source_commit !== process.env.GITHUB_SHA ||
    androidEvidence.runtime_tested !== false ||
    androidEvidence.sha256 !== (await sha256(androidSource))
  ) {
    throw new Error('The Android preview did not pass release staging checks.');
  }
  await copyFile(androidSource, path.join(directory, androidEvidence.apk));
  await copyFile(
    path.join(androidDirectory, 'ANDROID-UNTESTED.md'),
    path.join(directory, 'ANDROID-UNTESTED.md'),
  );
  await copyFile(
    path.join(root, 'docs/third-party-notices.md'),
    path.join(directory, 'THIRD-PARTY-NOTICES.md'),
  );
  execFileSync(process.execPath, [path.join(root, 'scripts/stage-source-archives.mjs')], {
    stdio: 'inherit',
  });
  await writeFile(
    path.join(directory, 'application.json'),
    JSON.stringify({ version, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n',
  );
  const names = (await readdir(directory)).filter((name) => name !== 'SHA256SUMS').sort();
  const checksums = [];
  for (const name of names) {
    checksums.push((await sha256(path.join(directory, name))) + '  ' + name);
  }
  await writeFile(path.join(directory, 'SHA256SUMS'), checksums.join('\n') + '\n');
  const notes = path.join(root, 'docs/releases/' + version + '.md');
  const notesFile = await readFile(notes).then(
    () => notes,
    () => path.join(root, 'CHANGELOG.md'),
  );
  const files = [...names, 'SHA256SUMS'].map((name) => path.join(directory, name));
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
      notesFile,
      ...(/-/.test(version) ? ['--prerelease'] : []),
      ...(process.env.UC_RELEASE_DRAFT === '1' ? ['--draft'] : []),
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

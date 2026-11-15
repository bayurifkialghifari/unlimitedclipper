import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readdir, stat, writeFile } from 'node:fs/promises';
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

async function verifyArchitecture() {
  if (platform.startsWith('linux')) {
    const file = await open(artifact, 'r');
    const header = Buffer.alloc(20);
    try {
      const result = await file.read(header, 0, header.length, 0);
      const machine = header.readUInt16LE(18);
      const expected = platform.endsWith('arm64') ? 183 : 62;
      if (
        result.bytesRead !== header.length ||
        header.subarray(0, 4).toString('hex') !== '7f454c46' ||
        header[4] !== 2 ||
        header[5] !== 1 ||
        machine !== expected
      ) {
        throw new Error('The AppImage ELF architecture does not match ' + platform + '.');
      }
      return machine;
    } finally {
      await file.close();
    }
  }
  const appDirectory = path.join(root, 'target', target, 'release/bundle/macos');
  const apps = (await readdir(appDirectory)).filter((name) => name.endsWith('.app'));
  if (apps.length !== 1) {
    throw new Error('Expected exactly one macOS application bundle.');
  }
  const executableDirectory = path.join(appDirectory, apps[0], 'Contents/MacOS');
  const executables = (await readdir(executableDirectory, { withFileTypes: true })).filter(
    (entry) => entry.isFile(),
  );
  if (executables.length !== 1) {
    throw new Error('Expected exactly one macOS application executable.');
  }
  const inspection = spawnSync(
    'lipo',
    ['-archs', path.join(executableDirectory, executables[0].name)],
    {
      encoding: 'utf8',
    },
  );
  const expected = platform.endsWith('arm64') ? 'arm64' : 'x86_64';
  if (inspection.status !== 0 || inspection.stdout.trim() !== expected) {
    throw new Error('The macOS application architecture does not match ' + platform + '.');
  }
  return expected;
}

const architecture = await verifyArchitecture();
const noticeFilename = 'UnlimitedClipper-' + version + '-' + platform + '-notices.tar.gz';
const noticeArchive = path.join(output, noticeFilename);
const noticeRoot = path.join(root, '.tools', platform);
const archive = spawnSync('tar', ['-czf', noticeArchive, '-C', noticeRoot, 'licenses-and-source'], {
  encoding: 'utf8',
});
if (archive.status !== 0) {
  throw new Error('Cannot stage native notices: ' + (archive.stderr || archive.error?.message));
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
await writeFile(
  path.join(output, 'package-' + platform + '.json'),
  JSON.stringify(
    {
      version,
      platform,
      filename,
      bytes: (await stat(artifact)).size,
      sha256: await sha256(artifact),
      architecture,
      notice_filename: noticeFilename,
      notice_sha256: await sha256(noticeArchive),
      runtime_tested: false,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write('Staged ' + filename + '\n');

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './cargo.mjs';

const apply = process.argv.includes('--apply');
const workspace = await realpath(root);
const candidates = [
  'target',
  '.cache/downloads',
  '.cache/android-downloads',
  '.cache/bin',
  '.cache/installed-arm64',
  '.cache/installed-arm64-final',
  '.cache/installed-arm64-captions',
  '.cache/caption-engine.exe',
  '.cache/fixtures/components.zip',
  '.cache/runtime/components',
  '.tools/android',
  '.tools/windows-x64',
];
const retained = new Set(
  process.argv
    .filter((argument) => argument.startsWith('--keep='))
    .map((argument) => argument.slice(7)),
);
for (const candidate of retained) {
  if (!candidates.includes(candidate)) {
    throw new Error('Only an allowlisted cleanup target can be retained: ' + candidate);
  }
}
const duplicateStores = [
  '.cache/runtime/models',
  '.cache/native-runtime/models',
  '.cache/caption-quality-data/models',
];
const modelStore = path.join(workspace, '.data/models');
const report = { applied: apply, reclaimed_bytes: 0, candidates: [], protected: [] };

function inside(filename) {
  const relative = path.relative(workspace, filename);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

let processText;
if (process.platform === 'win32') {
  processText = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', windowsHide: true },
  ).toLowerCase();
} else {
  processText = execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).toLowerCase();
}

async function inspect(filename) {
  if (!inside(filename)) {
    throw new Error('Cleanup target is outside the workspace: ' + filename);
  }
  const info = await lstat(filename);
  if (info.isSymbolicLink()) {
    throw new Error('Cleanup does not follow symbolic links or junctions: ' + filename);
  }
  const resolved = await realpath(filename);
  if (!inside(resolved)) {
    throw new Error('Resolved cleanup target is outside the workspace: ' + resolved);
  }
  if (!info.isDirectory()) {
    return info.size;
  }
  let bytes = 0;
  for (const entry of await readdir(filename)) {
    bytes += await inspect(path.join(filename, entry));
  }
  return bytes;
}

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function consider(relative, duplicate = false) {
  const filename = path.join(workspace, relative);
  const info = await lstat(filename).catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  });
  if (!info) {
    return;
  }
  const processPath = filename.toLowerCase();
  if (
    processText.includes(processPath) ||
    processText.includes(JSON.stringify(processPath).slice(1, -1)) ||
    (relative === 'target' && /(?:rustc|cargo)(?:\.exe)?/.test(processText))
  ) {
    report.protected.push({ path: relative, reason: 'Referenced by a running process' });
    return;
  }
  const bytes = await inspect(filename);
  if (duplicate) {
    const canonical = path.join(modelStore, path.basename(filename));
    const canonicalInfo = await lstat(canonical).catch(() => null);
    if (
      !canonicalInfo?.isFile() ||
      canonicalInfo.size !== bytes ||
      (await digest(filename)) !== (await digest(canonical))
    ) {
      report.protected.push({ path: relative, reason: 'No verified canonical duplicate' });
      return;
    }
  }
  report.candidates.push({ path: relative, bytes, duplicate });
  if (apply) {
    // Recheck containment immediately before the native filesystem operation.
    await inspect(filename);
    await rm(filename, { recursive: info.isDirectory(), force: false, maxRetries: 3 });
    report.reclaimed_bytes += bytes;
  }
  process.stdout.write((apply ? 'Removed ' : 'Candidate ') + relative + ': ' + bytes + ' bytes\n');
}

for (const relative of candidates) {
  if (retained.has(relative)) {
    report.protected.push({ path: relative, reason: 'Explicitly retained' });
    continue;
  }
  await consider(relative);
}
await consider('.cache/ggml-medium-q5_0.bin', true);
for (const relative of duplicateStores) {
  const entries = await readdir(path.join(workspace, relative)).catch(() => []);
  for (const entry of entries) {
    if (/\.(?:gguf|bin)$/.test(entry)) {
      await consider(path.join(relative, entry), true);
    }
  }
}
await mkdir(path.join(workspace, '.cache'), { recursive: true });
await writeFile(
  path.join(workspace, '.cache/storage-cleanup.json'),
  JSON.stringify(report, null, 2),
);
process.stdout.write(JSON.stringify(report, null, 2) + '\n');

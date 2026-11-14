import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'resources/brand/app-icon.svg');
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'icon',
    source,
    '--output',
    path.join(root, 'apps/desktop/src-tauri/icons'),
    '--ios-color',
    '#111310',
  ],
  { cwd: root, windowsHide: true, stdio: 'inherit' },
);
for (const target of ['apps/studio/public/app-icon.svg', 'docs/media/app-icon.svg']) {
  const destination = path.join(root, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const android = path.join(root, 'apps/desktop/src-tauri/gen/android/app/src/main/res');
let directories = [];
try {
  directories = await readdir(android, { withFileTypes: true });
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
for (const directory of directories) {
  if (
    !directory.isDirectory() ||
    (!directory.name.startsWith('mipmap-') && directory.name !== 'values')
  ) {
    continue;
  }
  const files = await readdir(path.join(android, directory.name));
  for (const filename of files.filter((name) => name.startsWith('ic_launcher'))) {
    const target = path.join(root, 'apps/desktop/src-tauri/icons/android', directory.name);
    await mkdir(target, { recursive: true });
    await copyFile(path.join(android, directory.name, filename), path.join(target, filename));
  }
}

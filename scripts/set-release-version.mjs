import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];
const version = tag?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Release tags must use vMAJOR.MINOR.PATCH with an optional prerelease suffix.');
}
if (
  process.env.GITHUB_ACTIONS &&
  (!process.env.UC_APP_PUBLIC_KEY || !process.env.TAURI_SIGNING_PRIVATE_KEY)
) {
  throw new Error(
    'Configure APP_UPDATE_PUBLIC_KEY and APP_UPDATE_PRIVATE_KEY repository secrets before tagging a signed release.',
  );
}
const cargoPath = path.join(root, 'Cargo.toml');
const cargo = await readFile(cargoPath, 'utf8');
await writeFile(
  cargoPath,
  cargo.replace(
    /(\[workspace\.package\][\s\S]*?\nversion = )"[^"]+"/,
    '$1' + JSON.stringify(version),
  ),
);
for (const filename of [
  'package.json',
  'apps/studio/package.json',
  'apps/desktop/package.json',
  'packages/ui/package.json',
  'apps/desktop/src-tauri/tauri.conf.json',
]) {
  const location = path.join(root, filename);
  const data = JSON.parse(await readFile(location, 'utf8'));
  data.version = version;
  await writeFile(location, JSON.stringify(data, null, 2) + '\n');
}
process.stdout.write('Prepared release version ' + version + '\n');

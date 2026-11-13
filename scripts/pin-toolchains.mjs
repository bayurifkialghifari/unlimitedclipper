import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const manifests = {};
const headers = { 'User-Agent': 'UnlimitedClipper' };
const response = await fetch(
  'https://api.github.com/repos/FFmpeg-Builds/FFmpeg-Builds/releases?per_page=8',
  { headers },
);
if (!response.ok) {
  throw new Error('Unable to load immutable FFmpeg releases.');
}
const releases = await response.json();
for (const platform of ['windows-arm64', 'windows-x64']) {
  const filename = path.join(root, '.tools', platform, 'manifest.json');
  const local = JSON.parse(await readFile(filename, 'utf8'));
  for (const tool of local.tools) {
    if (tool.repo === 'FFmpeg-Builds/FFmpeg-Builds' && tool.version === 'latest') {
      const architecture = platform === 'windows-arm64' ? 'winarm64' : 'win64';
      const matches = (asset) => asset.name.includes(architecture + '-gpl-8.1.zip');
      const release = releases.find(
        (release) => release.tag_name !== 'latest' && release.assets.some(matches),
      );
      if (!release) {
        throw new Error(
          'No immutable release matches the downloaded FFmpeg checksum for ' + platform,
        );
      }
      const asset = release.assets.find(matches);
      tool.version = release.tag_name;
      tool.url = asset.browser_download_url;
      tool.name = asset.name;
      tool.size = asset.size;
      tool.sha256 = asset.digest?.replace('sha256:', '') ?? null;
    }
  }
  manifests[platform] = local.tools;
  await writeFile(filename, JSON.stringify(local, null, 2) + '\n');
}
await writeFile(
  path.join(root, 'resources/toolchains.json'),
  JSON.stringify(manifests, null, 2) + '\n',
);

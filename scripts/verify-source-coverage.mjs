import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const directory = path.resolve(
  process.argv.find((argument) => argument.startsWith('--directory='))?.slice(12) ??
    path.join(root, '.cache/release-files'),
);
const version =
  process.argv.find((argument) => argument.startsWith('--version='))?.slice(10) ??
  process.env.GITHUB_REF_NAME?.replace(/^v/, '');
if (!version) {
  throw new Error('A tagged release version is required for the source audit.');
}
const manifest = JSON.parse(await readFile(path.join(directory, 'source-archives.json'), 'utf8'));
if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
  throw new Error('The source archive manifest is empty.');
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

for (const source of manifest.sources) {
  if (
    !/^[a-z0-9.-]+.tar.gz$/.test(source.filename) ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !Array.isArray(source.covers) ||
    !Array.isArray(source.platforms) ||
    source.covers.length === 0 ||
    source.platforms.length === 0
  ) {
    throw new Error('A corresponding-source entry lacks a pinned archive or declared coverage.');
  }
  const file = path.join(directory, source.filename);
  if ((await stat(file)).size === 0 || (await sha256(file)) !== source.sha256) {
    throw new Error('A corresponding-source archive is missing or has changed: ' + source.filename);
  }
}

const externalFeatures = new Set([
  'amf',
  'avisynth',
  'chromaprint',
  'fontconfig',
  'freetype',
  'frei0r',
  'fribidi',
  'gmp',
  'harfbuzz',
  'iconv',
  'lcms2',
  'lv2',
  'lzma',
  'openal',
  'opencl',
  'openssl',
  'sdl2',
  'vaapi',
  'vapoursynth',
  'vulkan',
  'xlib',
  'zlib',
]);
const platforms = [
  'windows-arm64',
  'windows-x64',
  'linux-arm64',
  'linux-x64',
  'macos-arm64',
  'macos-x64',
  'android-arm64',
];
const report = { version, platforms: {} };
for (const platform of platforms) {
  const required = new Set(['ffmpeg']);
  if (platform.startsWith('android')) {
    required.add('ffmpeg-kit-next');
    const configuration = JSON.parse(
      await readFile(path.join(root, 'resources/android.json'), 'utf8'),
    );
    for (const library of configuration.media.libraries) {
      required.add(library);
    }
  } else {
    required.add(platform.startsWith('macos') ? 'ffmpeg-macos-build' : 'ffmpeg-build-scripts');
    let configuration;
    if (platform.startsWith('windows')) {
      configuration = await readFile(
        path.join(directory, 'ffmpeg-' + platform + '-buildconf.txt'),
        'utf8',
      );
    } else {
      const archive = path.join(
        directory,
        'UnlimitedClipper-' + version + '-' + platform + '-notices.tar.gz',
      );
      configuration = execFileSync(
        'tar',
        ['-xOzf', archive, 'licenses-and-source/ffmpeg/build-configuration.txt'],
        { encoding: 'utf8' },
      );
    }
    if (
      !configuration.includes('--enable-gpl') ||
      !configuration.includes('--enable-libx264') ||
      !configuration.includes('--enable-libass')
    ) {
      throw new Error(platform + ' FFmpeg configuration is incomplete or unexpected.');
    }
    for (const match of configuration.matchAll(/--enable-([a-z0-9_-]+)/g)) {
      const feature = match[1];
      if (feature.startsWith('lib') || externalFeatures.has(feature)) {
        required.add(feature);
      }
    }
  }
  const covered = new Set(
    manifest.sources
      .filter((source) => source.platforms.includes(platform))
      .flatMap((source) => source.covers),
  );
  const missing = [...required].filter((component) => !covered.has(component)).sort();
  report.platforms[platform] = {
    required: [...required].sort(),
    covered: [...covered].sort(),
    missing,
  };
}
await writeFile(
  path.join(directory, 'source-coverage-report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
const missing = Object.entries(report.platforms).flatMap(([platform, result]) =>
  result.missing.map((component) => platform + ': ' + component),
);
if (missing.length > 0) {
  throw new Error(
    'Public release blocked: ' +
      missing.length +
      ' linked-source entries are missing. ' +
      missing.slice(0, 20).join(', '),
  );
}
const audit = JSON.parse(
  await readFile(path.join(root, 'resources/media-source-audit.json'), 'utf8'),
);
if (
  audit.status !== 'complete' ||
  !Array.isArray(audit.reviewed_platforms) ||
  platforms.some((platform) => !audit.reviewed_platforms.includes(platform))
) {
  throw new Error('Public release blocked: the platform source and notice audit is pending.');
}
process.stdout.write('Every configured media source has a pinned archive.\n');

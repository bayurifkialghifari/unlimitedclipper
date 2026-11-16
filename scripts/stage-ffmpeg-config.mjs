import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const platform = process.argv.find((argument) => argument.startsWith('--platform='))?.slice(11);
if (!['windows-arm64', 'windows-x64'].includes(platform)) {
  throw new Error('A supported Windows release platform is required.');
}
const ffmpeg = path.join(root, '.tools', platform, 'ffmpeg', 'ffmpeg.exe');
const result = spawnSync(ffmpeg, ['-hide_banner', '-buildconf'], {
  encoding: 'utf8',
  windowsHide: true,
});
const configuration = (result.stdout ?? '') + (result.stderr ?? '');
if (
  result.status !== 0 ||
  !configuration.includes('--enable-gpl') ||
  !configuration.includes('--enable-libx264') ||
  !configuration.includes('--enable-libass')
) {
  throw new Error('The packaged FFmpeg configuration could not be verified.');
}
const output = path.join(root, '.cache/release-files');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'ffmpeg-' + platform + '-buildconf.txt'), configuration);

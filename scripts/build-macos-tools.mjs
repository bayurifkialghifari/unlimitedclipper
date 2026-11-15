import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const platform = process.argv.find((value) => value.startsWith('--platform='))?.slice(11);
if (process.platform !== 'darwin' || !['macos-arm64', 'macos-x64'].includes(platform)) {
  throw new Error('Build macOS tools on the matching native runner.');
}

const cache = path.join(root, '.cache/source-tools', platform);
const destination = path.join(root, '.tools', platform);
await mkdir(cache, { recursive: true });

function run(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(command + ' failed while building macOS tools.');
  }
}

function output(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || command + ' failed.');
  }
  return result.stdout.trim();
}

async function source(repository, tag, commit, directory) {
  const location = path.join(cache, directory);
  const exists = await stat(location)
    .then((value) => value.isDirectory())
    .catch(() => false);
  if (!exists) {
    run('git', ['clone', '--depth', '1', '--branch', tag, repository, location]);
  }
  if (output('git', ['rev-parse', 'HEAD'], location) !== commit) {
    throw new Error(directory + ' source revision did not match the pinned commit.');
  }
  return location;
}

async function findFile(directory, name) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) {
      return location;
    }
    if (entry.isDirectory()) {
      const nested = await findFile(location, name);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

const whisper = await source(
  'https://github.com/ggml-org/whisper.cpp.git',
  'v1.9.5',
  'd1be6fde11ac6e0407606b4e42fe72d34add8037',
  'whisper',
);
const whisperBuild = path.join(cache, 'whisper-build');
run('cmake', [
  '-S',
  whisper,
  '-B',
  whisperBuild,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DGGML_METAL=OFF',
  '-DWHISPER_BUILD_TESTS=OFF',
]);
run('cmake', [
  '--build',
  whisperBuild,
  '--config',
  'Release',
  '--target',
  'whisper-cli',
  '--parallel',
  '2',
]);
const whisperBinary = await findFile(whisperBuild, 'whisper-cli');
if (!whisperBinary) {
  throw new Error('The pinned whisper.cpp source did not produce whisper-cli.');
}
await mkdir(path.join(destination, 'whisper'), { recursive: true });
await copyFile(whisperBinary, path.join(destination, 'whisper/whisper-cli'));
await chmod(path.join(destination, 'whisper/whisper-cli'), 0o755);

if (platform === 'macos-x64') {
  const onnx = await source(
    'https://github.com/microsoft/onnxruntime.git',
    'v1.32.0',
    'fab30a46491a40f5e4c968b80e8a59acbbb91b53',
    'onnxruntime',
  );
  run(
    'bash',
    [
      path.join(onnx, 'build.sh'),
      '--config',
      'Release',
      '--build_shared_lib',
      '--parallel',
      '2',
      '--skip_tests',
    ],
    onnx,
  );
  const runtime = await findFile(path.join(onnx, 'build'), 'libonnxruntime.dylib');
  if (!runtime) {
    throw new Error('The pinned ONNX Runtime source did not produce its shared library.');
  }
  await mkdir(path.join(destination, 'onnxruntime'), { recursive: true });
  await copyFile(runtime, path.join(destination, 'onnxruntime/libonnxruntime.dylib'));
}

process.stdout.write('Built source-pinned macOS tools: ' + platform + '\n');

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cargoEnvironment, root } from './cargo.mjs';

const args = process.argv.slice(2);
const env = cargoEnvironment();
const manifest = JSON.parse(readFileSync(path.join(root, 'resources/android.json'), 'utf8'));
const localSdk = path.join(root, '.tools/android/sdk');
const localJdk = path.join(root, '.tools/android/jdk-21');
env.ANDROID_HOME ??= env.ANDROID_SDK_ROOT ?? localSdk;
env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
env.NDK_HOME ??= path.join(env.ANDROID_HOME, 'ndk', manifest.ndk_version);
if (!env.JAVA_HOME && existsSync(localJdk)) {
  env.JAVA_HOME = localJdk;
}
env.UC_ANDROID_MEDIA_MAVEN ??= path.join(root, '.cache/android-native-tools/maven');
env.GRADLE_OPTS ??= '-Dorg.gradle.jvmargs=-Xmx2048m';
env.CARGO_PROFILE_DEV_DEBUG ??= '0';
env.CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS ??= '-C link-arg=-Wl,-z,max-page-size=16384';
if (args[0] === 'init' && existsSync(path.join(root, 'apps/desktop/src-tauri/gen/android/app'))) {
  throw new Error(
    'The Android project is checked in. Build it directly to preserve its platform configuration.',
  );
}
delete env.CARGO_BUILD_TARGET;
const previousPath = env.Path ?? env.PATH ?? '';
delete env.Path;
delete env.PATH;
env[process.platform === 'win32' ? 'Path' : 'PATH'] = [
  env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin') : '',
  previousPath,
]
  .filter(Boolean)
  .join(path.delimiter);

if (args[0] === 'build') {
  const artifact = path.join(
    env.UC_ANDROID_MEDIA_MAVEN,
    'com/arthenica/ffmpeg-kit-next',
    manifest.media.version,
    'ffmpeg-kit-next-' + manifest.media.version + '.aar',
  );
  if (!existsSync(artifact)) {
    throw new Error(
      'Download the inspected Android native media artifact before building the APK.',
    );
  }
  const evidencePath = path.join(env.UC_ANDROID_MEDIA_MAVEN, '../build-evidence.json');
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const archiveHash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  if (evidence.commit !== manifest.media.commit || evidence.sha256 !== archiveHash) {
    throw new Error('The Android native media archive does not match its pinned build evidence.');
  }
  const studio = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
    { cwd: path.join(root, 'apps/studio'), env, stdio: 'inherit', windowsHide: true },
  );
  if (studio.status !== 0) {
    throw new Error('Cannot build the studio for Android.');
  }
  const assets = JSON.parse(readFileSync(path.join(root, 'resources/assets.json'), 'utf8'));
  for (const asset of assets.filter((item) => item.path.startsWith('fonts/'))) {
    const cached = path.join(root, '.cache/assets', asset.path);
    let bytes = existsSync(cached) ? readFileSync(cached) : null;
    const hash = (data) => createHash('sha256').update(data).digest('hex');
    if (!bytes || hash(bytes) !== asset.sha256) {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error('Cannot download the pinned caption font: ' + asset.path);
      }
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== asset.sha256) {
        throw new Error('Caption font checksum mismatch: ' + asset.path);
      }
      mkdirSync(path.dirname(cached), { recursive: true });
      writeFileSync(cached, bytes);
    }
    const destination = path.join(root, 'apps/studio/dist', asset.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
}

const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const inspecting = args[0] === 'inspect';
const python =
  process.platform === 'win32'
    ? path.join(env.NDK_HOME, 'toolchains/llvm/prebuilt/windows-x86_64/python3/python.exe')
    : 'python3';
const command = inspecting ? python : process.execPath;
const commandArgs = inspecting
  ? [
      path.join(root, 'scripts/inspect-android-apk.py'),
      '--apk-directory',
      path.join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/apk'),
      '--output',
      path.join(root, '.cache/android-apk'),
    ]
  : [cli, 'android', ...args];
const child = spawn(command, commandArgs, {
  cwd: path.join(root, 'apps/desktop'),
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

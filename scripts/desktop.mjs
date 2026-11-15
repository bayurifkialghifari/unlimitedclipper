import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cargoEnvironment, root } from './cargo.mjs';

const args = process.argv.slice(2);
const env = cargoEnvironment();
if (env.TAURI_SIGNING_PRIVATE_KEY_PATH && !env.TAURI_SIGNING_PRIVATE_KEY) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(env.TAURI_SIGNING_PRIVATE_KEY_PATH, 'utf8').trim();
}
if (['build', 'dev'].includes(args[0])) {
  const studio = spawnSync(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
    { cwd: path.join(root, 'apps/studio'), env, stdio: 'inherit' },
  );
  if (studio.status !== 0) {
    throw new Error('Cannot build the studio for the desktop application.');
  }
  const architecture = (env.CARGO_BUILD_TARGET ?? process.env.UC_TARGET ?? '').startsWith('aarch64')
    ? 'arm64'
    : 'x64';
  const platform =
    process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows';
  const directory = path.join(root, '.cache/desktop');
  mkdirSync(directory, { recursive: true });
  const config = path.join(directory, 'bundle.json');
  const tauriDirectory = path.join(root, 'apps/desktop/src-tauri');
  const resources = {
    [path.relative(tauriDirectory, path.join(root, '.tools/' + platform + '-' + architecture))]:
      'tools',
    [path.relative(tauriDirectory, path.join(root, 'apps/studio/dist'))]: 'studio',
  };
  if (platform === 'windows') {
    const metadata = spawnSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (metadata.status !== 0) {
      throw new Error('Cannot locate the locked WebView2 SDK: ' + metadata.stderr);
    }
    const webview = JSON.parse(metadata.stdout).packages.find(
      (dependency) => dependency.name === 'webview2-com-sys',
    );
    if (!webview) {
      throw new Error('The locked desktop dependencies contain no WebView2 SDK.');
    }
    const loader = path.join(
      path.dirname(webview.manifest_path),
      architecture,
      'WebView2Loader.dll',
    );
    const stagedLoader = path.join(directory, architecture, 'WebView2Loader.dll');
    mkdirSync(path.dirname(stagedLoader), { recursive: true });
    // Tauri resource paths must stay on the workspace drive when the SDK lives elsewhere.
    copyFileSync(loader, stagedLoader);
    resources[path.relative(tauriDirectory, stagedLoader)] = 'WebView2Loader.dll';
    if (args[0] === 'dev') {
      env.UC_DEV = '1';
      const targetDirectory = path.join(
        JSON.parse(metadata.stdout).target_directory,
        ...(env.CARGO_BUILD_TARGET ? [env.CARGO_BUILD_TARGET] : []),
        'debug',
      );
      mkdirSync(targetDirectory, { recursive: true });
      copyFileSync(loader, path.join(targetDirectory, 'WebView2Loader.dll'));
    }
  } else if (args[0] === 'dev') {
    env.UC_DEV = '1';
  }
  writeFileSync(
    config,
    JSON.stringify({
      ...(env.UC_APP_PUBLIC_KEY ? { plugins: { updater: { pubkey: env.UC_APP_PUBLIC_KEY } } } : {}),
      bundle: {
        targets: platform === 'macos' ? ['dmg'] : platform === 'linux' ? ['appimage'] : ['nsis'],
        resources,
        createUpdaterArtifacts: Boolean(
          env.TAURI_SIGNING_PRIVATE_KEY || env.TAURI_SIGNING_PRIVATE_KEY_PATH,
        ),
      },
    }),
  );
  args.push('--config', config);
}
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
if (env.CARGO_BUILD_TARGET && !args.includes('--target')) {
  args.push('--target', env.CARGO_BUILD_TARGET);
}
const child = spawn(process.execPath, [cli, ...args], {
  cwd: path.join(root, 'apps/desktop'),
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});

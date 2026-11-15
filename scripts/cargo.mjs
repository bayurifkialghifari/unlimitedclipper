import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function cargoEnvironment() {
  const env = { ...process.env };
  const compiler = path.join(root, '.tools/compiler/llvm-mingw-20261104-ucrt-aarch64/bin');
  const target = env.UC_TARGET ?? 'aarch64-pc-windows-gnullvm';
  const architecture = target.startsWith('aarch64') ? 'aarch64' : 'x86_64';
  const clang = path.join(compiler, architecture + '-w64-mingw32-clang.exe');

  if (process.platform === 'win32' && existsSync(clang) && !env.UC_USE_MSVC) {
    env.CARGO_BUILD_TARGET = target;
    env.RUSTUP_TOOLCHAIN = 'stable-aarch64-pc-windows-gnullvm';
    env['CARGO_TARGET_' + target.toUpperCase().replaceAll('-', '_') + '_LINKER'] = clang;
    env['CC_' + target.replaceAll('-', '_')] = clang;
    env['AR_' + target.replaceAll('-', '_')] = path.join(compiler, 'llvm-ar.exe');
    const previousPath = env.Path ?? env.PATH ?? '';
    delete env.PATH;
    env.Path = compiler + path.delimiter + previousPath;
  }

  const platform =
    process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'windows';
  env.UC_TOOLS_DIR ??= path.join(
    root,
    '.tools/' + platform + '-' + (architecture === 'aarch64' ? 'arm64' : 'x64'),
  );
  env.UC_DATA_DIR ??= path.join(root, '.data');
  env.UC_STUDIO_DIR ??= path.join(root, 'apps/studio/dist');
  return env;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = spawn('cargo', process.argv.slice(2), {
    cwd: root,
    env: cargoEnvironment(),
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

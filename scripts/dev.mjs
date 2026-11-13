import { spawn } from 'node:child_process';
import { cargoEnvironment, root } from './cargo.mjs';

const processes = [
  spawn('cargo', ['run', '-p', 'unlimitedclipper-engine'], {
    cwd: root,
    env: { ...cargoEnvironment(), UC_DEV: '1' },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
  spawn(process.execPath, [root + '/node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
    cwd: root + '/apps/studio',
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  process.exitCode = code;
  for (const child of processes) {
    if (!child.pid || child.exitCode !== null) {
      continue;
    }
    if (process.platform === 'win32') {
      // Cargo does not forward termination to the engine it launches on Windows.
      const cleanup = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      cleanup.on('error', (error) => {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          process.stderr.write(error.message + '\n');
          process.exitCode = 1;
        }
      }
    }
  }
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of processes) {
  child.on('error', (error) => {
    process.stderr.write(error.message + '\n');
    stop(1);
  });
  child.on('exit', (code) => stop(code ?? 1));
}

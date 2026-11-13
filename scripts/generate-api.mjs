import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { cargoEnvironment, root } from './cargo.mjs';

const schema = await new Promise((resolve, reject) => {
  const child = spawn('cargo', ['run', '-q', '-p', 'unlimitedclipper-engine', '--', '--openapi'], {
    cwd: root,
    env: cargoEnvironment(),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code !== 0) {
      reject(new Error('OpenAPI generation failed.'));
    } else {
      resolve(JSON.parse(output));
    }
  });
});

const directory = path.join(root, 'apps/studio/src/generated');
await mkdir(directory, { recursive: true });
await writeFile(path.join(root, 'resources/openapi.json'), JSON.stringify(schema, null, 2) + '\n');
await writeFile(path.join(directory, 'api.ts'), astToString(await openapiTS(schema)));

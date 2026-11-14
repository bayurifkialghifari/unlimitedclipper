import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { modelDirectory, toolDirectory } from './test-paths.mjs';

const binary = path.join(toolDirectory, 'llama/llama-completion.exe');
const args = [
  '-m',
  path.join(modelDirectory, 'Qwen3-4B-Q4_K_M.gguf'),
  '-p',
  '<|im_start|>user\nWrite a short title about creating video clips. Return JSON with title.<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n',
  '--no-conversation',
  '-n',
  '256',
  '-c',
  '2048',
  '-ngl',
  '0',
  '--no-display-prompt',
  '--reasoning',
  'off',
  '--json-schema',
  JSON.stringify({
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
    additionalProperties: false,
  }),
  '-t',
  '6',
];
const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
let errors = '';
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  errors += data;
});
child.on('close', async (code) => {
  await writeFile(path.join(root, '.cache/inference-output.txt'), output);
  await writeFile(path.join(root, '.cache/inference-errors.txt'), errors);
  process.stdout.write('Exit: ' + code + '\n' + output.slice(-6000) + '\n' + errors.slice(-2000));
});

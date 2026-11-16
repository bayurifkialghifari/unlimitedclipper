import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { cargoEnvironment, root } from './cargo.mjs';
import { modelDirectory, toolDirectory } from './test-paths.mjs';

assert.equal(process.platform, 'win32');
const environment = cargoEnvironment();
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const sdk = metadata.packages.find((item) => item.name === 'webview2-com-sys');
assert.ok(sdk);
const target = environment.CARGO_BUILD_TARGET ?? 'aarch64-pc-windows-gnullvm';
const binary = path.join(root, 'target', target, 'debug/unlimitedclipper-desktop.exe');
const directory = await mkdtemp(path.join(root, '.cache/auto-broll-native-'));
const runtime = path.join(directory, 'runtime');
const modelTarget = path.join(directory, 'models');
await mkdir(runtime);
await mkdir(modelTarget);
const executable = path.join(runtime, 'unlimitedclipper-desktop.exe');
await copyFile(binary, executable);
await copyFile(
  path.join(path.dirname(sdk.manifest_path), 'arm64/WebView2Loader.dll'),
  path.join(runtime, 'WebView2Loader.dll'),
);
for (const name of ['Qwen3-4B-Q4_K_M.gguf', 'Qwen3-4B-Q4_K_M.verified']) {
  await link(path.join(modelDirectory, name), path.join(modelTarget, name));
}

const origin = 'http://127.0.0.1:43208';
const child = spawn(executable, [], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...environment,
    UC_DEV: '1',
    UC_PORT: '43208',
    UC_NATIVE_TEST_INSTANCE: '1',
    UC_DATA_DIR: directory,
    UC_STUDIO_DIR: path.join(root, 'apps/studio/dist'),
    UC_TOOLS_DIR: toolDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9231',
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (bytes) => {
  stderr = (stderr + bytes.toString()).slice(-6000);
});
let browser;

function subtitleWords(source, durationMs) {
  const timeMs = (value) => {
    const [hours, minutes, seconds, milliseconds] = value.split(/[:,]/).map(Number);
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  };
  return [
    ...source.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([^\r\n]+)/g),
  ]
    .map((match, index) => ({
      id: 'subtitle-' + index,
      text: match[3],
      start_ms: timeMs(match[1]),
      end_ms: timeMs(match[2]),
      emphasis: false,
      color: null,
      confidence: null,
      timing: {
        provenance: 'manual',
        source_start_ms: timeMs(match[1]),
        source_end_ms: timeMs(match[2]),
        alignment_confidence: null,
      },
    }))
    .filter((word) => word.end_ms <= durationMs);
}

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, stderr);
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(browser, stderr);
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    page = context.pages().find((item) => item.url().startsWith(origin));
    if (page) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Native Studio page did not open.');
  await page.setViewportSize({ width: 1600, height: 1000 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true);

  async function api(route, method = 'GET', body) {
    return page.evaluate(
      async ({ route, method, body }) => {
        const response = await fetch('/api/v1' + route, {
          method,
          headers: { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        return result;
      },
      { route, method, body },
    );
  }

  const settings = await api('/settings');
  await api('/settings', 'PUT', { ...settings, language: 'en', auto_update: false });
  const health = await api('/health');
  assert.ok(health.editor_features.includes('auto_broll'));
  const models = await api('/models');
  assert.ok(models.some((model) => model.id === 'qwen3-4b' && model.ready));
  const imported = await api('/imports/local', 'POST', {
    path: path.join(root, 'docs/media/dinosaur.mp4'),
  });
  await expect
    .poll(async () => (await api('/jobs')).find((job) => job.id === imported.id)?.status, {
      timeout: 120_000,
    })
    .toBe('completed');
  const project = (await api('/projects'))[0];
  let clip = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Dino Dino gameplay',
    start_ms: 0,
    end_ms: project.duration_ms,
  });
  const words = subtitleWords(
    await readFile(path.join(root, 'docs/media/dinosaur.srt'), 'utf8'),
    project.duration_ms,
  );
  assert.ok(words.length >= 6);
  clip = await api('/clips/' + clip.id, 'PUT', {
    name: clip.name,
    revision: clip.revision,
    document: { ...clip.document, words },
  });
  await page.goto(origin + '/studio/' + clip.id + '?panel=captions');
  const captions = page.getByRole('heading', { name: 'Captions', exact: true });
  const transcript = page.getByRole('heading', { name: 'Transcript', exact: true });
  await expect(captions).toBeVisible();
  await expect(transcript).toBeVisible();
  await expect
    .poll(async () => (await api('/projects/' + project.id + '/waveform', 'POST')).status, {
      timeout: 90_000,
    })
    .toBe('ready');
  await expect
    .poll(() => page.getByLabel('Source audio waveform').locator('svg rect').count())
    .toBeGreaterThan(0);
  const captionBox = await captions.boundingBox();
  const transcriptBox = await transcript.boundingBox();
  assert.ok(captionBox && transcriptBox && captionBox.y < transcriptBox.y);
  await page.screenshot({ path: path.join(root, 'docs/media/studio.png') });
  await page.getByRole('tab', { name: 'Source segments' }).click();
  await expect(page.getByRole('heading', { name: 'B-roll library' })).toHaveCount(0);
  const brollTab = page.getByRole('tab', { name: 'B-roll' });
  await brollTab.click();
  await brollTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Captions' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(brollTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Find B-roll with local AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Find B-roll' }).click();
  let job;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    job = await api('/clips/' + clip.id + '/auto-broll');
    if (job?.status === 'completed') {
      break;
    }
    assert.notEqual(job?.status, 'failed', job?.error);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(job?.status, 'completed', 'Automatic B-roll did not finish in ten minutes.');
  assert.ok(job.payload.proposal?.asset_id, JSON.stringify(job.payload));
  const proposal = job.payload.proposal;
  const assets = await api('/projects/' + project.id + '/broll-assets');
  const asset = assets.find((candidate) => candidate.asset_id === proposal.asset_id);
  assert.equal(asset?.license, 'CC0');
  const placeButton = page.getByRole('button', { name: 'Place in timeline' });
  await expect(placeButton).toBeEnabled();
  await expect(placeButton).toBeInViewport();
  await expect(page.getByRole('link', { name: 'View source and license' }).first()).toHaveAttribute(
    'href',
    proposal.source_url,
  );
  await expect
    .poll(() =>
      page
        .locator('video[aria-label^="Preview video"]')
        .first()
        .evaluate((video) => video.readyState),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole('complementary', { name: 'Progress and alerts' })).toHaveCount(0);
  await page.screenshot({ path: path.join(root, 'docs/media/broll-library.png') });
  await placeButton.click();
  await expect
    .poll(async () => {
      const saved = await api('/clips/' + clip.id);
      return saved.document.visual_layers.some(
        (layer) => layer.kind === 'broll' && layer.asset_id === proposal.asset_id,
      );
    })
    .toBe(true);
  await page.screenshot({ path: path.join(root, 'docs/media/broll.png') });
  const saved = await api('/clips/' + clip.id);
  const renderJob = await api('/clips/' + clip.id + '/preview-render', 'POST', {
    revision: saved.revision,
  });
  let rendered;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    rendered = (await api('/jobs')).find((candidate) => candidate.id === renderJob.id);
    if (rendered?.status === 'completed') {
      break;
    }
    assert.notEqual(rendered?.status, 'failed', rendered?.error);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(
    rendered?.status,
    'completed',
    'Edited B-roll preview did not finish in five minutes.',
  );
  const renderedAssetId = rendered.payload.preview_asset_id;
  assert.ok(renderedAssetId);
  const renderedResponse = await fetch(origin + '/api/v1/assets/' + renderedAssetId);
  assert.equal(renderedResponse.ok, true);
  const renderedFile = path.join(directory, 'auto-broll-rendered.mp4');
  await writeFile(renderedFile, Buffer.from(await renderedResponse.arrayBuffer()));
  const ffmpeg = path.join(toolDirectory, 'ffmpeg', 'ffmpeg.exe');
  execFileSync(ffmpeg, ['-v', 'error', '-i', renderedFile, '-f', 'null', '-'], {
    windowsHide: true,
    timeout: 120_000,
  });
  const frameFile = path.join(root, '.cache/auto-broll-rendered-frame.jpg');
  execFileSync(
    ffmpeg,
    ['-v', 'error', '-ss', '5.5', '-i', renderedFile, '-frames:v', '1', '-y', frameFile],
    {
      windowsHide: true,
      timeout: 30_000,
    },
  );
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(root, '.cache/auto-broll-native-validation.json'),
    JSON.stringify(
      {
        nativeBridge: true,
        projectId: project.id,
        clipId: clip.id,
        jobId: job.id,
        stockPageId: job.payload.page_id,
        assetId: asset.asset_id,
        license: asset.license,
        sourceUrl: asset.source_url,
        proposalStartMs: proposal.start_ms,
        renderedPreviewAssetId: renderedAssetId,
        renderedFrame: frameFile,
        pageErrors,
      },
      null,
      2,
    ),
  );
  process.stdout.write('Native automatic B-roll validation passed.\n');
} finally {
  await browser?.close();
  child.kill();
}

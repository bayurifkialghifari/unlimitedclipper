import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { cargoEnvironment, root } from './cargo.mjs';
import { toolDirectory } from './test-paths.mjs';

assert.equal(process.platform, 'win32', 'Native layout validation requires Windows.');
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
assert.ok(sdk, 'WebView2 SDK must be installed.');
const target = environment.CARGO_BUILD_TARGET ?? 'aarch64-pc-windows-gnullvm';
const binary =
  process.env.UC_NATIVE_DESKTOP_BINARY ??
  path.join(root, 'target', target, 'debug/unlimitedclipper-desktop.exe');
const origin = 'http://127.0.0.1:43199';
const fixture = path.join(root, 'docs/media/editor-demo.mp4');
const directory = await mkdtemp(path.join(root, '.cache/layout-native-'));
const runtime = path.join(directory, 'runtime');
await mkdir(runtime);
const executable = path.join(runtime, 'unlimitedclipper-desktop.exe');
await copyFile(binary, executable);
await copyFile(
  path.join(path.dirname(sdk.manifest_path), 'arm64/WebView2Loader.dll'),
  path.join(runtime, 'WebView2Loader.dll'),
);
const child = spawn(executable, [], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...environment,
    UC_DEV: '1',
    UC_PORT: '43199',
    UC_NATIVE_TEST_INSTANCE: '1',
    UC_DATA_DIR: directory,
    UC_STUDIO_DIR: path.join(root, 'apps/studio/dist'),
    UC_TOOLS_DIR: toolDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9228',
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (bytes) => {
  stderr = (stderr + bytes.toString()).slice(-6000);
});
const exited = new Promise((resolve, reject) => {
  child.once('exit', resolve);
  child.once('error', reject);
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
      browser = await chromium.connectOverCDP('http://127.0.0.1:9228');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(browser, 'Isolated WebView2 did not expose its test endpoint: ' + stderr);
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    page = context.pages().find((item) => item.url().startsWith(origin));
    if (page) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Isolated Studio page did not open.');
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
  const imported = await api('/imports/local', 'POST', { path: fixture });
  await expect
    .poll(async () => (await api('/jobs')).find((job) => job.id === imported.id)?.status, {
      timeout: 120_000,
    })
    .toBe('completed');
  const project = (await api('/projects'))[0];
  assert.ok(project?.has_audio, 'The local podcast source must contain audio.');
  const duration = Math.min(project.duration_ms, 16_200);
  let clip = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Podcast cut from local source',
    start_ms: 0,
    end_ms: duration,
  });
  await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Second podcast cut',
    start_ms: 2_000,
    end_ms: Math.min(project.duration_ms, 8_000),
  });
  const words = subtitleWords(
    await readFile(path.join(root, 'docs/media/editor-demo.srt'), 'utf8'),
    duration,
  );
  assert.ok(words.length > 10, 'Real subtitle sidecar is required for this native screenshot.');
  clip = await api('/clips/' + clip.id, 'PUT', {
    name: clip.name,
    revision: clip.revision,
    document: { ...clip.document, words },
  });
  const segments = [
    { id: 'podcast-first', start_ms: 0, end_ms: 8_000 },
    { id: 'podcast-second', start_ms: 8_000, end_ms: duration },
  ];
  const document = await api('/clips/' + clip.id + '/timeline-preview', 'POST', {
    document: clip.document,
    segments,
  });
  clip = await api('/clips/' + clip.id, 'PUT', {
    name: clip.name,
    revision: clip.revision,
    document,
  });

  await page.goto(origin + '/');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  const projectHeading = page.getByRole('heading', { name: project.name });
  await expect(projectHeading).toBeVisible();
  const importButton = await page.getByRole('button', { name: 'Import file' }).boundingBox();
  const projectCard = await projectHeading.locator('xpath=ancestor::article').boundingBox();
  assert.ok(importButton && projectCard);
  assert.ok(projectCard.y - importButton.y - importButton.height >= 20);
  await page.screenshot({ path: path.join(root, 'docs/media/projects.png') });
  await page.goto(origin + '/projects/' + project.id);
  const clipCard = page
    .getByRole('heading', { name: clip.name })
    .locator('xpath=ancestor::article');
  await expect(clipCard.getByRole('button', { name: 'Edit clip' })).toHaveCount(1);
  await expect(clipCard.getByRole('button', { name: 'Change style' })).toHaveCount(0);
  await page.screenshot({ path: path.join(root, 'docs/media/clips.png') });
  await page.goto(origin + '/studio/' + clip.id + '?panel=captions');
  await expect(page.getByRole('heading', { name: clip.name })).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(timeline).toBeVisible();
  await expect
    .poll(async () => (await api('/projects/' + project.id + '/waveform', 'POST')).status, {
      timeout: 90_000,
    })
    .toBe('ready');
  const waveform = await api('/projects/' + project.id + '/waveform', 'POST');
  assert.ok(
    waveform.peaks.some((peak) => peak > 0),
    'The waveform must reflect audible media.',
  );
  await expect
    .poll(() => timeline.getByLabel('Source audio waveform').locator('svg rect').count())
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        timeline
          .locator('img')
          .first()
          .evaluate((image) => image.naturalWidth),
      {
        timeout: 90_000,
      },
    )
    .toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Source segments' }).click();
  const firstScene = page.getByRole('group', { name: 'Scene 1' });
  const startField = await firstScene.getByRole('spinbutton', { name: 'Start (s)' }).boundingBox();
  const applyButton = await firstScene.getByRole('button', { name: 'Apply range' }).boundingBox();
  const audioRow = await timeline.getByLabel('Source audio waveform').boundingBox();
  assert.ok(startField && applyButton && audioRow);
  assert.ok(applyButton.y - startField.y - startField.height >= 10);
  assert.ok(audioRow.y + audioRow.height <= 1000);
  await page.screenshot({ path: path.join(root, 'docs/media/studio.png') });
  await expect
    .poll(async () => (await api('/assets/' + project.asset_id + '/waveform', 'POST')).status, {
      timeout: 90_000,
    })
    .toBe('ready');
  const assetWaveform = await api('/assets/' + project.asset_id + '/waveform', 'POST');
  assert.ok(assetWaveform.peaks.some((peak) => peak > 0));
  clip = await api('/clips/' + clip.id);
  clip = await api('/clips/' + clip.id, 'PUT', {
    name: clip.name,
    revision: clip.revision,
    document: {
      ...clip.document,
      audio_layers: [
        ...clip.document.audio_layers,
        {
          id: 'native-audio-layer',
          enabled: true,
          start_ms: 1_000,
          end_ms: 5_000,
          asset_id: project.asset_id,
          source_start_ms: 2_000,
          gain: 0.35,
          fade_in_ms: 0,
          fade_out_ms: 0,
          normalize: false,
          ducking: false,
        },
      ],
    },
  });
  await page.reload();
  await expect
    .poll(() => timeline.locator('[data-kind="audio"] svg rect').count())
    .toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Source segments' }).click();
  const brollLibrary = page.getByRole('region', { name: 'B-roll library' });
  await expect(brollLibrary).toBeVisible();
  const brollPreview = brollLibrary.locator('video');
  await expect.poll(() => brollPreview.evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
  await brollPreview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'docs/media/broll-library.png') });
  await brollLibrary
    .getByRole('button', { name: /^Add at playhead/ })
    .first()
    .click();
  await expect
    .poll(async () => {
      const saved = await api('/clips/' + clip.id);
      return saved.document.visual_layers.some((layer) => layer.kind === 'broll');
    })
    .toBe(true);
  await page.screenshot({ path: path.join(root, 'docs/media/broll.png') });
  await page.getByRole('tab', { name: 'Captions' }).click();
  await page.screenshot({ path: path.join(root, 'docs/media/captions.png') });

  await page.getByRole('tab', { name: 'Effects' }).click();
  await expect(page.getByRole('tab', { name: 'Effects' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: path.join(root, 'docs/media/filters.png') });
  await page.goto(origin + '/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'docs/media/settings.png') });

  const exported = await api('/clips/' + clip.id + '/export', 'POST');
  await expect
    .poll(
      async () => {
        const job = (await api('/jobs')).find((item) => item.id === exported.id);
        if (job?.status === 'failed') {
          throw new Error(job.error ?? 'Native export failed.');
        }
        return job?.status;
      },
      { timeout: 120_000 },
    )
    .toBe('completed');
  await page.goto(origin + '/exports');
  const video = page.locator('article video').first();
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => element.readyState), { timeout: 30_000 })
    .toBeGreaterThan(0);
  assert.ok(await video.evaluate((element) => element.videoWidth > 0));
  await video.evaluate(async (element) => {
    element.muted = true;
    await element.play();
  });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
  await video.evaluate((element) => element.pause());
  await page.screenshot({ path: path.join(root, 'docs/media/exports.png') });
  assert.deepEqual(pageErrors, []);

  const evidence = {
    native_bridge: true,
    source: 'docs/media/editor-demo.mp4',
    waveform_buckets: waveform.peaks.length,
    waveform_nonzero: true,
    asset_waveform_buckets: assetWaveform.peaks.length,
    audio_layer_waveform_visible: true,
    broll_preview_decoded: true,
    broll_added_and_saved: true,
    project_card_gap_px: projectCard.y - importButton.y - importButton.height,
    scene_button_gap_px: applyButton.y - startField.y - startField.height,
    waveform_visible_in_viewport: true,
    storyboard_decoded: true,
    scene_count: segments.length,
    export_video_visible: true,
    export_video_decoded: true,
    export_video_played: true,
    screenshots: [
      'studio',
      'broll',
      'broll-library',
      'captions',
      'filters',
      'projects',
      'clips',
      'settings',
      'exports',
    ],
    page_errors: pageErrors,
  };
  await writeFile(
    path.join(root, '.cache/native-layout-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
  }
  await exited;
}

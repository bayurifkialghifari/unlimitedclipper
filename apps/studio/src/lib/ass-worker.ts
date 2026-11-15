import type { JASSUB, MainModule } from 'jassub/src/wasm/types';

type Command = {
  id: number;
  kind: 'initialize' | 'track' | 'frame';
  wasmUrl?: string;
  moduleUrl?: string;
  fonts?: string[];
  content?: string;
  width?: number;
  height?: number;
  seconds?: number;
};

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Command>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  HEAPU8RAW: Uint8Array;
};
let library: JASSUB | null = null;
let surface: OffscreenCanvas | null = null;
let queue = Promise.resolve();

async function initialize(command: Command) {
  const fonts = await Promise.all(
    (command.fonts ?? []).map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Unable to load a registered caption font.');
      }
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  const originalFetch = globalThis.fetch;
  let module: MainModule;
  try {
    // The pinned Emscripten loader resolves its WASM relative to its own module URL.
    globalThis.fetch = () => originalFetch(command.wasmUrl!);
    const loader = await import(/* @vite-ignore */ command.moduleUrl!);
    module = await loader.default({
      __url: command.wasmUrl,
      __workerUrl: command.moduleUrl,
      __poolSize: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  library = new module.JASSUB(360, 640, 'Noto Sans');
  library.setThreads(1);
  library.setMemoryLimits(1000, 32 * 1024 * 1024);
  for (const [index, font] of fonts.entries()) {
    const pointer = module._malloc(font.byteLength) >>> 0;
    scope.HEAPU8RAW.set(font, pointer);
    library.addFont('managed-font-' + index, pointer, font.byteLength);
  }
  library.reloadFonts();
  surface = new OffscreenCanvas(360, 640);
}

function render(command: Command) {
  if (!library || !surface) {
    throw new Error('Caption renderer is not initialized.');
  }
  const width = Math.max(1, Math.round(command.width!));
  const height = Math.max(1, Math.round(command.height!));
  if (surface.width !== width || surface.height !== height) {
    surface.width = width;
    surface.height = height;
    library.resizeCanvas(width, height, width, height);
  }
  const context = surface.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('A transparent caption canvas is unavailable.');
  }
  context.clearRect(0, 0, width, height);
  const images = library.rawRender(command.seconds!, 1) as Int32Array | null;
  if (images) {
    for (let index = 0; index < images.length; index += 8) {
      const imageWidth = images[index];
      const imageHeight = images[index + 1];
      const destinationX = images[index + 2];
      const destinationY = images[index + 3];
      const pointer = images[index + 4] >>> 0;
      const color = images[index + 5] >>> 0;
      const stride = images[index + 6];
      if (imageWidth <= 0 || imageHeight <= 0) {
        continue;
      }
      const pixels = new ImageData(imageWidth, imageHeight);
      const opacity = (255 - (color & 255)) / 255;
      for (let row = 0; row < imageHeight; row += 1) {
        for (let column = 0; column < imageWidth; column += 1) {
          const pixel = (row * imageWidth + column) * 4;
          pixels.data[pixel] = (color >>> 24) & 255;
          pixels.data[pixel + 1] = (color >>> 16) & 255;
          pixels.data[pixel + 2] = (color >>> 8) & 255;
          pixels.data[pixel + 3] = Math.round(
            scope.HEAPU8RAW[pointer + row * stride + column] * opacity,
          );
        }
      }
      const glyph = new OffscreenCanvas(imageWidth, imageHeight);
      glyph.getContext('2d')!.putImageData(pixels, 0, 0);
      context.drawImage(glyph, destinationX, destinationY);
    }
  }
  return surface.transferToImageBitmap();
}

scope.onmessage = (event: MessageEvent<Command>) => {
  const command = event.data;
  queue = queue.then(async () => {
    try {
      if (command.kind === 'initialize') {
        await initialize(command);
      } else if (command.kind === 'track') {
        if (!library?.createTrackMem(command.content!)) {
          throw new Error('The engine returned an invalid ASS track.');
        }
      } else {
        const bitmap = render(command);
        scope.postMessage({ id: command.id, bitmap }, [bitmap]);
        return;
      }
      scope.postMessage({ id: command.id });
    } catch (error) {
      scope.postMessage({ id: command.id, error: String(error) });
    }
  });
};

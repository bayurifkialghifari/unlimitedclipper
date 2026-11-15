import AssWorker from './ass-worker?worker';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import moduleUrl from 'jassub/dist/wasm/jassub-worker.js?url';

export class AssRenderer {
  private worker = new AssWorker();
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve: (bitmap?: ImageBitmap) => void; reject: (error: Error) => void }
  >();
  readonly ready: Promise<void>;

  constructor(fonts: string[]) {
    this.worker.onmessage = (event) => {
      const { id, bitmap, error } = event.data;
      const request = this.pending.get(id);
      this.pending.delete(id);
      if (!request) {
        bitmap?.close();
      } else if (error) {
        request.reject(new Error(error));
      } else {
        request.resolve(bitmap);
      }
    };
    this.worker.onerror = (event) => {
      this.fail(new Error(event.message || 'Caption worker stopped unexpectedly.'));
    };
    this.ready = this.send({
      kind: 'initialize',
      wasmUrl: new URL(wasmUrl, location.href).href,
      moduleUrl: new URL(moduleUrl, location.href).href,
      fonts: fonts.map(
        (font) => new URL('/api/v1/fonts/' + encodeURIComponent(font), location.href).href,
      ),
    }).then(() => {});
  }

  private send(command: Record<string, unknown>): Promise<ImageBitmap | undefined> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...command, id });
    });
  }

  async setTrack(content: string) {
    await this.ready;
    await this.send({ kind: 'track', content });
  }

  async frame(seconds: number, width: number, height: number): Promise<ImageBitmap> {
    await this.ready;
    return (await this.send({ kind: 'frame', seconds, width, height }))!;
  }

  private fail(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }

  destroy() {
    this.worker.terminate();
    this.fail(new Error('Caption renderer was closed.'));
  }
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url';
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url';
import { api, assetUrl } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { flushEditor } from '../lib/save';
import { useText } from '../lib/i18n';
import { outputDuration } from '../lib/timeline';
import { usePreviewFrame } from '../hooks/use-preview-frame';
import type { EditDocument, Job } from '../types';
import styles from '../styles/Studio.module.css';

function identity(document: EditDocument) {
  const video = Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => !['words', 'captions', 'caption_model'].includes(key),
    ),
  );
  return JSON.stringify(video);
}

export function ComposedPreview({ active = true }: { active?: boolean }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const seek = useEditor((state) => state.seekRequest);
  const [jobId, setJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const renderer = useRef<JASSUB | null>(null);
  const renderingActive = useRef(false);
  const [loadedAsset, setLoadedAsset] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ['preview-jobs', jobId],
    queryFn: api.jobs,
    enabled: Boolean(jobId),
    refetchInterval: 1000,
  });
  const fonts = useQuery({ queryKey: ['fonts'], queryFn: api.fonts });
  const job = jobs.data?.find((job: Job) => job.id === jobId);
  const payload = job?.payload as { preview_asset_id?: string } | undefined;
  const asset = job?.status === 'completed' ? payload?.preview_asset_id : undefined;
  const busy = pending || Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));
  const document = draft?.document;
  const clipId = draft?.id;
  const duration = document ? outputDuration(document) : 0;
  const stale = Boolean(document && snapshot && identity(document) !== snapshot);
  const aspect =
    document?.layout === 'square' ? 1 : document?.layout === 'landscape' ? 16 / 9 : 9 / 16;
  const frameWidth = usePreviewFrame(stage, aspect);

  useEffect(() => {
    renderingActive.current = active && !stale;
    if (!active || stale) {
      video.current?.pause();
    }
  }, [active, stale]);

  useEffect(() => {
    if (!asset) {
      return;
    }
    const controller = new AbortController();
    const renew = () => {
      void fetch(assetUrl(asset), { method: 'HEAD', signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            setError(text.previewError);
          }
        })
        .catch((failure: Error) => {
          if (!controller.signal.aborted) {
            setError(failure.message);
          }
        });
    };
    renew();
    const timer = window.setInterval(renew, 30_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [asset, text.previewError]);

  async function render() {
    if (!draft) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const current = useEditor.getState().draft!;
      const queued = await api.previewRender(current.id, current.revision);
      setSnapshot(identity(current.document));
      setJobId(queued.id);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!canvas.current || !frame.current || !fonts.data || !asset) {
      return;
    }
    const element = frame.current;
    // JASSUB removes its canvas on destroy; keep that node outside React ownership.
    const surface = window.document.createElement('canvas');
    surface.style.width = '100%';
    surface.style.height = '100%';
    canvas.current.append(surface);
    const subtitle = new JASSUB({
      canvas: surface,
      subContent: '[Script Info]' + String.fromCharCode(10) + 'ScriptType: v4.00+',
      workerUrl,
      wasmUrl,
      modernWasmUrl,
      wasmWorkerUrl,
      modernWasmWorkerUrl,
      fonts: fonts.data.map((name) => '/api/v1/fonts/' + encodeURIComponent(name)),
      defaultFont: 'Noto Sans',
      queryFonts: false,
    });
    renderer.current = subtitle;
    let handle = 0;
    let working = false;
    let disposed = false;
    let failed = false;
    let lastFrame = '';
    const update = () => {
      const nextFrame =
        String(video.current?.currentTime) + ':' + element.clientWidth + ':' + element.clientHeight;
      if (
        !working &&
        !failed &&
        nextFrame !== lastFrame &&
        video.current &&
        video.current.readyState >= 2 &&
        element.clientWidth > 0 &&
        element.clientHeight > 0 &&
        renderingActive.current
      ) {
        working = true;
        lastFrame = nextFrame;
        void subtitle.ready
          .then(() =>
            subtitle.manualRender(
              {
                expectedDisplayTime: performance.now(),
                width: element.clientWidth,
                height: element.clientHeight,
                mediaTime: video.current?.currentTime ?? 0,
              },
              true,
            ),
          )
          .catch((failure: Error) => {
            failed = true;
            if (!disposed) {
              setError(failure.message);
            }
          })
          .finally(() => {
            working = false;
          });
      }
      handle = requestAnimationFrame(update);
    };
    handle = requestAnimationFrame(update);
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      renderer.current = null;
      void subtitle.destroy();
    };
  }, [fonts.data, asset]);

  useEffect(() => {
    if (!document || !draft || !asset || stale) {
      return;
    }
    const controller = new AbortController();
    const track = structuredClone(document);
    track.title.text = '';
    track.watermark.mode = 'none';
    track.visual_layers = [];
    void api
      .preview(draft.id, track, controller.signal)
      .then(async (content) => {
        const subtitle = renderer.current;
        if (!subtitle) {
          return;
        }
        await subtitle.ready;
        if (!controller.signal.aborted) {
          await subtitle.renderer.setTrack(content);
          if (frame.current && !controller.signal.aborted) {
            await subtitle.resize(true, frame.current.clientWidth, frame.current.clientHeight);
          }
        }
      })
      .catch((failure: Error) => {
        if (failure.name !== 'AbortError') {
          setError(failure.message);
        }
      });
    return () => controller.abort();
  }, [document, draft, asset, fonts.data, stale]);

  useEffect(() => {
    if (active && !stale && video.current && seek && seek.clipId === clipId) {
      video.current.currentTime = Math.min(duration, seek.positionMs) / 1000;
    }
  }, [seek, clipId, duration, active, stale]);

  return (
    <section className={styles.previewPanel} aria-label={text.renderPreview}>
      <div className={styles.previewTop}>
        <Button onClick={() => void render()} disabled={busy}>
          {text.renderPreview}
        </Button>
        {busy && <span role="status">{text.running}</span>}
      </div>
      <div ref={stage} className={styles.previewStage}>
        <div
          ref={frame}
          style={{
            position: 'relative',
            aspectRatio: aspect,
            width: frameWidth,
            overflow: 'hidden',
          }}
        >
          {asset ? (
            <video
              key={asset}
              ref={video}
              src={assetUrl(asset)}
              controls={active && !stale}
              playsInline
              preload="auto"
              aria-label={text.renderPreview}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              onLoadedData={() => setLoadedAsset(asset)}
              onWaiting={() => setLoadedAsset(null)}
              onCanPlay={() => setLoadedAsset(asset)}
              onPlay={() => {
                if (!active || stale) {
                  video.current?.pause();
                }
              }}
              onTimeUpdate={() => {
                if (active && !stale) {
                  useEditor.getState().setPlayhead((video.current?.currentTime ?? 0) * 1000);
                }
              }}
              onError={() => setError(text.previewError)}
            >
              <track
                kind="captions"
                src={'/api/v1/clips/' + clipId + '/subtitles?format=vtt&timeline=output'}
              />
            </video>
          ) : (
            <p className={styles.hint}>{text.renderPreview}</p>
          )}
          <div
            ref={canvas}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              visibility: stale ? 'hidden' : 'visible',
            }}
          />
          {asset && loadedAsset !== asset && !error && (
            <p role="status" className={styles.previewLoading}>
              {text.previewLoadingVideo}
            </p>
          )}
        </div>
      </div>
      {stale && (
        <p role="status" className={styles.hint}>
          {text.previewStale}
        </p>
      )}
      {(error || job?.error) && (
        <p role="alert" className={styles.error}>
          {error ?? job?.error}
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import {
  PlayIcon,
  PauseIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  FilmStripIcon,
} from '@phosphor-icons/react';
import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url';
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url';
import { api, assetUrl } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import type { CropRect, EditDocument, Project } from '../types';
import styles from '../styles/Studio.module.css';
import { CropHandle } from '../molecules/CropHandle';

function currentCrop(document: EditDocument, milliseconds: number): CropRect {
  let previous = { time_ms: 0, x: document.crop.x, y: document.crop.y };
  for (const next of document.keyframes) {
    if (next.time_ms > milliseconds) {
      const ratio = Math.max(
        0,
        (milliseconds - previous.time_ms) / (next.time_ms - previous.time_ms),
      );
      return {
        ...document.crop,
        x: previous.x + (next.x - previous.x) * ratio,
        y: previous.y + (next.y - previous.y) * ratio,
      };
    }
    previous = next;
  }
  return { ...document.crop, x: previous.x, y: previous.y };
}

function videoStyle(
  project: Project,
  crop: CropRect,
  width: number,
  height: number,
  contain = false,
): CSSProperties {
  const scale = contain
    ? Math.min(width / project.width, height / project.height)
    : Math.max(width / (project.width * crop.width), height / (project.height * crop.height));
  return {
    width: project.width * scale,
    height: project.height * scale,
    left: contain
      ? (width - project.width * scale) / 2
      : -crop.x * project.width * scale - (project.width * crop.width * scale - width) / 2,
    top: contain
      ? (height - project.height * scale) / 2
      : -crop.y * project.height * scale - (project.height * crop.height * scale - height) / 2,
  };
}

export function VideoPreview({ project, onImport }: { project?: Project; onImport: () => void }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const seekRequest = useEditor((state) => state.seekRequest);
  const frame = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLVideoElement>(null);
  const secondary = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<JASSUB | null>(null);
  const [size, setSize] = useState({ width: 270, height: 480 });
  const [playing, setPlaying] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [watermarkSize, setWatermarkSize] = useState<{
    id: string;
    width: number;
    height: number;
  } | null>(null);
  const fonts = useQuery({ queryKey: ['fonts'], queryFn: api.fonts, enabled: Boolean(project) });
  const document = draft?.document;
  const hasDocument = Boolean(document);
  const clipId = draft?.id;
  const captionsUrl = clipId ? '/api/v1/clips/' + clipId + '/subtitles?format=vtt' : undefined;
  const start = document?.start_ms ?? 0;
  const end = document?.end_ms ?? project?.duration_ms ?? 0;
  const layout = document?.layout ?? 'landscape';
  const aspect = layout === 'square' ? 1 : layout === 'landscape' ? 16 / 9 : 9 / 16;
  const crop = document ? currentCrop(document, playhead) : { x: 0, y: 0, width: 1, height: 1 };

  useEffect(() => {
    if (!frame.current) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [project?.id]);

  useEffect(() => {
    if (primary.current) {
      primary.current.currentTime = start / 1000;
    }
  }, [draft?.id, start]);

  useEffect(() => {
    if (!seekRequest || seekRequest.clipId !== clipId) {
      return;
    }
    const milliseconds = Math.max(start, Math.min(end, start + seekRequest.positionMs));
    if (primary.current) {
      primary.current.currentTime = milliseconds / 1000;
    }
    if (secondary.current) {
      secondary.current.currentTime = milliseconds / 1000;
    }
  }, [seekRequest, clipId, start, end]);

  useEffect(() => {
    if (!canvas.current || !hasDocument || !fonts.data) {
      return;
    }
    const subtitle = new JASSUB({
      canvas: canvas.current,
      subContent: '[Script Info]\nScriptType: v4.00+\n',
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
    void subtitle.ready.catch(() => setPreviewError(true));
    return () => {
      renderer.current = null;
      void subtitle.destroy();
    };
  }, [clipId, hasDocument, fonts.data]);

  useEffect(() => {
    if (!document || !draft) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api
        .preview(draft.id, document, controller.signal)
        .then(async (content) => {
          if (controller.signal.aborted) {
            return;
          }
          const subtitle = renderer.current;
          if (subtitle) {
            await subtitle.ready;
            if (controller.signal.aborted) {
              return;
            }
            await subtitle.renderer.setTrack(content);
            await subtitle.resize(true, size.width, size.height);
            setPreviewError(false);
          }
        })
        .catch((error: Error) => {
          if (error.name !== 'AbortError') {
            setPreviewError(true);
          }
        });
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft, document, size.width, size.height]);

  useEffect(() => {
    const video = primary.current;
    if (!video || !project) {
      return;
    }
    let handle = 0;
    let lastStoreUpdate = 0;
    let busy = false;
    const update = () => {
      const milliseconds = video.currentTime * 1000;
      if (milliseconds >= end && !video.paused) {
        video.pause();
        secondary.current?.pause();
      }
      if (performance.now() - lastStoreUpdate > 80) {
        useEditor.getState().setPlayhead(Math.max(0, milliseconds - start));
        lastStoreUpdate = performance.now();
      }
      const subtitle = renderer.current;
      if (subtitle && !busy) {
        busy = true;
        void subtitle.ready
          .then(() =>
            subtitle.manualRender(
              {
                expectedDisplayTime: performance.now(),
                width: size.width,
                height: size.height,
                mediaTime: Math.max(0, milliseconds - start) / 1000,
              },
              !playing,
            ),
          )
          .catch(() => setPreviewError(true))
          .finally(() => {
            busy = false;
          });
      }
      if (secondary.current && Math.abs(secondary.current.currentTime - video.currentTime) > 0.1) {
        secondary.current.currentTime = video.currentTime;
      }
      handle = requestAnimationFrame(update);
    };
    handle = requestAnimationFrame(update);
    return () => cancelAnimationFrame(handle);
  }, [project, start, end, size.width, size.height, playing]);

  function seek(milliseconds: number) {
    const value = Math.max(start, Math.min(end, milliseconds));
    if (primary.current) {
      primary.current.currentTime = value / 1000;
    }
    if (secondary.current) {
      secondary.current.currentTime = value / 1000;
    }
    useEditor.getState().setPlayhead(value - start);
  }

  async function togglePlay() {
    if (!primary.current) {
      return;
    }
    if (primary.current.paused) {
      if (primary.current.currentTime * 1000 >= end - 50) {
        seek(start);
      }
      await primary.current.play();
      await secondary.current?.play();
    } else {
      primary.current.pause();
      secondary.current?.pause();
    }
  }

  const source = project ? assetUrl(project.preview_asset_id ?? project.asset_id) : '';
  const split = document?.split_ratio ?? 0.3;
  const watermarkLoaded = watermarkSize?.id === document?.watermark.asset_id;
  const watermarkWidth =
    watermarkLoaded && watermarkSize
      ? Math.min(
          size.width * (document?.watermark.scale ?? 0.18),
          (size.height * watermarkSize.width) / watermarkSize.height,
        )
      : 0;
  const primaryRect = layout === 'gaming' ? document!.facecam_crop : crop;
  const fullCrop = { x: 0, y: 0, width: 1, height: 1 };
  return (
    <section className={styles.previewPanel} aria-label={text.source}>
      <div className={styles.previewTop}>
        <span>{project ? project.width + ' × ' + project.height : text.source}</span>
        <span>{text.offline}</span>
      </div>
      <div className={styles.previewStage}>
        {!project ? (
          <div className={styles.empty}>
            <FilmStripIcon className={styles.emptyIcon} aria-hidden="true" />
            <h2>{text.emptyTitle}</h2>
            <p>{text.emptyDetail}</p>
            <Button variant="primary" onClick={onImport}>
              {text.chooseFile}
            </Button>
          </div>
        ) : (
          <div
            ref={frame}
            className={styles.videoFrame}
            style={{ aspectRatio: aspect, maxWidth: aspect * 490 }}
          >
            {layout === 'blur' && (
              <div className={styles.videoRegion}>
                <video
                  ref={secondary}
                  src={source}
                  muted
                  playsInline
                  preload="metadata"
                  className={styles.sourceVideo}
                  style={{
                    ...videoStyle(project, fullCrop, size.width, size.height),
                    filter: 'blur(20px)',
                  }}
                  aria-hidden="true"
                >
                  <track kind="captions" src={captionsUrl} />
                </video>
              </div>
            )}
            <div
              className={styles.videoRegion}
              style={
                layout === 'gaming' ? { bottom: 'auto', height: split * 100 + '%' } : undefined
              }
            >
              <video
                ref={primary}
                src={source}
                playsInline
                preload="metadata"
                className={styles.sourceVideo}
                style={videoStyle(
                  project,
                  primaryRect,
                  size.width,
                  layout === 'gaming' ? size.height * split : size.height,
                  layout === 'contain' || layout === 'blur',
                )}
                onLoadedMetadata={() => {
                  setVideoError(null);
                  seek(start);
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setVideoError(project.id)}
                aria-label={project.name}
              >
                <track
                  kind="captions"
                  src={captionsUrl}
                  srcLang={project.language ?? 'en'}
                  label={text.captions}
                />
              </video>
            </div>
            {layout === 'gaming' && document && (
              <div className={styles.videoRegion} style={{ top: split * 100 + '%' }}>
                <video
                  ref={secondary}
                  src={source}
                  muted
                  playsInline
                  preload="metadata"
                  className={styles.sourceVideo}
                  style={videoStyle(
                    project,
                    document.gameplay_crop,
                    size.width,
                    size.height * (1 - split),
                  )}
                  aria-hidden="true"
                >
                  <track kind="captions" src={captionsUrl} />
                </video>
              </div>
            )}
            {document?.watermark.mode === 'image' && document.watermark.asset_id && (
              <img
                key={document.watermark.asset_id}
                src={assetUrl(document.watermark.asset_id)}
                alt=""
                className={styles.imageWatermark}
                onLoad={(event) => {
                  setWatermarkError(null);
                  setWatermarkSize({
                    id: document.watermark.asset_id!,
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                onError={() => setWatermarkError(document.watermark.asset_id ?? null)}
                style={{
                  left: document.watermark.x * 100 + '%',
                  top: document.watermark.y * 100 + '%',
                  width: watermarkWidth,
                  visibility: watermarkLoaded ? 'visible' : 'hidden',
                  opacity: document.watermark.opacity,
                  transform:
                    'translate(' +
                    -document.watermark.x * 100 +
                    '%, ' +
                    -document.watermark.y * 100 +
                    '%)',
                }}
              />
            )}
            {document && (
              <canvas
                key={clipId}
                ref={canvas}
                className={styles.subtitleCanvas}
                width={1080}
                height={1920}
                aria-hidden="true"
              />
            )}
            {document && ['portrait', 'square', 'landscape'].includes(layout) && (
              <CropHandle
                label={text.cropDrag}
                onMove={(horizontal, vertical) => {
                  useEditor.getState().change((edit) => {
                    const current = currentCrop(edit, playhead);
                    const x = Math.max(
                      0,
                      Math.min(1 - current.width, current.x + horizontal * current.width),
                    );
                    const y = Math.max(
                      0,
                      Math.min(1 - current.height, current.y + vertical * current.height),
                    );
                    if (edit.keyframes.length > 0 && playhead > 0) {
                      const time_ms = Math.round(playhead);
                      edit.keyframes = edit.keyframes.filter((key) => key.time_ms !== time_ms);
                      edit.keyframes.push({ time_ms, x, y });
                      edit.keyframes.sort((first, second) => first.time_ms - second.time_ms);
                    } else {
                      edit.crop.x = x;
                      edit.crop.y = y;
                    }
                  });
                }}
              />
            )}
          </div>
        )}
      </div>
      {project && videoError === project.id && (
        <p className={styles.error} role="alert">
          {text.videoError}
        </p>
      )}
      {document?.watermark.mode === 'image' &&
        document.watermark.asset_id &&
        watermarkError === document.watermark.asset_id && (
          <p className={styles.error} role="alert">
            {text.watermarkError}
          </p>
        )}
      {previewError && (
        <p className={styles.hint} role="status">
          {text.previewError}
        </p>
      )}
      {project && (
        <div className={styles.playerControls}>
          <div className={styles.playerButtons}>
            <Button
              variant="ghost"
              aria-label={text.undo + ' 5s'}
              onClick={() => seek(start + playhead - 5000)}
            >
              <ArrowCounterClockwiseIcon size={19} />
            </Button>
            <Button
              variant="primary"
              className={styles.playButton}
              aria-label={playing ? text.pause : text.play}
              onClick={() => void togglePlay().catch(() => setPreviewError(true))}
            >
              {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </Button>
            <Button
              variant="ghost"
              aria-label={text.redo + ' 5s'}
              onClick={() => seek(start + playhead + 5000)}
            >
              <ArrowClockwiseIcon size={19} />
            </Button>
          </div>
          <input
            type="range"
            min={0}
            max={end - start}
            step={10}
            value={Math.min(playhead, end - start)}
            aria-label={text.playhead}
            onChange={(event) => seek(start + Number(event.target.value))}
          />
          <span>
            {time(playhead)} / {time(end - start)}
          </span>
        </div>
      )}
    </section>
  );
}

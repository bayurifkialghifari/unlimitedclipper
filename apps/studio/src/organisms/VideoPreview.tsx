import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
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
import { sourceSegments } from '../lib/timeline';
import { usePreviewFrame } from '../hooks/use-preview-frame';

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

export function VideoPreview({
  project,
  onImport,
  active = true,
  mediaRef,
}: {
  project?: Project;
  onImport: () => void;
  active?: boolean;
  mediaRef?: RefObject<HTMLVideoElement | null>;
}) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const seekRequest = useEditor((state) => state.seekRequest);
  const stage = useRef<HTMLDivElement>(null);
  const sceneIndex = useRef(0);
  const frame = useRef<HTMLDivElement>(null);
  const internalVideo = useRef<HTMLVideoElement>(null);
  const primary = mediaRef ?? internalVideo;
  const secondary = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
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
  const segmentKey = JSON.stringify(
    document ? sourceSegments(document) : [{ start_ms: 0, end_ms: project?.duration_ms ?? 0 }],
  );
  const segments = useMemo(
    () => JSON.parse(segmentKey) as { start_ms: number; end_ms: number }[],
    [segmentKey],
  );
  const duration = segments.reduce((sum, scene) => sum + scene.end_ms - scene.start_ms, 0);
  const layout = document?.layout ?? 'landscape';
  const aspect = layout === 'square' ? 1 : layout === 'landscape' ? 16 / 9 : 9 / 16;
  const frameWidth = usePreviewFrame(stage, aspect);
  const crop = document ? currentCrop(document, playhead) : { x: 0, y: 0, width: 1, height: 1 };

  useEffect(() => {
    if (!frame.current) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [project?.id]);

  useEffect(() => {
    const position = Math.min(duration, useEditor.getState().playhead);
    let offset = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const scene = segments[index];
      const length = scene.end_ms - scene.start_ms;
      if (position < offset + length || index === segments.length - 1) {
        sceneIndex.current = index;
        const seconds = (scene.start_ms + position - offset) / 1000;
        for (const video of [primary.current, secondary.current]) {
          if (video) {
            video.currentTime = seconds;
            if (!active) {
              video.pause();
            }
          }
        }
        break;
      }
      offset += length;
    }
  }, [segments, duration, active, clipId, seekRequest, primary]);

  useEffect(() => {
    if (!canvas.current || !hasDocument || !fonts.data) {
      return;
    }
    const surface = window.document.createElement('canvas');
    surface.className = styles.subtitleCanvas;
    surface.width = 1080;
    surface.height = 1920;
    canvas.current.append(surface);
    const subtitle = new JASSUB({
      canvas: surface,
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
  }, [draft, document, size.width, size.height, fonts.data]);

  useEffect(() => {
    const video = primary.current;
    if (!video || !project || !active) {
      return;
    }
    let handle = 0;
    let lastStoreUpdate = 0;
    let busy = false;
    const update = () => {
      let scene = segments[sceneIndex.current];
      if (!scene) {
        return;
      }
      if (video.currentTime * 1000 >= scene.end_ms && (!video.paused || video.ended)) {
        if (sceneIndex.current < segments.length - 1) {
          sceneIndex.current += 1;
          scene = segments[sceneIndex.current];
          video.currentTime = scene.start_ms / 1000;
          if (video.paused) {
            void video.play().catch(() => setVideoError(project.id));
          }
        } else {
          video.pause();
          secondary.current?.pause();
        }
      }
      const offset = segments
        .slice(0, sceneIndex.current)
        .reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
      const milliseconds =
        offset +
        Math.max(
          0,
          Math.min(scene.end_ms - scene.start_ms, video.currentTime * 1000 - scene.start_ms),
        );
      if (performance.now() - lastStoreUpdate > 80) {
        useEditor.getState().setPlayhead(milliseconds);
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
                mediaTime: milliseconds / 1000,
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
  }, [project, segments, active, size.width, size.height, playing, primary]);

  function seek(milliseconds: number) {
    useEditor.getState().seekTo(Math.max(0, Math.min(duration, milliseconds)));
  }

  async function togglePlay() {
    if (!primary.current) {
      return;
    }
    if (primary.current.paused) {
      if (playhead >= duration - 50) {
        seek(0);
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
        <span>{text.sourcePreviewHint}</span>
      </div>
      <div ref={stage} className={styles.previewStage}>
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
            style={{ aspectRatio: aspect, width: frameWidth }}
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
                  seek(0);
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
              <div key={clipId} ref={canvas} className={styles.subtitleCanvas} aria-hidden="true" />
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
              onClick={() => seek(playhead - 5000)}
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
              onClick={() => seek(playhead + 5000)}
            >
              <ArrowClockwiseIcon size={19} />
            </Button>
          </div>
          <input
            type="range"
            min={0}
            max={duration}
            step={10}
            value={Math.min(playhead, duration)}
            aria-label={text.playhead}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>
            {time(playhead)} / {time(duration)}
          </span>
        </div>
      )}
    </section>
  );
}

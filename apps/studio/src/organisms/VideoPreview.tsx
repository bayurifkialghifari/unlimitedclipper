import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { PlayIcon, PauseIcon, FilmStripIcon } from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { AssRenderer } from '../lib/ass-renderer';
import {
  cameraAt,
  colorFilter,
  drawRegion,
  motionValuesAt,
  videoAdjustmentsAt,
} from '../lib/preview-drawing';
import { sourceSegments, introDuration, finalDuration } from '../lib/timeline';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { usePreviewFrame } from '../hooks/use-preview-frame';
import { CropHandle } from '../molecules/CropHandle';
import type { PreviewPlan, Project } from '../types';
import styles from '../styles/Studio.module.css';

const full = { x: 0, y: 0, width: 1, height: 1 };

function seekNarration(audio: HTMLAudioElement, positionMs: number) {
  if (audio.readyState >= 1 && Math.abs(audio.currentTime * 1000 - positionMs) > 150) {
    audio.currentTime = positionMs / 1000;
  }
}

export function VideoPreview({
  project,
  onImport,
  active = true,
  mediaRef,
  renderedAsset,
}: {
  project?: Project;
  onImport?: () => void;
  active?: boolean;
  mediaRef?: RefObject<HTMLVideoElement | null>;
  renderedAsset?: string;
}) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const selection = useEditor((state) => state.timelineSelection);
  const playhead = useEditor((state) => state.playhead);
  const seekRequest = useEditor((state) => state.seekRequest);
  const internalVideo = useRef<HTMLVideoElement>(null);
  const videoRef = mediaRef ?? internalVideo;
  const stage = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);
  const broll = useRef<HTMLVideoElement>(null);
  const introNarration = useRef<HTMLAudioElement>(null);
  const outroNarration = useRef<HTMLAudioElement>(null);
  const watermark = useRef<HTMLImageElement>(null);
  const sceneIndex = useRef(0);
  const renderer = useRef<AssRenderer | null>(null);
  const subtitle = useRef<ImageBitmap | null>(null);
  const repaint = useRef(0);
  const trackVersion = useRef(0);
  const outputPosition = useRef(0);
  const cardClock = useRef({ running: false, stamp: 0 });
  const [displayPosition, setDisplayPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captionError, setCaptionError] = useState(false);
  const [planned, setPlanned] = useState<{
    clipId: string;
    signature: string;
    plan: PreviewPlan;
  } | null>(null);
  const fonts = useQuery({ queryKey: ['fonts'], queryFn: api.fonts, enabled: Boolean(draft) });
  const brollAssets = useQuery({
    queryKey: ['broll-assets', project?.id],
    queryFn: () => api.brollAssets(project!.id),
    enabled: Boolean(project?.id),
  });
  const document = draft?.document;
  const signature = JSON.stringify(document);
  const activePlan =
    planned && planned.clipId === draft?.id && planned.signature === signature
      ? planned.plan
      : null;
  const selectedText =
    selection?.kind === 'visual'
      ? document?.visual_layers?.find(
          (layer) => layer.id === selection.id && ['text', 'note'].includes(layer.kind),
        )
      : null;
  const exact = Boolean(renderedAsset);
  const segmentKey = JSON.stringify(
    document ? sourceSegments(document) : [{ start_ms: 0, end_ms: project?.duration_ms ?? 0 }],
  );
  const segments = useMemo(
    () => JSON.parse(segmentKey) as { start_ms: number; end_ms: number }[],
    [segmentKey],
  );
  const duration = segments.reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
  const intro = document ? introDuration(document) : 0;
  const final = document ? finalDuration(document) : duration;
  const layout = document?.layout ?? 'landscape';
  const aspect = layout === 'square' ? 1 : layout === 'landscape' ? 16 / 9 : 9 / 16;
  const frameWidth = usePreviewFrame(stage, aspect);
  const width = Math.round(aspect >= 1 ? 720 : 720 * aspect);
  const height = Math.round(aspect >= 1 ? 720 / aspect : 720);
  const source = renderedAsset ?? project?.preview_asset_id ?? project?.asset_id;
  const loaded = Boolean(source && loadedSource === source);
  const clipId = draft?.id;
  const roll =
    !exact &&
    document?.visual_layers
      ?.filter(
        (layer) =>
          layer.enabled &&
          layer.kind === 'broll' &&
          layer.start_ms <= playhead &&
          layer.end_ms > playhead,
      )
      .at(-1);
  const rollSource =
    roll && roll.asset_id
      ? (brollAssets.data?.find((asset) => asset.asset_id === roll.asset_id)?.preview_asset_id ??
        roll.asset_id)
      : null;

  useEffect(() => {
    sceneIndex.current = 0;
    cardClock.current.running = false;
    introNarration.current?.pause();
    outroNarration.current?.pause();
  }, [source, draft?.id]);

  useEffect(() => {
    const position = outputPosition.current;
    const inIntro = !exact && position < intro;
    const inOutro = !exact && position >= intro + duration;
    const selected = inIntro ? introNarration.current : inOutro ? outroNarration.current : null;
    for (const audio of [introNarration.current, outroNarration.current]) {
      if (audio && audio !== selected) {
        audio.pause();
      }
    }
    if (!selected || !active) {
      selected?.pause();
      return;
    }
    const localPosition = inIntro ? position : position - intro - duration;
    seekNarration(selected, localPosition);
    if (cardClock.current.running && selected.paused) {
      void selected.play().catch(() => setError(text.narrationPlaybackError));
    } else if (!cardClock.current.running) {
      selected.pause();
    }
  }, [active, exact, displayPosition, intro, duration, document, text.narrationPlaybackError]);

  useEffect(() => {
    repaint.current += 1;
  }, [document, roll, width, height]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!active) {
      cardClock.current.running = false;
      video.pause();
      broll.current?.pause();
      return;
    }
    const request = useEditor.getState().seekRequest;
    const position = Math.min(duration, useEditor.getState().playhead);
    const output = request?.outputPositionMs ?? (request ? position + intro : 0);
    outputPosition.current = Math.min(final, output);
    cardClock.current.stamp = performance.now();
    setDisplayPosition(outputPosition.current);
    if (exact) {
      video.currentTime = outputPosition.current / 1000;
      return;
    }
    if (output < intro || output >= intro + duration) {
      video.pause();
    }
    let offset = 0;
    for (const [index, scene] of segments.entries()) {
      const length = scene.end_ms - scene.start_ms;
      if (position < offset + length || index === segments.length - 1) {
        sceneIndex.current = index;
        video.currentTime = (scene.start_ms + position - offset) / 1000;
        break;
      }
      offset += length;
    }
  }, [
    segments,
    duration,
    intro,
    final,
    active,
    exact,
    source,
    draft?.id,
    seekRequest,
    loaded,
    videoRef,
  ]);

  useEffect(() => {
    if (!clipId || !fonts.data || exact) {
      return;
    }
    const current = new AssRenderer(fonts.data);
    renderer.current = current;
    let disposed = false;
    void current.ready.catch(() => {
      if (!disposed) {
        setCaptionError(true);
      }
    });
    return () => {
      disposed = true;
      renderer.current = null;
      subtitle.current?.close();
      subtitle.current = null;
      current.destroy();
    };
  }, [clipId, fonts.data, exact]);

  useEffect(() => {
    if (!draft || exact || !renderer.current) {
      return;
    }
    trackVersion.current += 1;
    const current = renderer.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api
        .previewPlan(draft, controller.signal)
        .then(async (plan) => {
          if (controller.signal.aborted || renderer.current !== current) {
            return;
          }
          setPlanned({ clipId: draft.id, signature: JSON.stringify(draft.document), plan });
          await current.setTrack(plan.graphics);
          if (!controller.signal.aborted) {
            subtitle.current?.close();
            subtitle.current = null;
            repaint.current += 1;
            setCaptionError(false);
          }
        })
        .catch((failure: Error) => {
          if (!controller.signal.aborted && failure.name !== 'AbortError') {
            setCaptionError(true);
          }
        });
    }, 100);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft, fonts.data, exact]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = surface.current;
    if (!video || !canvas || !project || !active) {
      return;
    }
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setError(text.videoError);
      return;
    }
    let handle = 0;
    let lastUpdate = 0;
    let lastDraw = '';
    let lastSubtitle = '';
    let subtitleBusy = false;
    let disposed = false;
    function update() {
      handle = requestAnimationFrame(update);
      if (video!.readyState < 2 || video!.seeking || performance.now() - lastUpdate < 33) {
        return;
      }
      let scene = segments[sceneIndex.current];
      if (!scene) {
        return;
      }
      const inCard =
        !exact && (outputPosition.current < intro || outputPosition.current >= intro + duration);
      const previousOutput = outputPosition.current;
      if (inCard && cardClock.current.running) {
        outputPosition.current = Math.min(
          final,
          previousOutput + performance.now() - cardClock.current.stamp,
        );
        if (previousOutput < intro && outputPosition.current >= intro) {
          outputPosition.current = intro;
          sceneIndex.current = 0;
          scene = segments[0];
          video!.currentTime = scene.start_ms / 1000;
          void video!.play().catch(() => setError(text.videoError));
        }
        if (outputPosition.current >= final) {
          cardClock.current.running = false;
          setPlaying(false);
        }
      }
      cardClock.current.stamp = performance.now();
      if (
        !exact &&
        !inCard &&
        video!.currentTime * 1000 >= scene.end_ms &&
        (!video!.paused || video!.ended)
      ) {
        if (sceneIndex.current < segments.length - 1) {
          scene = segments[++sceneIndex.current];
          video!.currentTime = scene.start_ms / 1000;
          if (video!.paused) {
            void video!.play().catch(() => setError(text.videoError));
          }
          return;
        }
        outputPosition.current = intro + duration;
        video!.pause();
        if (final > intro + duration) {
          cardClock.current.running = true;
          setPlaying(true);
        }
      }
      const offset = segments
        .slice(0, sceneIndex.current)
        .reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
      const position = exact
        ? Math.max(0, Math.min(duration, video!.currentTime * 1000 - intro))
        : inCard
          ? Math.max(0, Math.min(duration, outputPosition.current - intro))
          : offset +
            Math.max(
              0,
              Math.min(scene.end_ms - scene.start_ms, video!.currentTime * 1000 - scene.start_ms),
            );
      if (exact) {
        outputPosition.current = video!.currentTime * 1000;
      } else if (!inCard) {
        outputPosition.current = position + intro;
      }
      const output = outputPosition.current;
      const card =
        !exact && document
          ? output < intro
            ? document.intro_card
            : output >= intro + duration
              ? document.outro_card
              : null
          : null;
      setDisplayPosition(output);
      if (Math.abs(useEditor.getState().playhead - position) > 15) {
        useEditor.getState().setPlayhead(position);
      }
      lastUpdate = performance.now();
      const identity = output + ':' + video!.currentTime + ':' + repaint.current;
      if (identity === lastDraw) {
        return;
      }
      lastDraw = identity;
      context!.filter = 'none';
      context!.fillStyle = card?.background ?? '#000000';
      context!.fillRect(0, 0, width, height);
      context!.filter = exact ? 'none' : colorFilter(document, position);
      if (card) {
        context!.filter = 'none';
      } else if (exact || !document) {
        drawRegion(context!, video!, full, 0, 0, width, height);
      } else if (layout === 'gaming') {
        const split = height * document.split_ratio;
        drawRegion(context!, video!, document.facecam_crop, 0, 0, width, split);
        drawRegion(context!, video!, document.gameplay_crop, 0, split, width, height - split);
      } else {
        const splitLayer = document.visual_layers?.find(
          (layer) =>
            layer.enabled &&
            layer.kind === 'split' &&
            layer.start_ms <= position &&
            layer.end_ms > position,
        );
        const punch = document.visual_layers?.find(
          (layer) =>
            layer.enabled &&
            layer.kind === 'punch_in' &&
            layer.start_ms <= position &&
            layer.end_ms > position,
        );
        if (splitLayer?.crop && splitLayer.secondary_crop) {
          drawRegion(context!, video!, splitLayer.crop, 0, 0, width, height / 2);
          drawRegion(context!, video!, splitLayer.secondary_crop, 0, height / 2, width, height / 2);
        } else {
          if (layout === 'blur') {
            context!.filter = colorFilter(document, position) + ' blur(18px)';
            drawRegion(context!, video!, full, 0, 0, width, height);
            context!.filter = colorFilter(document, position);
          }
          drawRegion(
            context!,
            video!,
            punch?.crop ?? cameraAt(document, position, activePlan?.camera_motion),
            0,
            0,
            width,
            height,
            layout === 'contain' || layout === 'blur',
          );
        }
      }
      if (!card && roll && broll.current && broll.current.readyState >= 2) {
        const rollTime = ((roll.source_start_ms ?? 0) + position - roll.start_ms) / 1000;
        if (Math.abs(broll.current.currentTime - rollTime) > 0.1) {
          broll.current.currentTime = rollTime;
        }
        const curve = activePlan?.layer_motion[roll.id];
        const values = curve ? motionValuesAt(curve, position) : [0.5, 0.5, 1, 1];
        const zoom = values[2];
        const cropWidth = 1 / zoom;
        const left = Math.max(0, Math.min(1 - cropWidth, values[0] - cropWidth / 2));
        const top = Math.max(0, Math.min(1 - cropWidth, values[1] - cropWidth / 2));
        context!.save();
        context!.beginPath();
        context!.rect(0, 0, width, height);
        context!.clip();
        context!.globalAlpha = values[3];
        context!.scale(zoom, zoom);
        context!.translate(-left * width, -top * height);
        drawRegion(context!, broll.current, full, 0, 0, width, height);
        context!.restore();
      }
      context!.filter = 'none';
      const warmth = videoAdjustmentsAt(document, position)?.warmth ?? 0;
      if (!exact && !card && warmth) {
        context!.fillStyle = warmth > 0 ? 'rgba(255, 146, 40, 0.10)' : 'rgba(30, 130, 255, 0.10)';
        context!.globalAlpha = Math.abs(warmth) / 100;
        context!.fillRect(0, 0, width, height);
        context!.globalAlpha = 1;
      }
      if (
        !exact &&
        !card &&
        watermark.current?.complete &&
        watermark.current.naturalWidth &&
        document
      ) {
        const mark = document.watermark;
        const image = watermark.current;
        const markWidth = Math.min(
          width * mark.scale,
          (height * image.naturalWidth) / image.naturalHeight,
        );
        const markHeight = (markWidth * image.naturalHeight) / image.naturalWidth;
        context!.globalAlpha = mark.opacity;
        context!.drawImage(
          image,
          (width - markWidth) * mark.x,
          (height - markHeight) * mark.y,
          markWidth,
          markHeight,
        );
        context!.globalAlpha = 1;
      }
      if (!exact && subtitle.current) {
        context!.drawImage(subtitle.current, 0, 0, width, height);
      }
      if (!exact && !card && document?.scene_transitions?.length) {
        let boundary = 0;
        for (const [index, scene] of sourceSegments(document).entries()) {
          if (index > 0) {
            const transition = document.scene_transitions.find(
              (item) => item.incoming_scene_id === scene.id,
            );
            if (transition) {
              const distance = Math.abs(position - boundary);
              const half = transition.duration_ms / 2;
              if (distance < half) {
                context!.globalAlpha = 1 - distance / half;
                context!.fillStyle = '#000000';
                context!.fillRect(0, 0, width, height);
                context!.globalAlpha = 1;
              }
            }
          }
          boundary += scene.end_ms - scene.start_ms;
        }
      }
      const current = renderer.current;
      const version = trackVersion.current;
      const subtitleKey = output + ':' + repaint.current;
      if (current && !subtitleBusy && subtitleKey !== lastSubtitle) {
        subtitleBusy = true;
        lastSubtitle = subtitleKey;
        void current
          .frame(output / 1000, width, height)
          .then((bitmap) => {
            if (disposed || renderer.current !== current || version !== trackVersion.current) {
              bitmap.close();
              return;
            }
            subtitle.current?.close();
            subtitle.current = bitmap;
            lastDraw = '';
          })
          .catch(() => {
            if (!disposed) {
              setCaptionError(true);
            }
          })
          .finally(() => {
            subtitleBusy = false;
          });
      }
    }
    handle = requestAnimationFrame(update);
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
    };
  }, [
    project,
    document,
    segments,
    active,
    exact,
    intro,
    final,
    activePlan,
    duration,
    width,
    height,
    roll,
    videoRef,
    text.videoError,
    layout,
  ]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const inCard =
      !exact && (outputPosition.current < intro || outputPosition.current >= intro + duration);
    if (inCard && outputPosition.current < final - 10) {
      cardClock.current.running = !cardClock.current.running;
      cardClock.current.stamp = performance.now();
      setPlaying(cardClock.current.running);
      const audio =
        outputPosition.current < intro ? introNarration.current : outroNarration.current;
      if (audio) {
        seekNarration(
          audio,
          outputPosition.current < intro
            ? outputPosition.current
            : outputPosition.current - intro - duration,
        );
        if (cardClock.current.running) {
          void audio.play().catch(() => setError(text.narrationPlaybackError));
        } else {
          audio.pause();
        }
      }
      return;
    }
    if (video.paused) {
      if (outputPosition.current >= final - 50) {
        useEditor.getState().seekTo(0, 0);
        outputPosition.current = 0;
        video.currentTime = exact ? 0 : segments[0].start_ms / 1000;
        if (!exact && intro > 0) {
          cardClock.current.running = true;
          cardClock.current.stamp = performance.now();
          setPlaying(true);
          return;
        }
      }
      await video.play();
      await broll.current?.play();
    } else {
      video.pause();
      broll.current?.pause();
    }
  }

  return (
    <section className={styles.previewPanel} aria-label={text.previewVideo}>
      <div className={styles.previewTop}>
        <span>{exact ? text.editedPreview : text.livePreview}</span>
      </div>
      <div ref={stage} className={styles.previewStage}>
        {!project ? (
          <div className={styles.empty}>
            <FilmStripIcon className={styles.emptyIcon} aria-hidden="true" />
            <h2>{text.emptyTitle}</h2>
            {onImport && (
              <Button variant="primary" onClick={onImport}>
                {text.chooseFile}
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.videoFrame} style={{ aspectRatio: aspect, width: frameWidth }}>
            <canvas
              ref={surface}
              width={width}
              height={height}
              className={styles.composedCanvas}
              aria-label={project.name}
            />
            <video
              ref={videoRef}
              src={source ? assetUrl(source) : undefined}
              className={styles.previewDecoder}
              playsInline
              preload="auto"
              aria-hidden="true"
              onLoadStart={() => {
                setLoadedSource(null);
                setError(null);
                setPlaying(false);
              }}
              onLoadedData={() => setLoadedSource(source ?? null)}
              onPlay={() => {
                cardClock.current.running = true;
                setPlaying(true);
              }}
              onPause={() => {
                if (
                  exact ||
                  (outputPosition.current >= intro && outputPosition.current < intro + duration)
                ) {
                  cardClock.current.running = false;
                  setPlaying(false);
                }
              }}
              onEnded={() => {
                if (exact || final === intro + duration) {
                  setPlaying(false);
                }
              }}
              onError={() => setError(text.videoError)}
            >
              <track kind="captions" />
            </video>
            {!exact && document?.intro_card?.narration && (
              <audio
                ref={introNarration}
                src={assetUrl(document.intro_card.narration.asset_id)}
                preload="auto"
                aria-hidden="true"
                onError={() => setError(text.narrationPlaybackError)}
              >
                <track kind="captions" />
              </audio>
            )}
            {!exact && document?.outro_card?.narration && (
              <audio
                ref={outroNarration}
                src={assetUrl(document.outro_card.narration.asset_id)}
                preload="auto"
                aria-hidden="true"
                onError={() => setError(text.narrationPlaybackError)}
              >
                <track kind="captions" />
              </audio>
            )}
            {rollSource && (
              <video
                key={rollSource}
                ref={broll}
                src={assetUrl(rollSource)}
                className={styles.previewDecoder}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                onLoadedData={() => {
                  repaint.current += 1;
                  if (playing) {
                    void broll.current?.play().catch(() => setError(text.videoError));
                  }
                }}
                onError={() => setError(text.videoError)}
              >
                <track kind="captions" />
              </video>
            )}
            {!exact && document?.watermark.mode === 'image' && document.watermark.asset_id && (
              <img
                ref={watermark}
                src={assetUrl(document.watermark.asset_id)}
                alt=""
                className={styles.previewDecoder}
                onLoad={() => {
                  repaint.current += 1;
                }}
                onError={() => setError(text.videoError)}
              />
            )}
            {!loaded && !error && (
              <p role="status" className={styles.previewLoading}>
                {text.previewLoadingVideo}
              </p>
            )}
            {!exact &&
              document &&
              displayPosition >= intro &&
              displayPosition < intro + duration &&
              selectedText &&
              selectedText.start_ms <= playhead &&
              selectedText.end_ms > playhead && (
                <CropHandle
                  label={text.textMotionDrag}
                  pointerDirection="move"
                  onMove={(horizontal, vertical) => {
                    useEditor.getState().change((edit) => {
                      const layer = edit.visual_layers?.find((item) => item.id === selectedText.id);
                      if (!layer) {
                        return;
                      }
                      const time_ms = Math.round(playhead);
                      const current = layer.motion?.find((key) => key.time_ms === time_ms);
                      if (layer.motion?.length) {
                        const plan =
                          planned?.clipId === draft?.id
                            ? planned.plan.layer_motion[selectedText.id]
                            : null;
                        const values = plan ? motionValuesAt(plan, playhead) : null;
                        layer.motion = layer.motion.filter((key) => key.time_ms !== time_ms);
                        layer.motion.push({
                          time_ms,
                          x: Math.max(
                            0,
                            Math.min(1, (current?.x ?? values?.[0] ?? layer.x) + horizontal),
                          ),
                          y: Math.max(
                            0,
                            Math.min(1, (current?.y ?? values?.[1] ?? layer.y) + vertical),
                          ),
                          scale: current?.scale ?? values?.[2] ?? 1,
                          opacity: current?.opacity ?? values?.[3] ?? 1,
                          easing: current?.easing ?? { kind: 'linear' },
                        });
                        layer.motion.sort((first, second) => first.time_ms - second.time_ms);
                        return;
                      }
                      layer.x = Math.max(0, Math.min(1, layer.x + horizontal));
                      layer.y = Math.max(0, Math.min(1, layer.y + vertical));
                    });
                  }}
                />
              )}
            {!exact &&
              document &&
              !selectedText &&
              displayPosition >= intro &&
              displayPosition < intro + duration &&
              ['portrait', 'square', 'landscape'].includes(layout) && (
                <CropHandle
                  label={text.cropDrag}
                  onMove={(horizontal, vertical) => {
                    useEditor.getState().change((edit) => {
                      const motion =
                        planned?.clipId === draft?.id ? planned.plan.camera_motion : null;
                      const crop = cameraAt(edit, playhead, activePlan?.camera_motion ?? motion);
                      if (edit.camera_motion?.length) {
                        const time_ms = Math.round(playhead);
                        const existing = edit.camera_motion.find((key) => key.time_ms === time_ms);
                        const values = motion ? motionValuesAt(motion.curve, time_ms) : null;
                        const zoom = existing?.zoom ?? values?.[2] ?? 1;
                        const centerX = existing?.x ?? values?.[0] ?? crop.x + crop.width / 2;
                        const centerY = existing?.y ?? values?.[1] ?? crop.y + crop.height / 2;
                        edit.camera_motion = edit.camera_motion.filter(
                          (key) => key.time_ms !== time_ms,
                        );
                        edit.camera_motion.push({
                          time_ms,
                          x: Math.max(0, Math.min(1, centerX + horizontal * crop.width)),
                          y: Math.max(0, Math.min(1, centerY + vertical * crop.height)),
                          zoom,
                          easing: existing?.easing ?? { kind: 'linear' },
                        });
                        edit.camera_motion.sort((first, second) => first.time_ms - second.time_ms);
                        return;
                      }
                      const x = Math.max(
                        0,
                        Math.min(1 - crop.width, crop.x + horizontal * crop.width),
                      );
                      const y = Math.max(
                        0,
                        Math.min(1 - crop.height, crop.y + vertical * crop.height),
                      );
                      if (edit.keyframes.length && playhead > 0) {
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
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {captionError && (
        <p role="status" className={styles.hint}>
          {text.previewError}
        </p>
      )}
      {project && (
        <div className={styles.playerControls}>
          <Button
            variant="primary"
            aria-label={playing ? text.pause : text.play}
            onClick={() => void togglePlay().catch(() => setError(text.videoError))}
          >
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </Button>
          <input
            type="range"
            min={0}
            max={final}
            step={10}
            value={Math.min(displayPosition, final)}
            aria-label={text.playhead}
            onChange={(event) => {
              const output = Number(event.target.value);
              useEditor.getState().seekTo(Math.max(0, Math.min(duration, output - intro)), output);
            }}
          />
          <span>
            {time(displayPosition)} / {time(final)}
          </span>
        </div>
      )}
    </section>
  );
}

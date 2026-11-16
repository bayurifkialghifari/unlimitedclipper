import { Fragment, useEffect, useRef, useState } from 'react';
import { Button, Toggle } from '@unlimitedclipper/ui';
import {
  ScissorsIcon,
  TrashIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsOutSimpleIcon,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { identifiedSegments, outputDuration } from '../lib/timeline';
import { useTimelineRemap } from '../hooks/use-timeline-remap';
import { useStoryboardFrames } from '../hooks/use-storyboard-frames';
import { TimelineItem, type TimelineGesture } from '../molecules/TimelineItem';
import { api, assetUrl } from '../lib/api';
import { fitAudioFades } from '../lib/audio-placement';
import { retimeLayerMotion } from '../lib/layer-motion';
import { sceneFrameTimes, timelineTicks, timelineTime } from '../lib/timeline-presentation';
import type { SourceSegment } from '../types';
import styles from '../styles/Editor.module.css';

type Kind = 'scene' | 'visual' | 'audio';
type Gesture = { kind: Kind; id: string; mode: TimelineGesture; delta: number; snapshot: string };

export function VisualTimeline({ sourceDuration }: { sourceDuration: number }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const selected = useEditor((state) => state.timelineSelection);
  const selectedWords = useEditor((state) => state.selectedWords);
  const { remap, pending, supported } = useTimelineRemap();
  const [zoom, setZoom] = useState(1);
  const [snapping, setSnapping] = useState(true);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const wordAnchor = useRef<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const audio = useQuery({ queryKey: ['audio-assets'], queryFn: api.audioAssets });
  const sampleGroups = draft ? sceneFrameTimes(draft.document) : new Map<string, number[]>();
  const sourceTimes = [...sampleGroups.values()].flat();
  const storyboard = useStoryboardFrames(draft?.project_id, sourceTimes);

  useEffect(() => {
    const element = viewport.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(100, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setSnapping((value) => !value);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  if (!draft) {
    return null;
  }
  const document = draft.document;
  const scenes = identifiedSegments(document);
  const duration = outputDuration(document);
  const labelWidth = width < 600 ? 104 : 132;
  const contentWidth = Math.max(100, width - labelWidth);
  const trackWidth = Math.max(width < 600 ? 520 : 100, contentWidth * zoom);
  const scale = Math.max(0.001, trackWidth / duration);
  const ruler = timelineTicks(duration, trackWidth);
  const selectedIndex =
    selected?.kind === 'scene' ? scenes.findIndex((scene) => scene.id === selected.id) : -1;
  const boundaries = [
    0,
    duration,
    playhead,
    ...document.words.flatMap((word) => [word.start_ms, word.end_ms]),
  ];
  let cursor = 0;
  for (const scene of scenes) {
    boundaries.push(cursor);
    cursor += scene.end_ms - scene.start_ms;
  }

  function snap(value: number) {
    if (!snapping) {
      return Math.round(value);
    }
    const closest = boundaries.reduce(
      (best, point) => (Math.abs(point - value) < Math.abs(best - value) ? point : best),
      value + 9 / scale,
    );
    return Math.round(Math.abs(closest - value) <= 8 / scale ? closest : value);
  }

  function sceneCandidate(current: Gesture): SourceSegment[] {
    const next = structuredClone(scenes);
    const index = next.findIndex((scene) => scene.id === current.id);
    if (index < 0) {
      return next;
    }
    const scene = next[index];
    const outputStart = next
      .slice(0, index)
      .reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
    if (current.mode === 'move') {
      const midpoint = outputStart + (scene.end_ms - scene.start_ms) / 2 + current.delta;
      let position = 0;
      let start = 0;
      for (const item of next) {
        const length = item.end_ms - item.start_ms;
        if (midpoint > start + length / 2) {
          position += 1;
        }
        start += length;
      }
      next.splice(index, 1);
      position = Math.max(0, Math.min(next.length, position > index ? position - 1 : position));
      if (position === index && current.delta !== 0) {
        position = Math.max(0, Math.min(next.length, index + Math.sign(current.delta)));
      }
      next.splice(position, 0, scene);
    } else {
      const earlier = scenes.filter(
        (item) => item.id !== scene.id && item.end_ms <= scene.start_ms,
      );
      const later = scenes.filter((item) => item.id !== scene.id && item.start_ms >= scene.end_ms);
      if (current.mode === 'start') {
        const delta = snap(outputStart + current.delta) - outputStart;
        scene.start_ms = Math.max(
          0,
          ...earlier.map((item) => item.end_ms),
          Math.min(scene.end_ms - 1, scene.start_ms + delta),
        );
      } else {
        const outputEnd = outputStart + scene.end_ms - scene.start_ms;
        const delta = snap(outputEnd + current.delta) - outputEnd;
        scene.end_ms = Math.min(
          sourceDuration,
          ...later.map((item) => item.start_ms),
          Math.max(scene.start_ms + 1, scene.end_ms + delta),
        );
      }
    }
    return next;
  }

  function layerCandidate(current: Gesture) {
    const layer =
      current.kind === 'visual'
        ? document.visual_layers?.find((item) => item.id === current.id)
        : document.audio_layers?.find((item) => item.id === current.id);
    if (!layer) {
      return null;
    }
    const next = { ...layer };
    const media =
      projects.data?.find((item) => item.asset_id === layer.asset_id)?.duration_ms ??
      audio.data?.find((item) => item.asset_id === layer.asset_id)?.duration_ms;
    const sourceTimed = current.kind === 'audio' || ('kind' in layer && layer.kind === 'broll');
    const length = layer.end_ms - layer.start_ms;
    if (current.mode === 'move') {
      next.start_ms = Math.max(
        0,
        Math.min(duration - length, snap(layer.start_ms + current.delta)),
      );
      next.end_ms = next.start_ms + length;
    } else if (current.mode === 'start') {
      next.start_ms = Math.max(0, Math.min(layer.end_ms - 1, snap(layer.start_ms + current.delta)));
      if (current.kind === 'audio' && !layer.asset_id) {
        next.start_ms = Math.max(next.start_ms, layer.end_ms - 500);
      }
      if (sourceTimed && layer.asset_id) {
        next.start_ms = Math.max(next.start_ms, layer.start_ms - (layer.source_start_ms ?? 0));
        next.source_start_ms = (layer.source_start_ms ?? 0) + next.start_ms - layer.start_ms;
      }
    } else {
      const maximum =
        sourceTimed && layer.asset_id
          ? (media ?? length + (layer.source_start_ms ?? 0)) - (layer.source_start_ms ?? 0)
          : Infinity;
      const tap = current.kind === 'audio' && !layer.asset_id ? 500 : Infinity;
      next.end_ms = Math.max(
        layer.start_ms + 1,
        Math.min(
          duration,
          layer.start_ms + maximum,
          layer.start_ms + tap,
          snap(layer.end_ms + current.delta),
        ),
      );
    }
    return next;
  }

  function preview(kind: Kind, id: string, mode: TimelineGesture, delta: number | null) {
    if (delta === null) {
      setGesture(null);
      return;
    }
    const next = {
      kind,
      id,
      mode,
      delta,
      snapshot:
        delta === 0
          ? JSON.stringify(document)
          : (gestureRef.current?.snapshot ?? JSON.stringify(document)),
    };
    gestureRef.current = next;
    setGesture(next);
  }

  function commit(kind: Kind, id: string, mode: TimelineGesture, delta: number) {
    const snapshot = gestureRef.current?.snapshot;
    gestureRef.current = null;
    if (snapshot && JSON.stringify(useEditor.getState().draft?.document) !== snapshot) {
      useEditor.setState({ error: text.proposalConflict });
      return;
    }
    const current = { kind, id, mode, delta, snapshot: snapshot ?? '' };
    if (kind === 'scene') {
      void remap(sceneCandidate(current));
    } else {
      const next = layerCandidate(current);
      if (next) {
        useEditor.getState().change((edit) => {
          const layer =
            kind === 'visual'
              ? edit.visual_layers?.find((item) => item.id === id)
              : edit.audio_layers?.find((item) => item.id === id);
          if (layer) {
            if (kind === 'visual' && 'motion' in layer) {
              retimeLayerMotion(layer, next.start_ms, next.end_ms, mode === 'move');
            }
            Object.assign(layer, next);
            if (kind === 'audio' && 'gain' in layer) {
              fitAudioFades(layer);
            }
          }
        });
      }
    }
  }

  function reorder(direction: number) {
    if (selectedIndex < 0) {
      return;
    }
    const next = [...scenes];
    const destination = Math.max(0, Math.min(next.length - 1, selectedIndex + direction));
    const [scene] = next.splice(selectedIndex, 1);
    next.splice(destination, 0, scene);
    void remap(next);
  }

  function split() {
    let offset = 0;
    const next = scenes.flatMap((scene) => {
      const length = scene.end_ms - scene.start_ms;
      const local = Math.round(playhead - offset);
      offset += length;
      if (local <= 0 || local >= length) {
        return [scene];
      }
      return [
        { ...scene, end_ms: scene.start_ms + local },
        { ...scene, id: crypto.randomUUID(), start_ms: scene.start_ms + local },
      ];
    });
    if (next.length !== scenes.length) {
      void remap(next);
    }
  }

  function item(
    kind: Kind,
    id: string,
    label: string,
    start: number,
    end: number,
    frames?: { sourceTimeMs: number; url?: string }[],
    sourceRange?: string,
  ) {
    const candidate =
      gesture?.kind === kind && gesture.id === id && kind !== 'scene'
        ? layerCandidate(gesture)
        : null;
    return (
      <TimelineItem
        key={id}
        label={label}
        start={candidate?.start_ms ?? start}
        end={candidate?.end_ms ?? end}
        scale={scale}
        selected={selected?.kind === kind && selected.id === id}
        frames={frames}
        sourceRange={sourceRange}
        disabled={pending || (kind === 'scene' && !supported)}
        onSelect={() => useEditor.setState({ timelineSelection: { kind, id } })}
        onPreview={(mode, delta) => preview(kind, id, mode, delta)}
        onCommit={(mode, delta) => commit(kind, id, mode, delta)}
      />
    );
  }

  function seekOnRuler(clientX: number, element: HTMLDivElement) {
    const position = Math.round((clientX - element.getBoundingClientRect().left) / scale);
    useEditor.getState().seekTo(Math.max(0, Math.min(duration, position)));
  }

  const displayed = gesture?.kind === 'scene' ? sceneCandidate(gesture) : scenes;
  const preparingFrames = [...storyboard.frames.values()].some(
    (frame) => frame.status === 'pending',
  );
  const failedFrames = [...storyboard.frames.values()].some((frame) => frame.status === 'failed');
  return (
    <section className={styles.timeline} aria-label={text.timeline}>
      <div className={styles.timelineToolbar}>
        <strong>{text.timeline}</strong>
        <Button
          aria-label={text.splitScene}
          disabled={
            pending || !supported || scenes.length >= 32 || playhead <= 0 || playhead >= duration
          }
          onClick={split}
        >
          <ScissorsIcon />
        </Button>
        <Button
          aria-label={text.deleteScene}
          disabled={pending || selectedIndex < 0 || scenes.length === 1 || !supported}
          onClick={() => void remap(scenes.filter((_, index) => index !== selectedIndex))}
        >
          <TrashIcon />
        </Button>
        <Button
          aria-label={text.moveEarlier}
          disabled={pending || selectedIndex <= 0 || !supported}
          onClick={() => reorder(-1)}
        >
          <ArrowLeftIcon />
        </Button>
        <Button
          aria-label={text.moveLater}
          disabled={
            pending || selectedIndex < 0 || selectedIndex === scenes.length - 1 || !supported
          }
          onClick={() => reorder(1)}
        >
          <ArrowRightIcon />
        </Button>
        <Toggle label={text.snapping} checked={snapping} onChange={setSnapping} />
        <div className={styles.timelineZoom}>
          <Button
            aria-label={text.zoomOut}
            disabled={zoom <= 1}
            onClick={() => setZoom(Math.max(1, zoom / 2))}
          >
            <MagnifyingGlassMinusIcon />
          </Button>
          <Button aria-label={text.fitTimeline} onClick={() => setZoom(1)}>
            <ArrowsOutSimpleIcon />
          </Button>
          <Button
            aria-label={text.zoomIn}
            disabled={zoom >= 16}
            onClick={() => setZoom(Math.min(16, zoom * 2))}
          >
            <MagnifyingGlassPlusIcon />
          </Button>
        </div>
        <span role="status">
          {pending
            ? text.running
            : timelineTime(playhead, true) + ' / ' + timelineTime(duration, true)}
        </span>
      </div>
      <p className={styles.timelineHint}>{supported ? text.timelineHelp : text.sceneUpgrade}</p>
      {(preparingFrames || storyboard.loading) && (
        <p className={styles.timelineHint} role="status">
          {text.framesPreparing}
        </p>
      )}
      {failedFrames && (
        <div className={styles.timelineNotice} role="alert">
          <span>{text.framesFailed}</span>
          <Button
            onClick={() => {
              setFrameError(null);
              void storyboard
                .retryFailed()
                .catch((failure: Error) => setFrameError(failure.message));
            }}
          >
            {text.retry}
          </Button>
        </div>
      )}
      {frameError && (
        <p className={styles.timelineNotice} role="alert">
          {frameError}
        </p>
      )}
      {storyboard.error && (
        <div className={styles.timelineNotice} role="alert">
          <span>{storyboard.error.message}</span>
          <Button onClick={() => void storyboard.refetch()}>{text.retry}</Button>
        </div>
      )}
      <div className={styles.trackViewport} ref={viewport}>
        <div
          className={styles.tracks}
          style={
            {
              width: labelWidth + trackWidth,
              '--track-label-width': labelWidth + 'px',
            } as React.CSSProperties
          }
        >
          <div className={styles.trackLabel} data-ruler="true">
            {text.timecode}
          </div>
          <div
            className={styles.ruler}
            role="slider"
            tabIndex={0}
            aria-label={text.playhead}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Math.max(0, Math.min(duration, Math.round(playhead)))}
            aria-valuetext={timelineTime(playhead, true)}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              seekOnRuler(event.clientX, event.currentTarget);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                seekOnRuler(event.clientX, event.currentTarget);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onKeyDown={(event) => {
              let next = playhead;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                next += (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1000 : 100);
              } else if (event.key === 'Home') {
                next = 0;
              } else if (event.key === 'End') {
                next = duration;
              } else {
                return;
              }
              event.preventDefault();
              useEditor.getState().seekTo(Math.max(0, Math.min(duration, Math.round(next))));
            }}
          >
            {ruler.ticks.map((tick) => (
              <span
                key={tick}
                className={styles.rulerTick}
                data-first={tick === 0}
                data-last={tick === duration}
                style={{ left: tick * scale }}
                aria-hidden="true"
              >
                {timelineTime(tick, ruler.step < 1000)}
              </span>
            ))}
          </div>
          <div className={styles.trackLabel}>
            <strong>{text.scenes}</strong>
            <small>{scenes.length}</small>
          </div>
          <div className={styles.track} data-kind="scene" aria-label={text.scenes}>
            {displayed.map((scene, index) => {
              const start = displayed
                .slice(0, index)
                .reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
              const offset = start + scene.end_ms - scene.start_ms;
              const sourceRange =
                timelineTime(scene.start_ms, true) + ' – ' + timelineTime(scene.end_ms, true);
              const frames = (sampleGroups.get(scene.id!) ?? []).map((sourceTimeMs) => {
                const frame = storyboard.frames.get(sourceTimeMs);
                return {
                  sourceTimeMs,
                  url:
                    frame?.status === 'ready' && frame.asset_id
                      ? assetUrl(frame.asset_id)
                      : undefined,
                };
              });
              return item(
                'scene',
                scene.id!,
                text.scene +
                  ' ' +
                  (scenes.findIndex((item) => item.id === scene.id) + 1) +
                  ' · ' +
                  sourceRange,
                start,
                offset,
                frames,
                sourceRange,
              );
            })}
          </div>
          {Boolean(document.camera_motion?.length) && (
            <Fragment>
              <div className={styles.trackLabel}>{text.cameraMotion}</div>
              <div className={styles.motionTrack} aria-label={text.cameraMotion}>
                {document.camera_motion?.map((key) => (
                  <button
                    key={key.time_ms}
                    type="button"
                    className={styles.motionMarker}
                    style={{ left: Math.max(22, Math.min(trackWidth - 22, key.time_ms * scale)) }}
                    aria-label={text.cameraMotion + ' ' + time(key.time_ms)}
                    title={text.cameraMotion + ' ' + time(key.time_ms)}
                    onClick={() => useEditor.getState().seekTo(key.time_ms)}
                  />
                ))}
              </div>
            </Fragment>
          )}
          <div className={styles.trackLabel}>
            <strong>{text.captions}</strong>
            <small>{document.words.length}</small>
          </div>
          <div className={styles.captionTrack} aria-label={text.captions}>
            {!document.words.length && (
              <span className={styles.emptyTrack}>{text.timelineEmptyCaptions}</span>
            )}
            {document.words.map((word, index) => (
              <button
                key={word.id}
                type="button"
                aria-label={word.text + ' · ' + timelineTime(word.start_ms, true)}
                aria-pressed={selectedWords.includes(word.id)}
                data-active={playhead >= word.start_ms && playhead < word.end_ms}
                title={word.text + ' · ' + timelineTime(word.start_ms, true)}
                style={{
                  left: word.start_ms * scale,
                  width: Math.max(2, (word.end_ms - word.start_ms) * scale),
                }}
                onClick={(event) => {
                  const anchor = document.words.findIndex((item) => item.id === wordAnchor.current);
                  const range =
                    event.shiftKey && anchor >= 0
                      ? document.words.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
                      : [word];
                  if (!event.shiftKey) {
                    wordAnchor.current = word.id;
                  }
                  useEditor.getState().selectWords(range.map((item) => item.id));
                  useEditor.getState().seekTo(word.start_ms);
                }}
              >
                {word.text}
              </button>
            ))}
          </div>
          {!document.visual_layers?.length && (
            <>
              <div className={styles.trackLabel}>{text.visualLayers}</div>
              <div className={styles.track} data-kind="visual">
                <span className={styles.emptyTrack}>{text.timelineEmptyVisuals}</span>
              </div>
            </>
          )}
          {(document.visual_layers ?? []).map((layer, index) => (
            <Fragment key={layer.id}>
              <div className={styles.trackLabel}>
                {text.visualLayers} {index + 1}
              </div>
              <div
                className={styles.track}
                data-kind="visual"
                aria-label={text.visualLayers}
                data-disabled={!layer.enabled}
              >
                {item(
                  'visual',
                  layer.id,
                  layer.text || text.visualLayers,
                  layer.start_ms,
                  layer.end_ms,
                )}
              </div>
              {Boolean(layer.motion?.length) && (
                <>
                  <div className={styles.trackLabel}>
                    {layer.kind === 'broll' ? text.mediaMotion : text.textMotion}
                  </div>
                  <div
                    className={styles.motionTrack}
                    aria-label={layer.kind === 'broll' ? text.mediaMotion : text.textMotion}
                  >
                    {layer.motion?.map((key) => (
                      <button
                        key={key.time_ms}
                        type="button"
                        className={styles.motionMarker}
                        style={{
                          left: Math.max(22, Math.min(trackWidth - 22, key.time_ms * scale)),
                        }}
                        aria-label={
                          (layer.kind === 'broll' ? text.mediaMotion : text.textMotion) +
                          ' ' +
                          time(key.time_ms)
                        }
                        title={time(key.time_ms)}
                        onClick={() => {
                          useEditor.setState({
                            timelineSelection: { kind: 'visual', id: layer.id },
                          });
                          useEditor.getState().seekTo(key.time_ms);
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </Fragment>
          ))}
          {!document.audio_layers?.length && (
            <>
              <div className={styles.trackLabel}>{text.audioLayers}</div>
              <div className={styles.track} data-kind="audio">
                <span className={styles.emptyTrack}>{text.timelineEmptyAudio}</span>
              </div>
            </>
          )}
          {(document.audio_layers ?? []).map((layer, index) => (
            <Fragment key={layer.id}>
              <div className={styles.trackLabel}>
                {text.audioLayers} {index + 1}
              </div>
              <div
                className={styles.track}
                data-kind="audio"
                aria-label={text.audioLayers}
                data-disabled={!layer.enabled}
              >
                {item('audio', layer.id, text.audioLayers, layer.start_ms, layer.end_ms)}
              </div>
            </Fragment>
          ))}
          {ruler.ticks.map((tick) => (
            <div
              key={tick}
              className={styles.timelineGridLine}
              style={{ left: labelWidth + tick * scale }}
              aria-hidden="true"
            />
          ))}
          <div
            className={styles.playhead}
            style={{ left: labelWidth + Math.min(duration, Math.max(0, playhead)) * scale }}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}

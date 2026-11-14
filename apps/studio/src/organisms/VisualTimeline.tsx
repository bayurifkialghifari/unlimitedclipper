import { useEffect, useRef, useState } from 'react';
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
import { TimelineItem, type TimelineGesture } from '../molecules/TimelineItem';
import { api } from '../lib/api';
import type { SourceSegment } from '../types';
import styles from '../styles/Editor.module.css';

type Kind = 'scene' | 'visual' | 'audio';
type Gesture = { kind: Kind; id: string; mode: TimelineGesture; delta: number; snapshot: string };

export function VisualTimeline({ sourceDuration }: { sourceDuration: number }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const selected = useEditor((state) => state.timelineSelection);
  const { remap, pending, supported } = useTimelineRemap();
  const [zoom, setZoom] = useState(1);
  const [snapping, setSnapping] = useState(true);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const audio = useQuery({ queryKey: ['audio-assets'], queryFn: api.audioAssets });

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
  const scale = Math.max(0.001, (width * zoom) / duration);
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
            Object.assign(layer, next);
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

  function item(kind: Kind, id: string, label: string, start: number, end: number) {
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
        disabled={pending || (kind === 'scene' && !supported)}
        onSelect={() => useEditor.setState({ timelineSelection: { kind, id } })}
        onPreview={(mode, delta) => preview(kind, id, mode, delta)}
        onCommit={(mode, delta) => commit(kind, id, mode, delta)}
      />
    );
  }

  const displayed = gesture?.kind === 'scene' ? sceneCandidate(gesture) : scenes;
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
          {pending ? text.running : time(playhead) + ' / ' + time(duration)}
        </span>
      </div>
      <p className={styles.timelineHint}>{supported ? text.timelineHelp : text.sceneUpgrade}</p>
      <div className={styles.trackViewport} ref={viewport}>
        <div className={styles.tracks} style={{ width: width * zoom }}>
          <button
            className={styles.ruler}
            aria-label={text.playhead}
            onClick={(event) =>
              useEditor
                .getState()
                .seekTo(
                  Math.min(
                    duration,
                    Math.round(
                      (event.clientX - event.currentTarget.getBoundingClientRect().left) / scale,
                    ),
                  ),
                )
            }
          >
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index}>{time((duration * index) / 8)}</span>
            ))}
          </button>
          <div className={styles.track} aria-label={text.scenes}>
            {displayed.map((scene, index) => {
              const start = displayed
                .slice(0, index)
                .reduce((sum, item) => sum + item.end_ms - item.start_ms, 0);
              const offset = start + scene.end_ms - scene.start_ms;
              return item(
                'scene',
                scene.id!,
                text.scene + ' ' + (scenes.findIndex((item) => item.id === scene.id) + 1),
                start,
                offset,
              );
            })}
          </div>
          <div className={styles.captionTrack} aria-label={text.captions}>
            {document.words.map((word) => (
              <button
                key={word.id}
                title={word.text}
                style={{
                  left: word.start_ms * scale,
                  width: Math.max(2, (word.end_ms - word.start_ms) * scale),
                }}
                onClick={() => {
                  useEditor.getState().selectWords([word.id]);
                  useEditor.getState().seekTo(word.start_ms);
                }}
              >
                {word.text}
              </button>
            ))}
          </div>
          {(document.visual_layers ?? []).map((layer) => (
            <div
              key={layer.id}
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
          ))}
          {(document.audio_layers ?? []).map((layer) => (
            <div
              key={layer.id}
              className={styles.track}
              data-kind="audio"
              aria-label={text.audioLayers}
              data-disabled={!layer.enabled}
            >
              {item('audio', layer.id, text.audioLayers, layer.start_ms, layer.end_ms)}
            </div>
          ))}
          <div
            className={styles.playhead}
            style={{ left: Math.min(duration, playhead) * scale }}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}

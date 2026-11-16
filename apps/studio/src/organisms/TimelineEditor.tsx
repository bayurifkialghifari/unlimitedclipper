import { useState } from 'react';
import { Button, Field, Toggle, Select } from '@unlimitedclipper/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fitAudioFades } from '../lib/audio-placement';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { outputDuration, sourceSegments, identifiedSegments } from '../lib/timeline';
import { SegmentFields } from '../molecules/SegmentFields';
import { LayerCropFields } from '../molecules/LayerCropFields';
import { LayerTimingFields } from '../molecules/LayerTimingFields';
import { AudioLibrary } from './AudioLibrary';
import { LayerMotionEditor } from './LayerMotionEditor';
import { useTimelineRemap } from '../hooks/use-timeline-remap';
import { retimeLayerMotion } from '../lib/layer-motion';
import type { AudioLayer, VisualLayer } from '../types';
import styles from '../styles/Studio.module.css';

export function TimelineEditor({ mode = 'all' }: { mode?: 'all' | 'visual' | 'audio' }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const change = useEditor((state) => state.change);
  const { remap, pending, supported } = useTimelineRemap();
  const selection = useEditor((state) => state.timelineSelection);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const sources = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const audio = useQuery({ queryKey: ['audio-assets'], queryFn: api.audioAssets });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 3000 });
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  const document = draft.document;
  const duration = outputDuration(document);
  const mixingSupported = Boolean(health.data?.editor_features.includes('audio_mixing'));
  const segments = identifiedSegments(document);
  const names: Record<string, string> = {
    note: text.addNote,
    text: text.addNote,
    punch_in: text.addPunchIn,
    split: text.addSplit,
    camera_frame: text.addCameraFrame,
    broll: text.addBroll,
  };

  function addVisual(kind: string) {
    change((document) => {
      document.version = Math.max(2, document.version);
      document.segments = sourceSegments(document);
      const start = Math.max(0, Math.min(Math.round(playhead), duration - 100));
      const layer: VisualLayer = {
        id: crypto.randomUUID(),
        kind,
        enabled: true,
        start_ms: start,
        end_ms: Math.min(duration, start + 1500),
        text: '',
        x: 0.5,
        y: 0.24,
        color: '#FFCB66',
        size: 60,
        crop: null,
        secondary_crop: null,
        asset_id: null,
        source_start_ms: 0,
      };
      if (kind === 'punch_in' || kind === 'split') {
        layer.crop = structuredClone(document.crop);
        if (kind === 'punch_in') {
          layer.crop.width /= 1.12;
          layer.crop.height /= 1.12;
          layer.crop.x += (document.crop.width - layer.crop.width) / 2;
          layer.crop.y += (document.crop.height - layer.crop.height) / 2;
        }
      }
      if (kind === 'split') {
        layer.secondary_crop = structuredClone(document.gameplay_crop);
      }
      if (kind === 'broll') {
        layer.asset_id = sources.data?.[0]?.asset_id ?? null;
        layer.end_ms = Math.min(layer.end_ms, start + (sources.data?.[0]?.duration_ms ?? 0));
      }
      document.visual_layers = [...(document.visual_layers ?? []), layer];
    });
  }

  function editLayer(id: string, recipe: (layer: VisualLayer) => void) {
    change((document) => {
      const layer = document.visual_layers?.find((layer) => layer.id === id);
      if (layer) {
        recipe(layer);
      }
    });
  }

  function editAudio(id: string, recipe: (layer: AudioLayer) => void) {
    change((document) => {
      const layer = document.audio_layers?.find((item) => item.id === id);
      if (layer) {
        recipe(layer);
      }
    });
  }

  return (
    <section aria-label={text.timelineSegments}>
      {mode !== 'audio' && (!selection || selection.kind === 'scene') && (
        <>
          <h3>{text.timelineSegments}</h3>
          {segments
            .map((segment, index) => ({ segment, index }))
            .filter(({ segment }) => !selection || selection.id === segment.id)
            .map(({ segment, index }) => (
              <SegmentFields
                key={segment.id + ':' + segment.start_ms + ':' + segment.end_ms}
                segment={segment}
                busy={pending || !supported}
                removable={segments.length > 1}
                onApply={(updated) =>
                  void remap(
                    segments.map((segment, position) =>
                      position === index ? { ...updated, id: segment.id } : segment,
                    ),
                  )
                }
                onRemove={() => void remap(segments.filter((_, position) => position !== index))}
              />
            ))}
          <div className={styles.twoColumns}>
            <Field
              label={text.start + ' (s)'}
              type="number"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <Field
              label={text.end + ' (s)'}
              type="number"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <Button
            disabled={
              pending ||
              !supported ||
              segments.length >= 32 ||
              !start ||
              Number(end) <= Number(start)
            }
            onClick={() =>
              void remap([
                ...segments,
                {
                  id: crypto.randomUUID(),
                  start_ms: Math.round(Number(start) * 1000),
                  end_ms: Math.round(Number(end) * 1000),
                },
              ])
            }
          >
            {text.addSegment}
          </Button>
        </>
      )}
      {mode !== 'audio' && (!selection || selection.kind === 'visual') && (
        <>
          <h3>{text.visualLayers}</h3>
          {['note', 'punch_in', 'split', 'camera_frame', 'broll'].map((kind) => (
            <Button
              key={kind}
              onClick={() => addVisual(kind)}
              disabled={
                pending ||
                (document.visual_layers?.length ?? 0) >= 64 ||
                (kind === 'broll' && !sources.data?.length)
              }
            >
              {names[kind]}
            </Button>
          ))}
          {(document.visual_layers ?? [])
            .filter((layer) => selection?.kind !== 'visual' || selection.id === layer.id)
            .map((layer) => (
              <fieldset key={layer.id} className={styles.disabledGroup}>
                <legend>{names[layer.kind] ?? text.visualLayers}</legend>
                <Toggle
                  label={text.visible}
                  checked={layer.enabled}
                  onChange={(enabled) =>
                    editLayer(layer.id, (layer) => {
                      layer.enabled = enabled;
                    })
                  }
                />
                {layer.kind === 'broll' && (
                  <Select
                    label={text.sourceAsset}
                    value={layer.asset_id ?? ''}
                    onChange={(value) =>
                      editLayer(layer.id, (layer) => {
                        layer.asset_id = value;
                        layer.source_start_ms = 0;
                        layer.end_ms = Math.min(
                          layer.end_ms,
                          layer.start_ms +
                            (sources.data?.find((source) => source.asset_id === value)
                              ?.duration_ms ?? 1),
                        );
                      })
                    }
                  >
                    {sources.data?.map((source) => (
                      <option key={source.id} value={source.asset_id}>
                        {source.name}
                      </option>
                    ))}
                  </Select>
                )}
                {layer.crop && (
                  <LayerCropFields
                    crop={layer.crop}
                    onChange={(crop) =>
                      editLayer(layer.id, (layer) => {
                        layer.crop = crop;
                      })
                    }
                  />
                )}
                {layer.secondary_crop && (
                  <LayerCropFields
                    crop={layer.secondary_crop}
                    onChange={(crop) =>
                      editLayer(layer.id, (layer) => {
                        layer.secondary_crop = crop;
                      })
                    }
                  />
                )}
                <LayerTimingFields
                  layer={layer}
                  duration={duration}
                  maximumLength={layer.motion?.length ? 120_000 : undefined}
                  sourceDuration={
                    layer.kind === 'broll'
                      ? sources.data?.find((source) => source.asset_id === layer.asset_id)
                          ?.duration_ms
                      : undefined
                  }
                  onChange={(timing) =>
                    editLayer(layer.id, (layer) => {
                      retimeLayerMotion(layer, timing.start_ms, timing.end_ms, false);
                      Object.assign(layer, timing);
                    })
                  }
                />
                {['text', 'note'].includes(layer.kind) && (
                  <Field
                    label={text.text}
                    value={layer.text}
                    maxLength={200}
                    onChange={(event) =>
                      editLayer(layer.id, (layer) => {
                        layer.text = event.target.value;
                      })
                    }
                  />
                )}
                {['note', 'text'].includes(layer.kind) && (
                  <div className={styles.twoColumns}>
                    {(['x', 'y'] as const).map((axis) => (
                      <Field
                        key={axis}
                        label={axis === 'x' ? text.horizontalPosition : text.position}
                        type="range"
                        min={0}
                        max={100}
                        value={layer[axis] * 100}
                        onChange={(event) =>
                          editLayer(layer.id, (layer) => {
                            layer[axis] = Number(event.target.value) / 100;
                          })
                        }
                      />
                    ))}
                    <Field
                      label={text.size}
                      type="range"
                      min={12}
                      max={220}
                      value={layer.size}
                      onChange={(event) =>
                        editLayer(layer.id, (layer) => {
                          layer.size = Number(event.target.value);
                        })
                      }
                    />
                  </div>
                )}
                {['note', 'text', 'broll'].includes(layer.kind) && (
                  <LayerMotionEditor layerId={layer.id} />
                )}
                {['note', 'text', 'camera_frame'].includes(layer.kind) && (
                  <Field
                    label={text.color}
                    type="color"
                    value={layer.color}
                    onChange={(event) =>
                      editLayer(layer.id, (layer) => {
                        layer.color = event.target.value;
                      })
                    }
                  />
                )}
                <Button
                  onClick={() =>
                    change((document) => {
                      document.visual_layers = document.visual_layers?.filter(
                        (item) => item.id !== layer.id,
                      );
                    })
                  }
                >
                  {text.delete}
                </Button>
              </fieldset>
            ))}
        </>
      )}
      {mode !== 'visual' && (!selection || selection.kind === 'audio') && (
        <>
          <h3>{text.audioLayers}</h3>
          {!selection && (
            <AudioLibrary
              disabled={Boolean(
                jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status)),
              )}
            />
          )}
          {(audio.error || sources.error) && (
            <p role="alert" className={styles.error}>
              {(audio.error ?? sources.error)?.message}
            </p>
          )}
          <Button
            disabled={(document.audio_layers?.length ?? 0) >= 16}
            onClick={() =>
              change((document) => {
                document.version = Math.max(2, document.version);
                document.segments = sourceSegments(document);
                const start = Math.max(0, Math.min(Math.round(playhead), duration - 100));
                document.audio_layers = [
                  ...(document.audio_layers ?? []),
                  {
                    id: crypto.randomUUID(),
                    enabled: false,
                    start_ms: start,
                    end_ms: Math.min(duration, start + 180),
                    asset_id: null,
                    source_start_ms: 0,
                    gain: 0.12,
                  },
                ];
              })
            }
          >
            {text.addTap}
          </Button>
          {(document.audio_layers ?? [])
            .filter((layer) => selection?.kind !== 'audio' || selection.id === layer.id)
            .map((layer) => (
              <fieldset key={layer.id} className={styles.disabledGroup}>
                <Toggle
                  label={text.visible}
                  checked={layer.enabled}
                  onChange={(enabled) =>
                    change((document) => {
                      document.audio_layers!.find((item) => item.id === layer.id)!.enabled =
                        enabled;
                    })
                  }
                />
                <Select
                  label={text.sourceAsset}
                  value={layer.asset_id ?? ''}
                  onChange={(value) =>
                    editAudio(layer.id, (layer) => {
                      layer.asset_id = value || null;
                      layer.source_start_ms = 0;
                      if (!value) {
                        layer.ducking = false;
                        layer.normalize = false;
                      }
                      const length = value
                        ? (audio.data?.find((asset) => asset.asset_id === value)?.duration_ms ??
                          sources.data?.find((source) => source.asset_id === value)?.duration_ms ??
                          1)
                        : 500;
                      layer.end_ms = Math.min(layer.end_ms, layer.start_ms + length);
                    })
                  }
                >
                  <option value="">{text.addTap}</option>
                  {sources.data
                    ?.filter((source) => source.has_audio)
                    .map((source) => (
                      <option key={source.id} value={source.asset_id}>
                        {source.name}
                      </option>
                    ))}
                  {audio.data?.map((asset) => (
                    <option key={asset.asset_id} value={asset.asset_id}>
                      {asset.name}
                    </option>
                  ))}
                </Select>
                <LayerTimingFields
                  layer={layer}
                  duration={duration}
                  sourceDuration={
                    audio.data?.find((asset) => asset.asset_id === layer.asset_id)?.duration_ms ??
                    sources.data?.find((source) => source.asset_id === layer.asset_id)?.duration_ms
                  }
                  maximumLength={layer.asset_id ? undefined : 500}
                  onChange={(timing) =>
                    editAudio(layer.id, (current) => {
                      Object.assign(current, timing);
                      fitAudioFades(current);
                    })
                  }
                />
                <Field
                  label={text.audioGain + ' (%)'}
                  type="range"
                  min={0}
                  max={100}
                  value={layer.gain * 100}
                  onChange={(event) =>
                    change((document) => {
                      document.audio_layers!.find((item) => item.id === layer.id)!.gain =
                        Number(event.target.value) / 100;
                    })
                  }
                />
                <output>{Math.round(layer.gain * 100)}%</output>
                {!mixingSupported && <p className={styles.hint}>{text.audioMixUnavailable}</p>}
                <fieldset className={styles.disabledGroup} disabled={!mixingSupported}>
                  <legend>{text.audioMixControls}</legend>
                  <div className={styles.twoColumns}>
                    <Field
                      label={text.audioFadeIn}
                      type="number"
                      min={0}
                      max={(layer.end_ms - layer.start_ms - (layer.fade_out_ms ?? 0)) / 1000}
                      step={0.01}
                      value={((layer.fade_in_ms ?? 0) / 1000).toFixed(2)}
                      onChange={(event) =>
                        editAudio(layer.id, (current) => {
                          current.fade_in_ms = Math.min(
                            Math.max(0, Math.round(Number(event.target.value) * 1000)),
                            current.end_ms - current.start_ms - (current.fade_out_ms ?? 0),
                          );
                        })
                      }
                    />
                    <Field
                      label={text.audioFadeOut}
                      type="number"
                      min={0}
                      max={(layer.end_ms - layer.start_ms - (layer.fade_in_ms ?? 0)) / 1000}
                      step={0.01}
                      value={(
                        Math.min(layer.fade_out_ms ?? 80, layer.end_ms - layer.start_ms) / 1000
                      ).toFixed(2)}
                      onChange={(event) =>
                        editAudio(layer.id, (current) => {
                          current.fade_out_ms = Math.min(
                            Math.max(0, Math.round(Number(event.target.value) * 1000)),
                            current.end_ms - current.start_ms - (current.fade_in_ms ?? 0),
                          );
                        })
                      }
                    />
                  </div>
                  <Toggle
                    label={text.audioNormalize}
                    checked={layer.normalize ?? false}
                    onChange={(normalize) =>
                      editAudio(layer.id, (current) => {
                        current.normalize = normalize;
                      })
                    }
                  />
                  {layer.asset_id && (
                    <Toggle
                      label={text.audioDucking}
                      checked={layer.ducking ?? false}
                      onChange={(ducking) =>
                        editAudio(layer.id, (current) => {
                          current.ducking = ducking;
                        })
                      }
                    />
                  )}
                </fieldset>
                <Button
                  onClick={() =>
                    change((document) => {
                      document.audio_layers = document.audio_layers?.filter(
                        (item) => item.id !== layer.id,
                      );
                    })
                  }
                >
                  {text.delete}
                </Button>
              </fieldset>
            ))}
        </>
      )}
    </section>
  );
}

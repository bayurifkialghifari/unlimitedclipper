import { useState } from 'react';
import { Button, Field, Toggle, Select } from '@unlimitedclipper/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { outputDuration, sourceSegments } from '../lib/timeline';
import { SegmentFields } from '../molecules/SegmentFields';
import { LayerCropFields } from '../molecules/LayerCropFields';
import { LayerTimingFields } from '../molecules/LayerTimingFields';
import { AudioLibrary } from './AudioLibrary';
import type { AudioLayer, SourceSegment, VisualLayer } from '../types';
import styles from '../styles/Studio.module.css';

export function TimelineEditor() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const change = useEditor((state) => state.change);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const sources = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const audio = useQuery({ queryKey: ['audio-assets'], queryFn: api.audioAssets });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 3000 });
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  const document = draft.document;
  const duration = outputDuration(document);
  const segments = sourceSegments(document);
  const names: Record<string, string> = {
    note: text.addNote,
    text: text.addNote,
    punch_in: text.addPunchIn,
    split: text.addSplit,
    camera_frame: text.addCameraFrame,
    broll: text.addBroll,
  };

  async function remap(segments: SourceSegment[]) {
    if (!draft) {
      return;
    }
    setPending(true);
    setError(null);
    const snapshot = JSON.stringify(draft.document);
    try {
      const mapped = await api.timelinePreview(draft.id, draft.document, segments);
      if (JSON.stringify(useEditor.getState().draft?.document) !== snapshot) {
        throw new Error(text.proposalConflict);
      }
      change((document) => Object.assign(document, mapped), true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function addVisual(kind: string) {
    change((document) => {
      document.version = 2;
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
      <h3>{text.timelineSegments}</h3>
      {segments.map((segment, index) => (
        <SegmentFields
          key={index + ':' + segment.start_ms + ':' + segment.end_ms}
          segment={segment}
          busy={pending}
          removable={segments.length > 1}
          onApply={(updated) =>
            void remap(
              segments.map((segment, position) => (position === index ? updated : segment)),
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
        disabled={pending || !start || Number(end) <= Number(start)}
        onClick={() =>
          void remap([
            ...segments,
            { start_ms: Math.round(Number(start) * 1000), end_ms: Math.round(Number(end) * 1000) },
          ])
        }
      >
        {text.addSegment}
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <h3>{text.visualLayers}</h3>
      {['note', 'punch_in', 'split', 'camera_frame', 'broll'].map((kind) => (
        <Button
          key={kind}
          onClick={() => addVisual(kind)}
          disabled={pending || (kind === 'broll' && !sources.data?.length)}
        >
          {names[kind]}
        </Button>
      ))}
      {(document.visual_layers ?? []).map((layer) => (
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
                      (sources.data?.find((source) => source.asset_id === value)?.duration_ms ?? 1),
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
            sourceDuration={
              layer.kind === 'broll'
                ? sources.data?.find((source) => source.asset_id === layer.asset_id)?.duration_ms
                : undefined
            }
            onChange={(timing) => editLayer(layer.id, (layer) => Object.assign(layer, timing))}
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
      <h3>{text.audioLayers}</h3>
      <AudioLibrary
        disabled={Boolean(
          jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status)),
        )}
      />
      {(audio.error || sources.error) && (
        <p role="alert" className={styles.error}>
          {(audio.error ?? sources.error)?.message}
        </p>
      )}
      <Button
        onClick={() =>
          change((document) => {
            document.version = 2;
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
      {(document.audio_layers ?? []).map((layer) => (
        <fieldset key={layer.id} className={styles.disabledGroup}>
          <Toggle
            label={text.visible}
            checked={layer.enabled}
            onChange={(enabled) =>
              change((document) => {
                document.audio_layers!.find((item) => item.id === layer.id)!.enabled = enabled;
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
            onChange={(timing) => editAudio(layer.id, (layer) => Object.assign(layer, timing))}
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
    </section>
  );
}

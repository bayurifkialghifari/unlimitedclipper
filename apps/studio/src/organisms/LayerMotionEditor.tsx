import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { identifiedSegments } from '../lib/timeline';
import { motionValuesAt } from '../lib/preview-drawing';
import { MotionEasingFields } from '../molecules/MotionEasingFields';
import { KeyframeStrip } from '../molecules/KeyframeStrip';
import type { VisualLayer } from '../types';
import styles from '../styles/Studio.module.css';

type LayerKeyframe = NonNullable<VisualLayer['motion']>[number];

function normalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function LayerMotionEditor({ layerId }: { layerId: string }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const change = useEditor((state) => state.change);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const layer = draft?.document.visual_layers?.find((item) => item.id === layerId);
  if (!layer) {
    return null;
  }
  const media = layer.kind === 'broll';
  const keys = layer.motion ?? [];
  const time = Math.round(playhead);
  const supported = Boolean(
    health.data?.editor_features.includes(media ? 'media_motion' : 'text_motion'),
  );
  const inLayer = time >= layer.start_ms && time < layer.end_ms;
  const shortEnough = layer.end_ms - layer.start_ms <= 120_000;
  const maximumKeys = media ? 24 : 256;
  const playheadIndex = keys.findIndex((key) => key.time_ms === time);
  const rememberedIndex = keys.findIndex((key) => key.time_ms === selectedTime);
  const selectedIndex = playheadIndex >= 0 ? playheadIndex : Math.max(0, rememberedIndex);
  const selectedKey = keys[selectedIndex];

  function edit(index: number, recipe: (key: LayerKeyframe) => void) {
    change((document) => {
      const current = document.visual_layers?.find((item) => item.id === layerId);
      const key = current?.motion?.[index];
      if (key) {
        recipe(key);
        current.motion?.sort((first, second) => first.time_ms - second.time_ms);
      }
    });
  }

  async function add() {
    const snapshot = useEditor.getState().draft;
    if (!snapshot || !supported || !inLayer || !shortEnough || (media && !layer?.asset_id)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const plan = await api.previewPlan(snapshot);
      const current = useEditor.getState().draft;
      if (
        current?.id !== snapshot.id ||
        JSON.stringify(current.document) !== JSON.stringify(snapshot.document)
      ) {
        setError(text.motionChanged);
        return;
      }
      const currentLayer = snapshot.document.visual_layers?.find((item) => item.id === layerId);
      if (!currentLayer) {
        return;
      }
      const curve = plan.layer_motion[layerId];
      const values = curve
        ? motionValuesAt(curve, time)
        : media
          ? [0.5, 0.5, 1, 1]
          : [currentLayer.x, currentLayer.y, 1, 1];
      change((document) => {
        const target = document.visual_layers?.find((item) => item.id === layerId);
        if (!target) {
          return;
        }
        document.segments = identifiedSegments(document);
        document.version = Math.max(4, document.version);
        target.motion = [
          ...(target.motion ?? []),
          {
            time_ms: time,
            x: values[0],
            y: values[1],
            scale: values[2],
            opacity: values[3],
            easing: { kind: 'linear' as const },
          },
        ].sort((first, second) => first.time_ms - second.time_ms);
      });
      setSelectedTime(time);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label={media ? text.mediaMotion : text.textMotion}>
      <h3>{media ? text.mediaMotion : text.textMotion}</h3>
      {health.isLoading && <p role="status">{text.motionLoading}</p>}
      {health.isError && <p role="alert">{text.editorUpgrade}</p>}
      {!health.isLoading && !health.isError && !supported && (
        <p className={styles.hint}>{text.editorUpgrade}</p>
      )}
      {!shortEnough && (
        <p className={styles.hint}>{media ? text.mediaMotionLimit : text.textMotionLimit}</p>
      )}
      {!inLayer && (
        <p className={styles.hint}>{media ? text.mediaMotionPlayhead : text.textMotionPlayhead}</p>
      )}
      {media && !layer.asset_id && <p className={styles.hint}>{text.mediaMotionNeedsSource}</p>}
      {!media && !layer.text.trim() && <p className={styles.hint}>{text.textMotionNeedsText}</p>}
      {keys.length > 0 && (
        <>
          <p className={styles.hint}>{text.keyframeEditHint}</p>
          <KeyframeStrip
            times={keys.map((key) => key.time_ms)}
            selectedTime={selectedKey.time_ms}
            onSelect={(timeMs) => {
              setSelectedTime(timeMs);
              useEditor.getState().seekTo(timeMs);
            }}
          />
        </>
      )}
      {selectedKey && (
        <fieldset className={styles.wordEditor} disabled={!supported || pending}>
          <legend>{(selectedKey.time_ms / 1000).toFixed(2)}s</legend>
          <div className={styles.twoColumns}>
            <Field
              label={text.motionTime + ' (s)'}
              type="number"
              min={layer.start_ms / 1000}
              max={layer.end_ms / 1000}
              step={0.01}
              value={selectedKey.time_ms / 1000}
              onChange={(event) => {
                const milliseconds = Math.round(Number(event.target.value) * 1000);
                if (
                  Number.isFinite(milliseconds) &&
                  milliseconds >= layer.start_ms &&
                  milliseconds <= layer.end_ms &&
                  !keys.some(
                    (other, position) =>
                      position !== selectedIndex && other.time_ms === milliseconds,
                  )
                ) {
                  edit(selectedIndex, (target) => {
                    target.time_ms = milliseconds;
                  });
                  setSelectedTime(milliseconds);
                }
              }}
            />
            <Field
              label={text.motionScale + ' (%)'}
              type="number"
              min={media ? 100 : 10}
              max={400}
              step={1}
              value={Math.round(selectedKey.scale * 100)}
              onChange={(event) =>
                edit(selectedIndex, (target) => {
                  target.scale = Math.max(
                    media ? 1 : 0.1,
                    Math.min(4, Number(event.target.value) / 100),
                  );
                })
              }
            />
            <Field
              label={text.motionCenterX + ' (%)'}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={Number((selectedKey.x * 100).toFixed(1))}
              onChange={(event) =>
                edit(selectedIndex, (target) => {
                  target.x = normalized(Number(event.target.value) / 100);
                })
              }
            />
            <Field
              label={text.motionCenterY + ' (%)'}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={Number((selectedKey.y * 100).toFixed(1))}
              onChange={(event) =>
                edit(selectedIndex, (target) => {
                  target.y = normalized(Number(event.target.value) / 100);
                })
              }
            />
            <Field
              label={text.motionOpacity + ' (%)'}
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(selectedKey.opacity * 100)}
              onChange={(event) =>
                edit(selectedIndex, (target) => {
                  target.opacity = normalized(Number(event.target.value) / 100);
                })
              }
            />
          </div>
          <MotionEasingFields
            easing={selectedKey.easing}
            onChange={(easing) =>
              edit(selectedIndex, (target) => {
                target.easing = easing;
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() => {
              change((document) => {
                document.visual_layers
                  ?.find((item) => item.id === layerId)
                  ?.motion?.splice(selectedIndex, 1);
              });
              setSelectedTime(null);
            }}
          >
            {text.delete}
          </Button>
        </fieldset>
      )}
      <Button
        disabled={
          !supported ||
          pending ||
          !inLayer ||
          !shortEnough ||
          (media ? !layer.asset_id : !layer.text.trim()) ||
          keys.length >= maximumKeys ||
          keys.some((key) => key.time_ms === time)
        }
        onClick={() => void add()}
      >
        {pending
          ? text.motionLoading
          : media
            ? text.addMediaMotionKeyframe
            : text.addTextMotionKeyframe}
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

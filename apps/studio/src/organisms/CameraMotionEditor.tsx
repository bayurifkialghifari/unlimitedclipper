import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { identifiedSegments, outputDuration } from '../lib/timeline';
import { cameraAt, motionValuesAt } from '../lib/preview-drawing';
import { MotionEasingFields } from '../molecules/MotionEasingFields';
import type { EditDocument } from '../types';
import styles from '../styles/Studio.module.css';

type CameraKeyframe = NonNullable<EditDocument['camera_motion']>[number];
function normalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function CameraMotionEditor() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const change = useEditor((state) => state.change);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = draft?.document;
  if (!document) {
    return null;
  }
  const keys = document.camera_motion ?? [];
  const duration = outputDuration(document);
  const time = Math.max(0, Math.min(duration - 1, Math.round(playhead)));
  const supported = Boolean(health.data?.editor_features.includes('camera_motion'));
  const supportedLayout = ['portrait', 'square', 'landscape'].includes(document.layout);

  function edit(index: number, recipe: (key: CameraKeyframe) => void) {
    change((next) => {
      const key = next.camera_motion?.[index];
      if (key) {
        recipe(key);
        next.camera_motion?.sort((first, second) => first.time_ms - second.time_ms);
      }
    });
  }

  async function add() {
    const snapshot = useEditor.getState().draft;
    if (!snapshot || !supported || !supportedLayout) {
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
      const crop = cameraAt(snapshot.document, time);
      const values = plan.camera_motion
        ? motionValuesAt(plan.camera_motion.curve, time)
        : [crop.x + crop.width / 2, crop.y + crop.height / 2, 1];
      change((next) => {
        const legacy = next.keyframes.map((key) => ({
          time_ms: key.time_ms,
          x: key.x + next.crop.width / 2,
          y: key.y + next.crop.height / 2,
          zoom: 1,
          easing: { kind: 'linear' as const },
        }));
        next.segments = identifiedSegments(next);
        next.version = 4;
        next.camera_motion = [
          ...(next.camera_motion ?? []),
          ...legacy.filter((key) => key.time_ms !== time),
          {
            time_ms: time,
            x: values[0],
            y: values[1],
            zoom: values[2],
            easing: { kind: 'linear' as const },
          },
        ].sort((first, second) => first.time_ms - second.time_ms);
        next.keyframes = [];
      });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label={text.cameraMotion}>
      <h3>{text.cameraMotion}</h3>
      {health.isLoading && <p role="status">{text.motionLoading}</p>}
      {health.isError && <p role="alert">{text.editorUpgrade}</p>}
      {!health.isLoading && !health.isError && !supported && (
        <p className={styles.hint}>{text.editorUpgrade}</p>
      )}
      {!supportedLayout && <p className={styles.hint}>{text.cameraMotionLayoutLimit}</p>}
      {keys.length === 0 && <p className={styles.hint}>{text.cameraMotionHint}</p>}
      {keys.map((key, index) => (
        <fieldset key={key.time_ms} className={styles.wordEditor} disabled={!supported || pending}>
          <legend>{(key.time_ms / 1000).toFixed(2)}s</legend>
          <div className={styles.twoColumns}>
            <Field
              label={text.motionTime + ' (s)'}
              type="number"
              min={0}
              max={duration / 1000}
              step={0.01}
              value={key.time_ms / 1000}
              onChange={(event) => {
                const milliseconds = Math.round(Number(event.target.value) * 1000);
                if (
                  Number.isFinite(milliseconds) &&
                  milliseconds >= 0 &&
                  milliseconds <= duration &&
                  !keys.some(
                    (other, position) => position !== index && other.time_ms === milliseconds,
                  )
                ) {
                  edit(index, (target) => {
                    target.time_ms = milliseconds;
                  });
                }
              }}
            />
            <Field
              label={text.motionZoom + ' (%)'}
              type="number"
              min={100}
              max={400}
              step={1}
              value={Math.round(key.zoom * 100)}
              onChange={(event) =>
                edit(index, (target) => {
                  target.zoom = Math.max(1, Math.min(4, Number(event.target.value) / 100));
                })
              }
            />
            <Field
              label={text.motionCenterX + ' (%)'}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={Number((key.x * 100).toFixed(1))}
              onChange={(event) =>
                edit(index, (target) => {
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
              value={Number((key.y * 100).toFixed(1))}
              onChange={(event) =>
                edit(index, (target) => {
                  target.y = normalized(Number(event.target.value) / 100);
                })
              }
            />
          </div>
          <MotionEasingFields
            easing={key.easing}
            onChange={(easing) =>
              edit(index, (target) => {
                target.easing = easing;
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() =>
              change((next) => {
                next.camera_motion?.splice(index, 1);
              })
            }
          >
            {text.delete}
          </Button>
        </fieldset>
      ))}
      <Button
        disabled={
          !supported ||
          !supportedLayout ||
          pending ||
          keys.length >= 512 ||
          keys.some((key) => key.time_ms === time)
        }
        onClick={() => void add()}
      >
        {pending ? text.motionLoading : text.addMotionKeyframe}
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

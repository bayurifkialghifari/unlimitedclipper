import { Field } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

type Timing = { start_ms: number; end_ms: number; source_start_ms?: number };

export function LayerTimingFields({
  layer,
  duration,
  sourceDuration,
  maximumLength,
  onChange,
}: {
  layer: Timing;
  duration: number;
  sourceDuration?: number;
  maximumLength?: number;
  onChange: (timing: Timing) => void;
}) {
  const text = useText();
  function update(field: keyof Timing, seconds: string) {
    const value = Math.round(Number(seconds) * 1000);
    if (!Number.isFinite(value)) {
      return;
    }
    const next = { ...layer, source_start_ms: layer.source_start_ms ?? 0 };
    if (field === 'start_ms') {
      next.start_ms = Math.max(0, Math.min(value, next.end_ms - 1));
    } else if (field === 'source_start_ms') {
      next.source_start_ms = Math.max(0, Math.min(value, (sourceDuration ?? Infinity) - 1));
    } else {
      next.end_ms = Math.max(next.start_ms + 1, Math.min(value, duration));
    }
    next.end_ms = Math.min(
      next.end_ms,
      next.start_ms + (maximumLength ?? Infinity),
      next.start_ms +
        (sourceDuration === undefined ? Infinity : sourceDuration - next.source_start_ms),
    );
    onChange(next);
  }
  return (
    <div className={styles.twoColumns}>
      <Field
        label={text.start + ' (s)'}
        type="number"
        min={0}
        step={0.01}
        value={layer.start_ms / 1000}
        onChange={(event) => update('start_ms', event.target.value)}
      />
      <Field
        label={text.end + ' (s)'}
        type="number"
        min={0}
        max={duration / 1000}
        step={0.01}
        value={layer.end_ms / 1000}
        onChange={(event) => update('end_ms', event.target.value)}
      />
      {sourceDuration !== undefined && (
        <Field
          label={text.sourceOffset + ' (s)'}
          type="number"
          min={0}
          max={sourceDuration / 1000}
          step={0.01}
          value={(layer.source_start_ms ?? 0) / 1000}
          onChange={(event) => update('source_start_ms', event.target.value)}
        />
      )}
    </div>
  );
}

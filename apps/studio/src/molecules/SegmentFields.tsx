import { useState } from 'react';
import { Button, Field } from '@unlimitedclipper/ui';
import { CheckIcon, TrashIcon } from '@phosphor-icons/react';
import { useText } from '../lib/i18n';
import type { SourceSegment } from '../types';
import styles from '../styles/Studio.module.css';

export function SegmentFields({
  segment,
  index,
  busy,
  removable,
  onApply,
  onRemove,
}: {
  segment: SourceSegment;
  index: number;
  busy: boolean;
  removable: boolean;
  onApply: (segment: SourceSegment) => void;
  onRemove: () => void;
}) {
  const text = useText();
  const [start, setStart] = useState(String(segment.start_ms / 1000));
  const [end, setEnd] = useState(String(segment.end_ms / 1000));
  return (
    <fieldset disabled={busy} className={styles.sceneEditor}>
      <legend>{text.scene + ' ' + (index + 1)}</legend>
      <div className={styles.twoColumns}>
        <Field
          label={text.start + ' (s)'}
          type="number"
          step={0.01}
          min={0}
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <Field
          label={text.end + ' (s)'}
          type="number"
          step={0.01}
          min={0}
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <div className={styles.sceneActions}>
        <Button
          icon={<CheckIcon aria-hidden="true" />}
          onClick={() =>
            onApply({
              ...segment,
              start_ms: Math.round(Number(start) * 1000),
              end_ms: Math.round(Number(end) * 1000),
            })
          }
          disabled={
            !start.trim() ||
            !end.trim() ||
            !Number.isFinite(Number(start)) ||
            !Number.isFinite(Number(end)) ||
            Number(end) <= Number(start) ||
            (Math.round(Number(start) * 1000) === segment.start_ms &&
              Math.round(Number(end) * 1000) === segment.end_ms)
          }
        >
          {text.applySegment}
        </Button>
        <Button
          variant="ghost"
          icon={<TrashIcon aria-hidden="true" />}
          onClick={onRemove}
          disabled={!removable}
        >
          {text.removeSegment}
        </Button>
      </div>
    </fieldset>
  );
}

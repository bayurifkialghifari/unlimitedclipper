import { useState } from 'react';
import { Button, Field } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import type { SourceSegment } from '../types';
import styles from '../styles/Studio.module.css';

export function SegmentFields({
  segment,
  busy,
  removable,
  onApply,
  onRemove,
}: {
  segment: SourceSegment;
  busy: boolean;
  removable: boolean;
  onApply: (segment: SourceSegment) => void;
  onRemove: () => void;
}) {
  const text = useText();
  const [start, setStart] = useState(String(segment.start_ms / 1000));
  const [end, setEnd] = useState(String(segment.end_ms / 1000));
  return (
    <fieldset disabled={busy} className={styles.disabledGroup}>
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
      <Button
        onClick={() =>
          onApply({
            ...segment,
            start_ms: Math.round(Number(start) * 1000),
            end_ms: Math.round(Number(end) * 1000),
          })
        }
        disabled={!Number.isFinite(Number(start)) || Number(end) <= Number(start)}
      >
        {text.applyProposal}
      </Button>
      <Button onClick={onRemove} disabled={!removable}>
        {text.removeSegment}
      </Button>
    </fieldset>
  );
}

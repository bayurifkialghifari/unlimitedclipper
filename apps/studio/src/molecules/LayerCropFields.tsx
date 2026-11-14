import { Field } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import type { CropRect } from '../types';
import styles from '../styles/Studio.module.css';

export function LayerCropFields({
  crop,
  onChange,
}: {
  crop: CropRect;
  onChange: (crop: CropRect) => void;
}) {
  const text = useText();
  const labels = { x: text.left, y: text.top, width: text.width, height: text.height };
  return (
    <div className={styles.twoColumns}>
      {(['x', 'y', 'width', 'height'] as const).map((key) => (
        <Field
          key={key}
          label={labels[key] + ' (%)'}
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={crop[key] * 100}
          onChange={(event) => {
            const value = Number(event.target.value) / 100;
            if (!Number.isFinite(value)) {
              return;
            }
            const updated = {
              ...crop,
              [key]: Math.max(key === 'width' || key === 'height' ? 0.01 : 0, Math.min(1, value)),
            };
            updated.x = Math.min(updated.x, 1 - updated.width);
            updated.y = Math.min(updated.y, 1 - updated.height);
            onChange(updated);
          }}
        />
      ))}
    </div>
  );
}

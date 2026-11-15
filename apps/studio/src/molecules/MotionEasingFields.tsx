import { Field, Select } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import type { MotionEasing } from '../types';
import styles from '../styles/Studio.module.css';

type EasingKind = MotionEasing['kind'];

const kinds: EasingKind[] = ['linear', 'ease_in', 'ease_out', 'smooth', 'hold', 'curve'];

function normalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function MotionEasingFields({
  easing,
  onChange,
}: {
  easing?: MotionEasing;
  onChange: (easing: MotionEasing) => void;
}) {
  const text = useText();
  const labels: Record<EasingKind, string> = {
    linear: text.motionLinear,
    ease_in: text.motionEaseIn,
    ease_out: text.motionEaseOut,
    smooth: text.motionSmooth,
    hold: text.motionHold,
    curve: text.motionCurve,
  };
  return (
    <>
      <Select
        label={text.motionEasing}
        value={easing?.kind ?? 'linear'}
        onChange={(value) =>
          onChange(
            value === 'curve'
              ? { kind: 'curve', first: 1 / 3, second: 2 / 3 }
              : { kind: value as Exclude<EasingKind, 'curve'> },
          )
        }
      >
        {kinds.map((kind) => (
          <option key={kind} value={kind}>
            {labels[kind]}
          </option>
        ))}
      </Select>
      {easing?.kind === 'curve' && (
        <div className={styles.twoColumns}>
          <Field
            label={text.motionCurveStart}
            type="number"
            min={0}
            max={easing.second}
            step={0.01}
            value={easing.first}
            onChange={(event) => {
              const first = normalized(Number(event.target.value));
              onChange({ kind: 'curve', first, second: Math.max(first, easing.second) });
            }}
          />
          <Field
            label={text.motionCurveEnd}
            type="number"
            min={easing.first}
            max={1}
            step={0.01}
            value={easing.second}
            onChange={(event) =>
              onChange({
                kind: 'curve',
                first: easing.first,
                second: Math.max(easing.first, normalized(Number(event.target.value))),
              })
            }
          />
        </div>
      )}
    </>
  );
}

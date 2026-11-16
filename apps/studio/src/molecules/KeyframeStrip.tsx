import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function KeyframeStrip({
  times,
  selectedTime,
  onSelect,
}: {
  times: number[];
  selectedTime: number;
  onSelect: (timeMs: number) => void;
}) {
  const text = useText();
  return (
    <div className={styles.keyframeStrip} role="group" aria-label={text.keyframeChoose}>
      {times.map((timeMs) => (
        <button
          key={timeMs}
          type="button"
          className={styles.keyframeChip}
          aria-label={text.keyframeAt.replace('{time}', (timeMs / 1000).toFixed(2))}
          aria-pressed={timeMs === selectedTime}
          onClick={() => onSelect(timeMs)}
        >
          <span aria-hidden="true" className={styles.keyframeDiamond} />
          {(timeMs / 1000).toFixed(2)}
        </button>
      ))}
    </div>
  );
}

import { Button } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function ActivityCard({
  label,
  message,
  progress,
  failed,
  busy,
  onCancel,
  onDismiss,
}: {
  label: string;
  message: string;
  progress?: number;
  failed?: boolean;
  busy?: boolean;
  onCancel?: () => void;
  onDismiss?: () => void;
}) {
  const text = useText();
  const value = progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  return (
    <section className={styles.activityCard} aria-label={label} data-failed={failed || undefined}>
      <strong>{label}</strong>
      <p role={failed ? 'alert' : 'status'}>{message}</p>
      {!failed && (
        <>
          <small>{text.overallProgress}</small>
          <div className={styles.activityProgress}>
            <progress max={1} value={value} aria-label={label + ' · ' + text.overallProgress} />
            <span>{value === undefined ? text.waiting : Math.round(value * 100) + '%'}</span>
          </div>
        </>
      )}
      <div className={styles.activityActions}>
        {onCancel && (
          <Button disabled={busy} onClick={onCancel}>
            {busy ? text.stopping : text.cancel}
          </Button>
        )}
        {onDismiss && <Button onClick={onDismiss}>{text.close}</Button>}
      </div>
    </section>
  );
}

import { Button } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function QueryState({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const text = useText();
  if (pending) {
    return (
      <p className={styles.hint} role="status">
        {text.waiting}
      </p>
    );
  }
  if (error) {
    return (
      <div className={styles.error} role="alert">
        <p>{error.message}</p>
        <Button onClick={retry}>{text.retry}</Button>
      </div>
    );
  }
  return null;
}

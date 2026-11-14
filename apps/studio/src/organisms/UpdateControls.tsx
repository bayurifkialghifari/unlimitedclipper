import { useState } from 'react';
import { Button } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';
import { isAndroidHost, openReleasePage } from '../lib/native';
import styles from '../styles/Studio.module.css';

export function UpdateControls({ configured }: { configured: boolean }) {
  const text = useText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (configured) {
        window.dispatchEvent(new Event('uc-check-updates'));
      } else {
        if (!(await openReleasePage())) {
          setMessage(text.checkUpdatesInBrowser);
        }
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <p className={styles.hint}>{configured ? text.updateHelp : text.previewUpdateHelp}</p>
      <Button type="button" disabled={pending || isAndroidHost()} onClick={() => void check()}>
        {pending ? text.checkingUpdates : text.checkUpdates}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

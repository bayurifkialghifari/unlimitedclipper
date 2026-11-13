import { useState } from 'react';
import { Button } from '@unlimitedclipper/ui';
import { assetUrl } from '../lib/api';
import { isAndroidHost, saveAndroidAsset } from '../lib/native';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function ExportDownload({ assetId, label }: { assetId: string; label: string }) {
  const text = useText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveAndroidAsset(assetId);
      setSaved(result.saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  }

  if (!isAndroidHost()) {
    return (
      <a className={styles.downloadLink} href={assetUrl(assetId, true)} download>
        {label}
      </a>
    );
  }

  return (
    <div>
      <Button disabled={pending} onClick={() => void save()}>
        {pending ? text.waiting : text.saveExport + ' ' + label}
      </Button>
      {saved && <p role="status">{text.exportSaved}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { DownloadSimpleIcon, WrenchIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { bytes } from '../lib/format';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import { QueryState } from '../molecules/QueryState';
import styles from '../styles/Studio.module.css';

export function NarrationPackSettings() {
  const text = useText();
  const client = useQueryClient();
  const pack = useQuery({ queryKey: ['narration-pack'], queryFn: api.narrationPack });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = jobs.data?.find(
    (job) =>
      job.kind === 'narration_pack' && ['queued', 'running', 'cancelling'].includes(job.status),
  );
  const downloaded = active
    ? Number((active.payload as { downloaded_bytes?: number }).downloaded_bytes ?? 0)
    : (pack.data?.downloaded_bytes ?? 0);

  async function download() {
    setPending(true);
    setError(null);
    try {
      await api.downloadNarrationPack();
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.settingsSection} aria-label={text.narrationPack}>
      <h2>{text.narrationPack}</h2>
      <p className={styles.hint}>{text.narrationPackDetail}</p>
      <QueryState pending={pack.isPending} error={pack.error} retry={() => void pack.refetch()} />
      {pack.data && (
        <>
          <p>
            {pack.data.name} · {bytes(pack.data.size_bytes)} · {pack.data.license}
          </p>
          <p>
            <a href={pack.data.source} target="_blank" rel="noreferrer">
              {pack.data.source}
            </a>
          </p>
          <p role="status">{pack.data.ready ? text.ready : text.missing}</p>
          {active && (
            <progress
              aria-label={text.narrationPack}
              value={downloaded}
              max={pack.data.size_bytes}
            />
          )}
          <Button
            icon={pack.data.ready ? <WrenchIcon /> : <DownloadSimpleIcon />}
            disabled={pending || Boolean(active) || isAndroidHost()}
            onClick={() => void download()}
          >
            {active || pending
              ? text.running
              : pack.data.ready
                ? text.repair
                : text.narrationPackDownload}
          </Button>
        </>
      )}
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

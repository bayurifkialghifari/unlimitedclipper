import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Field } from '@unlimitedclipper/ui';
import { api, uploadFile } from '../lib/api';
import { useText } from '../lib/i18n';
import { bytes } from '../lib/format';
import { isAndroidHost } from '../lib/native';
import { QueryState } from '../molecules/QueryState';
import type { PackStatus } from '../types';
import styles from '../styles/Studio.module.css';

export function QualityPackSettings() {
  const text = useText();
  const query = useQuery({ queryKey: ['quality-pack'], queryFn: api.qualityPack });
  const client = useQueryClient();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const active = jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status));

  async function importPack(file: File) {
    setPending(true);
    setError(null);
    try {
      await uploadFile<PackStatus>('/models/import-pack', file, setProgress);
      await client.invalidateQueries({ queryKey: ['quality-pack'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.settingsSection} aria-label={text.qualityPack}>
      <h2>{text.qualityPack}</h2>
      <p>{text.qualityPackDetail}</p>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data && (
        <p>
          {query.data.ready ? text.ready : text.missing} · {bytes(query.data.size_bytes)}
        </p>
      )}
      <Field
        label={text.importQualityPack}
        type="file"
        accept=".zip"
        disabled={pending || active || isAndroidHost()}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void importPack(file);
          }
          event.target.value = '';
        }}
      />
      {pending && <progress aria-label={text.importQualityPack} value={progress} max={1} />}
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

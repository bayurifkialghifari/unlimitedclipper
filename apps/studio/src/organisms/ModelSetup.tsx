import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { api, uploadFile } from '../lib/api';
import { useActivity } from '../lib/activity-store';
import { useText } from '../lib/i18n';
import { bytes } from '../lib/format';
import { isAndroidHost } from '../lib/native';
import { QueryState } from '../molecules/QueryState';
import type { Job } from '../types';
import styles from '../styles/Studio.module.css';

export function ModelSetup() {
  const text = useText();
  const client = useQueryClient();
  const models = useQuery({ queryKey: ['models'], queryFn: api.models, refetchInterval: 3000 });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const [selected, setSelected] = useState('whisper-small');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = models.data?.find((model) => model.id === selected) ?? models.data?.[0];
  const active = jobs.data?.find(
    (job) =>
      job.kind === 'model' &&
      (job.payload as { model_id?: string })?.model_id === model?.id &&
      ['queued', 'running', 'cancelling'].includes(job.status),
  );
  const busy = pending || Boolean(active) || isAndroidHost();
  const hints: Record<string, string> = {
    'whisper-small': text.modelSmallHint,
    'whisper-medium': text.modelMediumHint,
    'qwen3-4b': text.modelSelectionHint,
  };

  async function download() {
    if (!model) {
      return;
    }
    setPending(true);
    setError(null);
    const activity = useActivity.getState();
    const id = activity.start(model.name, text.waiting);
    try {
      const job = await api.downloadModel(model.id);
      client.setQueryData<Job[]>(['jobs'], (current) => [
        job,
        ...(current ?? []).filter((item) => item.id !== job.id),
      ]);
      activity.finish(id);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
      activity.fail(id, (failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function importFile(file: File) {
    if (!model) {
      return;
    }
    setPending(true);
    setError(null);
    const activity = useActivity.getState();
    const id = activity.start(model.name, text.uploadingModel);
    try {
      await uploadFile('/models/' + model.id + '/import', file, (progress) =>
        activity.update(id, progress, progress === 1 ? text.phaseVerify : text.uploadingModel),
      );
      activity.finish(id, text.modelInstalled);
      await client.invalidateQueries({ queryKey: ['models'] });
    } catch (failure) {
      setError((failure as Error).message);
      activity.fail(id, (failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.settingsSection} aria-label={text.modelSetup}>
      <h2>{text.modelSetup}</h2>
      <p className={styles.hint}>{text.modelDetail}</p>
      <QueryState
        pending={models.isPending}
        error={models.error}
        retry={() => void models.refetch()}
      />
      <Select
        label={text.modelChoice}
        value={model?.id ?? ''}
        disabled={pending || isAndroidHost() || !models.data?.length}
        onChange={setSelected}
      >
        {models.data?.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} · {bytes(model.size)} · {model.ready ? text.ready : text.missing}
          </option>
        ))}
      </Select>
      {model && (
        <>
          <p>{hints[model.id]}</p>
          <p className={styles.hint}>
            {bytes(model.size)} · {model.license} · {model.ready ? text.ready : text.missing}
          </p>
          <Button disabled={busy || model.ready} onClick={() => void download()}>
            {pending || active
              ? text.running
              : model.ready
                ? text.modelInstalled
                : text.downloadModel}
          </Button>
          {model.ready && (
            <Button disabled={busy} onClick={() => void download()}>
              {text.repair}
            </Button>
          )}
          <details>
            <summary>{text.manualModelImport}</summary>
            {jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status)) && (
              <p className={styles.hint}>{text.manualModelBusy}</p>
            )}
            <Field
              label={text.modelFile}
              type="file"
              accept=".bin,.gguf"
              disabled={
                busy ||
                jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status))
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                  void importFile(file);
                }
              }}
            />
          </details>
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

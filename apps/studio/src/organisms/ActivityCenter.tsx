import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useActivity } from '../lib/activity-store';
import { useText } from '../lib/i18n';
import { jobKind, jobMessage } from '../lib/job-text';
import { ActivityCard } from '../molecules/ActivityCard';
import type { Job } from '../types';
import styles from '../styles/Studio.module.css';

const activeStates = ['queued', 'running', 'cancelling'];

export function ActivityCenter() {
  const text = useText();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 1000 });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const transfers = useActivity((state) => state.transfers);
  const dismissTransfer = useActivity((state) => state.dismiss);
  const [openedAt] = useState(Date.now);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedKey = JSON.stringify(
    (query.data ?? [])
      .filter((job) => job.status === 'completed' && job.updated_at >= openedAt)
      .map((job) => ({ id: job.id, updatedAt: job.updated_at })),
  );
  useEffect(() => {
    const completed = JSON.parse(completedKey) as { id: string; updatedAt: number }[];
    const timers = completed.map((job) =>
      window.setTimeout(
        () => {
          setDismissed((current) => [...new Set([...current, job.id + ':completed'])]);
        },
        Math.max(0, job.updatedAt + 6000 - Date.now()),
      ),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [completedKey]);
  const jobs = (query.data ?? [])
    .filter(
      (job) =>
        job.kind !== 'storyboard' &&
        job.kind !== 'waveform' &&
        (activeStates.includes(job.status) ||
          (job.updated_at >= openedAt && !dismissed.includes(job.id + ':' + job.status))),
    )
    .sort((left, right) => {
      const priority = (job: Job) =>
        job.status === 'running' || job.status === 'cancelling'
          ? 0
          : job.status === 'queued'
            ? 1
            : 2;
      return priority(left) - priority(right) || right.updated_at - left.updated_at;
    });
  const activeCount =
    jobs.filter((job) => activeStates.includes(job.status)).length +
    transfers.filter((transfer) => transfer.status === 'running').length;

  async function cancel(job: Job) {
    setCancelling(job.id);
    setError(null);
    try {
      await api.cancelJob(job.id);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setCancelling(null);
    }
  }

  function label(job: Job) {
    const payload = job.payload as { name?: string; model_id?: string } | null;
    return (
      payload?.name ??
      models.data?.find((model) => model.id === payload?.model_id)?.name ??
      jobKind(text, job)
    );
  }

  if (!jobs.length && !transfers.length && !error && !query.error) {
    return null;
  }
  return (
    <aside className={styles.activityCenter} aria-label={text.activityTitle}>
      <strong>
        {text.activityTitle} {activeCount > 0 && '· ' + activeCount}
      </strong>
      <div id="activity-list" className={styles.activityList}>
        {transfers.map((transfer) => (
          <ActivityCard
            key={transfer.id}
            label={transfer.label}
            message={transfer.message}
            progress={transfer.progress}
            failed={transfer.status === 'failed'}
            onDismiss={
              transfer.status === 'running' ? undefined : () => dismissTransfer(transfer.id)
            }
          />
        ))}
        {jobs.map((job) => (
          <ActivityCard
            key={job.id}
            label={label(job)}
            message={job.error ?? jobMessage(text, job)}
            progress={job.stage === 'starting' && job.progress === 0 ? undefined : job.progress}
            failed={job.status === 'failed'}
            busy={cancelling === job.id || job.status === 'cancelling'}
            onCancel={activeStates.includes(job.status) ? () => void cancel(job) : undefined}
            onDismiss={
              activeStates.includes(job.status)
                ? undefined
                : () => setDismissed([...dismissed, job.id + ':' + job.status])
            }
          />
        ))}
        {(error || query.error) && (
          <p className={styles.error} role="alert">
            {error ?? query.error?.message}
          </p>
        )}
      </div>
    </aside>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { ArrowClockwiseIcon, XIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { jobKind, jobMessage, jobStatus } from '../lib/job-text';
import { date } from '../lib/format';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import styles from '../styles/Studio.module.css';

export function Jobs() {
  const text = useText();
  const query = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 3000 });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function action(id: string, retry: boolean) {
    setPending(id);
    setError(null);
    try {
      await (retry ? api.retryJob(id) : api.cancelJob(id));
      await query.refetch();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(null);
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader title={text.jobs} />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!query.isPending && !query.error && !query.data?.length && (
        <div className={styles.empty}>
          <h2>{text.noJobs}</h2>
          <p>{text.noJobsDetail}</p>
        </div>
      )}
      <div className={styles.list}>
        {query.data?.map((job) => (
          <article key={job.id} className={styles.jobRow}>
            <div className={styles.jobIdentity}>
              <h2>
                {jobKind(text, job)} · {jobStatus(text, job)}
              </h2>
            </div>
            <div className={styles.jobProgress}>
              <p>{jobMessage(text, job)}</p>
              <div className={styles.progressWithValue}>
                <progress max={1} value={job.progress} aria-label={jobMessage(text, job)} />
                <span>{Math.round(job.progress * 100)}%</span>
              </div>
            </div>
            <p className={styles.jobDate}>{date(job.created_at)}</p>
            <div className={styles.jobActions}>
              {['queued', 'running'].includes(job.status) && (
                <Button
                  icon={<XIcon />}
                  disabled={pending === job.id}
                  onClick={() => void action(job.id, false)}
                >
                  {text.cancel}
                </Button>
              )}
              {['failed', 'cancelled'].includes(job.status) && (
                <Button
                  icon={<ArrowClockwiseIcon />}
                  disabled={pending === job.id}
                  onClick={() => void action(job.id, true)}
                >
                  {text.retry}
                </Button>
              )}
            </div>
            {job.error && (
              <details className={styles.jobError}>
                <summary>{text.errorDetails}</summary>
                <p className={styles.error}>{job.error}</p>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

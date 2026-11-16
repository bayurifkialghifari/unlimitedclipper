import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { FilmSlateIcon, PlusIcon } from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { placeBroll } from '../lib/broll-placement';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import { flushEditor } from '../lib/save';
import type { BrollAsset, Job } from '../types';
import styles from '../styles/Studio.module.css';

type AutoBrollPayload = {
  revision?: number;
  no_match?: boolean;
  proposal?: {
    asset_id?: string;
    start_ms: number;
    source_quote: string;
    query: string;
    title: string;
    source_url: string;
    license: string;
  };
};

export function AutoBrollPanel({
  clipId,
  assets,
  disabled,
}: {
  clipId: string;
  assets: BrollAsset[];
  disabled: boolean;
}) {
  const text = useText();
  const client = useQueryClient();
  const draft = useEditor((state) => state.draft);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const [queuedJob, setQueuedJob] = useState<Job | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshedJob = useRef<string | null>(null);
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 2000 });
  const latest = useQuery({
    queryKey: ['auto-broll-proposal', clipId],
    queryFn: () => api.autoBrollProposal(clipId),
    refetchInterval: 2500,
  });
  const currentJob = jobs.data?.find((candidate) => candidate.id === queuedJob?.id);
  const job =
    currentJob ?? (latest.data?.id === queuedJob?.id ? latest.data : queuedJob) ?? latest.data;
  const payload = job?.payload as AutoBrollPayload | undefined;
  const proposal = payload?.proposal;
  const asset = assets.find((candidate) => candidate.asset_id === proposal?.asset_id);
  const running = Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));
  const modelReady = Boolean(models.data?.some((model) => model.id === 'qwen3-4b' && model.ready));
  const supported = Boolean(health.data?.editor_features.includes('auto_broll'));
  const transcribed = Boolean(draft && draft.document.words.length >= 3);
  const alreadyPlaced = Boolean(
    proposal &&
    draft?.document.visual_layers?.some(
      (layer) =>
        layer.kind === 'broll' &&
        layer.asset_id === proposal.asset_id &&
        layer.start_ms === proposal.start_ms,
    ),
  );
  const currentRevision = draft?.id === clipId && draft.revision === payload?.revision;
  const canApply = Boolean(
    job?.status === 'completed' &&
    proposal &&
    asset &&
    currentRevision &&
    !dirty &&
    !saving &&
    !disabled &&
    !alreadyPlaced,
  );

  useEffect(() => {
    if (job?.status === 'completed' && proposal?.asset_id && refreshedJob.current !== job.id) {
      refreshedJob.current = job.id;
      void client.invalidateQueries({ queryKey: ['broll-assets', draft?.project_id] });
    }
  }, [client, draft?.project_id, job?.id, job?.status, proposal?.asset_id]);

  async function generate() {
    if (!draft) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const current = useEditor.getState().draft;
      if (!current || current.id !== clipId) {
        throw new Error(text.autoBrollStale);
      }
      const queued = await api.autoBroll(clipId, current.revision);
      setQueuedJob(queued);
      await client.invalidateQueries({ queryKey: ['jobs'] });
      await client.invalidateQueries({ queryKey: ['auto-broll-proposal', clipId] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function apply() {
    const current = useEditor.getState();
    if (!canApply || !asset || !proposal || current.draft?.revision !== payload?.revision) {
      setError(text.autoBrollStale);
      return;
    }
    try {
      placeBroll(asset, clipId, proposal.start_ms);
      setError(null);
    } catch {
      setError(text.brollPlacementError);
    }
  }

  async function updateJob(action: 'retry' | 'cancel') {
    if (!job) {
      return;
    }
    setError(null);
    try {
      const updated = action === 'retry' ? await api.retryJob(job.id) : await api.cancelJob(job.id);
      setQueuedJob(updated);
      await client.invalidateQueries({ queryKey: ['jobs'] });
      await client.invalidateQueries({ queryKey: ['auto-broll-proposal', clipId] });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <section className={styles.autoBrollPanel} aria-label={text.autoBrollTitle}>
      <h4>{text.autoBrollTitle}</h4>
      <p className={styles.hint}>{text.autoBrollHint}</p>
      <div className={styles.autoBrollActions}>
        <Button
          icon={<FilmSlateIcon aria-hidden="true" />}
          disabled={
            disabled ||
            pending ||
            running ||
            !modelReady ||
            !supported ||
            !transcribed ||
            isAndroidHost()
          }
          onClick={() => void generate()}
        >
          {text.autoBrollGenerate}
        </Button>
        {running && job?.status !== 'cancelling' && (
          <Button onClick={() => void updateJob('cancel')}>{text.cancel}</Button>
        )}
        {job && ['failed', 'cancelled'].includes(job.status) && (
          <Button onClick={() => void updateJob('retry')}>{text.retry}</Button>
        )}
      </div>
      {!transcribed && <p className={styles.hint}>{text.autoBrollNoTranscript}</p>}
      {models.isSuccess && !modelReady && (
        <p className={styles.hint}>{text.autoBrollModelMissing}</p>
      )}
      {health.isSuccess && !supported && (
        <p className={styles.hint}>{text.autoBrollEngineMissing}</p>
      )}
      {running && (
        <>
          <p role="status">{job?.message}</p>
          <progress max={1} value={job?.progress ?? 0} aria-label={text.autoBrollTitle} />
        </>
      )}
      {job?.status === 'completed' && payload?.no_match && (
        <p role="status">{text.autoBrollNoMatch}</p>
      )}
      {job?.status === 'completed' && proposal && (
        <div className={styles.autoBrollResult}>
          <p>
            <strong>{proposal.title}</strong> · {proposal.license}
          </p>
          <p className={styles.hint}>
            {text.autoBrollSourceMoment}: {(proposal.start_ms / 1000).toFixed(1)}s · “
            {proposal.source_quote}”
          </p>
          {!currentRevision && <p className={styles.hint}>{text.autoBrollStale}</p>}
          {alreadyPlaced && <p role="status">{text.autoBrollApplied}</p>}
          <Button icon={<PlusIcon aria-hidden="true" />} disabled={!canApply} onClick={apply}>
            {text.autoBrollApply}
          </Button>
          {asset && (
            <video
              controls
              preload="metadata"
              src={assetUrl(asset.preview_asset_id ?? asset.asset_id)}
              aria-label={text.brollPreview + ' ' + asset.name}
            >
              <track kind="captions" />
            </video>
          )}
          <a href={proposal.source_url} target="_blank" rel="noreferrer">
            {text.brollSourceLink}
          </a>
        </div>
      )}
      {(error || job?.error || models.error || health.error || jobs.error || latest.error) && (
        <p role="alert" className={styles.error}>
          {error ??
            job?.error ??
            models.error?.message ??
            health.error?.message ??
            jobs.error?.message ??
            latest.error?.message}
        </p>
      )}
    </section>
  );
}

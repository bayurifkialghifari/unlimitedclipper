import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { ArrowClockwiseIcon, XIcon } from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { useText } from '../lib/i18n';
import type { Clip, Job } from '../types';
import styles from '../styles/Studio.module.css';

export function ClipReviewDialog({
  clip,
  posterAssetId,
  onClose,
}: {
  clip: Clip;
  posterAssetId?: string | null;
  onClose: () => void;
}) {
  const text = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const started = useRef(false);
  const [submitted, setSubmitted] = useState<Job | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: api.jobs,
    enabled: Boolean(submitted),
    refetchInterval: (query) => {
      const current = query.state.data?.find((item) => item.id === submitted?.id);
      return current && ['completed', 'failed', 'cancelled'].includes(current.status)
        ? false
        : 1000;
    },
  });
  const job = jobs.data?.find((item) => item.id === submitted?.id) ?? submitted;
  const payload = job?.payload as { preview_asset_id?: string } | undefined;
  const assetId = job?.status === 'completed' ? payload?.preview_asset_id : undefined;
  const busy = starting || Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));

  const prepare = useCallback(async () => {
    setStarting(true);
    setSubmitted(null);
    setError(null);
    setMediaError(false);
    try {
      const current = await api.clip(clip.id);
      setRevision(current.revision);
      const queued = await api.previewRender(current.id, current.revision);
      setSubmitted(queued);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStarting(false);
    }
  }, [clip.id]);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
    }
    dialog.current?.querySelector('button')?.focus();
    if (!started.current) {
      started.current = true;
      void prepare();
    }
  }, [prepare]);

  useEffect(() => {
    if (!assetId) {
      return;
    }
    const controller = new AbortController();
    function renew() {
      void fetch(assetUrl(assetId!), { method: 'HEAD', signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            setMediaError(true);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setMediaError(true);
          }
        });
    }
    renew();
    const timer = window.setInterval(renew, 30_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [assetId]);

  async function closePreview() {
    if (starting || closing) {
      return;
    }
    if (busy && job) {
      setClosing(true);
      try {
        await api.cancelJob(job.id);
        dialog.current?.close();
      } catch (failure) {
        setError((failure as Error).message);
      } finally {
        setClosing(false);
      }
      return;
    }
    dialog.current?.close();
  }

  const jobFailure =
    job?.status === 'failed'
      ? (job.error ?? text.clipReviewFailed)
      : job?.status === 'cancelled'
        ? text.clipReviewCancelled
        : job?.status === 'completed' && !assetId
          ? text.clipReviewFailed
          : null;
  const failure = error ?? (busy ? jobs.error?.message : null) ?? jobFailure;
  const progress = Math.round((job?.progress ?? 0) * 100);
  const status = starting
    ? text.clipReviewStarting
    : job?.status === 'queued'
      ? text.clipReviewQueued
      : job?.status === 'cancelling'
        ? text.clipReviewStopping
        : text.running + ' · ' + progress + '%';

  return (
    <dialog
      ref={dialog}
      className={styles.clipReviewDialog}
      aria-labelledby="clip-review-title"
      aria-describedby="clip-review-detail"
      onCancel={(event) => {
        event.preventDefault();
        void closePreview();
      }}
      onClose={onClose}
    >
      <div className={styles.clipReviewHeader}>
        <div>
          <h2 id="clip-review-title">{clip.name}</h2>
          <p id="clip-review-detail" className={styles.hint}>
            {text.clipReviewExact}
            {revision !== null && ' · ' + text.clipReviewRevision + ' ' + revision}
          </p>
        </div>
        <Button
          icon={<XIcon aria-hidden="true" />}
          disabled={starting || closing}
          onClick={() => void closePreview()}
        >
          {busy ? text.clipReviewCancel : text.close}
        </Button>
      </div>
      <div className={styles.clipReviewStage}>
        {assetId && !mediaError ? (
          <video
            src={assetUrl(assetId)}
            poster={posterAssetId ? assetUrl(posterAssetId) : undefined}
            controls
            playsInline
            preload="metadata"
            aria-label={clip.name}
            onError={() => setMediaError(true)}
          >
            <track kind="captions" />
          </video>
        ) : (
          <div className={styles.clipReviewPending} role="status">
            {busy ? status : text.clipReviewUnavailable}
          </div>
        )}
      </div>
      {busy && <progress aria-label={text.clipReviewStarting} max={1} value={job?.progress ?? 0} />}
      {mediaError && (
        <p role="alert" className={styles.error}>
          {text.clipReviewMediaError}
        </p>
      )}
      {failure && (
        <div className={styles.clipGalleryNotice} role="alert">
          <span>{failure}</span>
          <Button
            icon={<ArrowClockwiseIcon aria-hidden="true" />}
            disabled={closing}
            onClick={() => {
              if (jobs.error && busy) {
                void jobs.refetch();
              } else {
                void prepare();
              }
            }}
          >
            {text.retry}
          </Button>
        </div>
      )}
      {mediaError && !failure && (
        <Button icon={<ArrowClockwiseIcon aria-hidden="true" />} onClick={() => void prepare()}>
          {text.retry}
        </Button>
      )}
    </dialog>
  );
}

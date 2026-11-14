import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { ChartBarIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { outputDuration } from '../lib/timeline';
import { isAndroidHost } from '../lib/native';
import { QueryState } from '../molecules/QueryState';
import type { Clip } from '../types';
import styles from '../styles/Studio.module.css';

export function ClipRatingPanel({
  clip,
  modelReady,
  dirty,
  saving,
}: {
  clip: Clip;
  modelReady: boolean;
  dirty: boolean;
  saving: boolean;
}) {
  const text = useText();
  const client = useQueryClient();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const rating = useQuery({
    queryKey: ['clip-rating', clip.id],
    queryFn: () => api.clipRating(clip.id),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestJob = jobs.data
    ?.filter((job) => job.kind === 'assess' && job.clip_id === clip.id)
    .sort((left, right) => right.created_at - left.created_at)[0];
  const jobError =
    latestJob?.status === 'failed' && latestJob.updated_at > (rating.data?.created_at ?? 0)
      ? (latestJob.error ?? latestJob.message)
      : null;
  const running = jobs.data?.some(
    (job) =>
      job.kind === 'assess' &&
      job.clip_id === clip.id &&
      ['queued', 'running', 'cancelling'].includes(job.status),
  );
  const transcript = clip.document.words
    .map((word) => word.text.trim())
    .join(' ')
    .trim();
  const oversized =
    outputDuration(clip.document) > 120000 || new TextEncoder().encode(transcript).length > 4000;
  const stale = Boolean(rating.data && (rating.data.revision !== clip.revision || dirty || saving));
  function prerequisite() {
    if (isAndroidHost()) {
      return text.androidScope;
    }
    if (dirty || saving) {
      return text.ratingSaveFirst;
    }
    if (!transcript) {
      return text.ratingNoWords;
    }
    if (oversized) {
      return text.ratingTooLong;
    }
    if (!modelReady) {
      return text.ratingNeedsModel;
    }
    if (pending || running) {
      return text.ratingBusy;
    }
    return null;
  }
  const blocked = prerequisite();
  const labels: Record<string, string> = {
    hook: text.ratingHook,
    clarity: text.ratingClarity,
    flow: text.ratingFlow,
    payoff: text.ratingPayoff,
  };

  async function rate() {
    if (blocked) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.rateClip(clip.id, clip.revision);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  const score = rating.data?.score;
  function scoreLabel() {
    if (score === undefined) {
      return null;
    }
    if (score >= 85) {
      return text.ratingStrong;
    }
    if (score >= 70) {
      return text.ratingPromising;
    }
    if (score >= 50) {
      return text.ratingOrdinary;
    }
    return text.ratingWeak;
  }
  const tier = scoreLabel();

  return (
    <details className={styles.clipRating}>
      <summary>
        {text.clipPotential}
        {score !== undefined && !stale && <span>{score}/100</span>}
      </summary>
      <p className={styles.hint}>{text.ratingDetail}</p>
      <QueryState
        pending={rating.isPending}
        error={rating.error}
        retry={() => void rating.refetch()}
      />
      {rating.data ? (
        <>
          {stale && (
            <p className={styles.ratingStale} role="status">
              {text.ratingStale}
            </p>
          )}
          <div className={styles.ratingScore}>
            <output aria-label={text.clipPotential}>
              {rating.data.score}
              <small>/100</small>
            </output>
            <span>{tier}</span>
          </div>
          <p>{rating.data.summary}</p>
          <div className={styles.ratingDimensions}>
            {rating.data.dimensions.map((dimension) => (
              <div key={dimension.key}>
                <div className={styles.ratingDimensionHeader}>
                  <strong>{labels[dimension.key]}</strong>
                  <span>{dimension.score}/25</span>
                </div>
                <meter
                  min={0}
                  max={25}
                  value={dimension.score}
                  aria-label={labels[dimension.key]}
                />
                <p>{dimension.explanation}</p>
                {dimension.quote && <blockquote>{dimension.quote}</blockquote>}
              </div>
            ))}
          </div>
          <h3>{text.ratingSuggestions}</h3>
          <ul>
            {rating.data.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </>
      ) : (
        !rating.isPending && !rating.error && <p className={styles.hint}>{text.ratingUnrated}</p>
      )}
      {clip.score != null && !rating.data && (
        <p className={styles.hint}>
          {text.discoveryScore}: {clip.score}/100
        </p>
      )}
      <Button disabled={Boolean(blocked)} onClick={() => void rate()}>
        <ChartBarIcon aria-hidden="true" />
        {running || pending ? text.running : text.rateClip}
      </Button>
      {blocked && <p className={styles.hint}>{blocked}</p>}
      {(error || jobError) && !pending && !running && (
        <p className={styles.error} role="alert">
          {error || jobError}
        </p>
      )}
    </details>
  );
}

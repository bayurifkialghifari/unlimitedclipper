import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import { PencilSimpleIcon, PlayIcon } from '@phosphor-icons/react';
import { assetUrl } from '../lib/api';
import { useStoryboardFrames } from '../hooks/use-storyboard-frames';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { finalDuration } from '../lib/timeline';
import { clipRepresentativeTime } from '../lib/timeline-presentation';
import type { Clip, ProjectDetail } from '../types';
import { ClipReviewDialog } from './ClipReviewDialog';
import styles from '../styles/Studio.module.css';

export function ClipGallery({ detail, disabled }: { detail: ProjectDetail; disabled: boolean }) {
  const text = useText();
  const navigate = useNavigate();
  const gallery = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<string[]>([]);
  const [selected, setSelected] = useState<Clip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clipIds = detail.clips.map((clip) => clip.id).join(',');
  const observed =
    typeof IntersectionObserver === 'undefined' ? detail.clips.map((clip) => clip.id) : visible;
  const sourceTimes = detail.clips
    .filter((clip) => observed.includes(clip.id))
    .map((clip) => clipRepresentativeTime(clip.document));
  const storyboard = useStoryboardFrames(detail.project.id, sourceTimes);
  const failed = [...storyboard.frames.values()].some((frame) => frame.status === 'failed');

  useEffect(() => {
    const container = gallery.current;
    if (!container) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const id = entry.target.getAttribute('data-clip-id');
            if (!id) {
              continue;
            }
            if (entry.isIntersecting) {
              next.add(id);
            } else {
              next.delete(id);
            }
          }
          const ids = [...next].sort();
          return ids.join(',') === current.join(',') ? current : ids;
        });
      },
      { rootMargin: '180px 0px', threshold: 0.01 },
    );
    for (const card of container.querySelectorAll('[data-clip-id]')) {
      observer.observe(card);
    }
    return () => observer.disconnect();
  }, [clipIds, detail.clips]);

  return (
    <>
      {(error || storyboard.error || failed) && (
        <div className={styles.clipGalleryNotice} role="alert">
          <span>{error ?? storyboard.error?.message ?? text.framesFailed}</span>
          {(storyboard.error || failed) && (
            <Button
              onClick={() => {
                setError(null);
                const retry = failed ? storyboard.retryFailed() : storyboard.refetch();
                void retry.catch((failure: Error) => setError(failure.message));
              }}
            >
              {text.retry}
            </Button>
          )}
        </div>
      )}
      <div ref={gallery} className={styles.gallery}>
        {detail.clips.map((clip) => {
          const sourceTime = clipRepresentativeTime(clip.document);
          const frame = storyboard.frames.get(sourceTime);
          const poster = frame?.status === 'ready' ? frame.asset_id : undefined;
          return (
            <article key={clip.id} className={styles.projectCard} data-clip-id={clip.id}>
              <button
                type="button"
                className={styles.clipPosterButton}
                disabled={disabled}
                aria-label={text.previewClip + ': ' + clip.name}
                onClick={() => setSelected(clip)}
              >
                {poster ? (
                  <img src={assetUrl(poster)} width={320} height={180} alt="" loading="lazy" />
                ) : (
                  <span className={styles.clipPosterFallback}>
                    {frame?.status === 'unavailable'
                      ? text.clipFrameUnavailable
                      : frame?.status === 'failed'
                        ? text.clipFrameFailed
                        : text.clipFrameLoading}
                  </span>
                )}
                <span className={styles.clipPosterPlay} aria-hidden="true">
                  <PlayIcon weight="fill" />
                </span>
                <span className={styles.clipPosterDuration}>
                  {time(finalDuration(clip.document))}
                </span>
              </button>
              <div className={styles.projectInfo}>
                <h2>{clip.name}</h2>
                <p>
                  {text.clipSourceRange} {time(clip.document.start_ms)}–{time(clip.document.end_ms)}
                </p>
                <div className={styles.clipCardActions}>
                  <Button
                    icon={<PencilSimpleIcon aria-hidden="true" />}
                    disabled={disabled}
                    onClick={() => navigate('/studio/' + clip.id)}
                  >
                    {text.editClip}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {selected && (
        <ClipReviewDialog
          clip={selected}
          posterAssetId={storyboard.frames.get(clipRepresentativeTime(selected.document))?.asset_id}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

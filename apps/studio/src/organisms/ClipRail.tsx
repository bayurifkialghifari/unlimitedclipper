import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import { assetUrl } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useStoryboardFrames } from '../hooks/use-storyboard-frames';
import { useText } from '../lib/i18n';
import { finalDuration } from '../lib/timeline';
import { clipRepresentativeTime, timelineTime } from '../lib/timeline-presentation';
import type { ProjectDetail } from '../types';
import styles from '../styles/Editor.module.css';

export function ClipRail({
  detail,
  activeClipId,
  disabled,
}: {
  detail: ProjectDetail;
  activeClipId: string;
  disabled: boolean;
}) {
  const text = useText();
  const navigate = useNavigate();
  const rail = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<string[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clips = detail.clips;
  const clipIds = clips.map((clip) => clip.id).join(',');
  const sourceTimes = clips
    .filter((clip) => clip.id === activeClipId || visible.includes(clip.id))
    .map((clip) => clipRepresentativeTime(clip.document));
  const storyboard = useStoryboardFrames(detail.project.id, sourceTimes);
  const failed = [...storyboard.frames.values()].some((frame) => frame.status === 'failed');

  useEffect(() => {
    const container = rail.current;
    if (!container) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const id = entry.target.getAttribute('data-clip-id');
            if (id && entry.isIntersecting) {
              next.add(id);
            } else if (id) {
              next.delete(id);
            }
          }
          return [...next].sort();
        });
      },
      { root: container, rootMargin: '0px 180px', threshold: 0.01 },
    );
    for (const card of container.querySelectorAll('[data-clip-id]')) {
      observer.observe(card);
    }
    return () => observer.disconnect();
  }, [clipIds]);

  useEffect(() => {
    const container = rail.current;
    const card = [...(container?.querySelectorAll<HTMLElement>('[data-clip-id]') ?? [])].find(
      (item) => item.dataset.clipId === activeClipId,
    );
    if (container && card) {
      container.scrollLeft = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
    }
  }, [activeClipId, clipIds]);

  async function selectClip(id: string) {
    if (id === activeClipId || disabled || switching) {
      return;
    }
    setSwitching(id);
    setError(null);
    try {
      await flushEditor();
      navigate('/studio/' + id);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <section className={styles.clipRail} aria-label={text.clipLibrary}>
      <div className={styles.clipRailHeader}>
        <h2>{text.clipLibrary}</h2>
        <span>{clips.length}</span>
      </div>
      {(error || storyboard.error) && (
        <div className={styles.timelineNotice} role="alert">
          <span>{error ?? storyboard.error?.message}</span>
          {storyboard.error && (
            <Button onClick={() => void storyboard.refetch()}>{text.retry}</Button>
          )}
        </div>
      )}
      {failed && (
        <div className={styles.timelineNotice} role="alert">
          <span>{text.framesFailed}</span>
          <Button
            onClick={() => {
              void storyboard.retryFailed().catch((failure: Error) => setError(failure.message));
            }}
          >
            {text.retry}
          </Button>
        </div>
      )}
      <div ref={rail} className={styles.clipRailList}>
        {clips.map((clip, index) => {
          const timeMs = clipRepresentativeTime(clip.document);
          const frame = storyboard.frames.get(timeMs);
          return (
            <button
              key={clip.id}
              type="button"
              className={styles.clipRailCard}
              data-clip-id={clip.id}
              aria-pressed={clip.id === activeClipId}
              disabled={disabled || Boolean(switching)}
              onClick={() => void selectClip(clip.id)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                  return;
                }
                const cards = [
                  ...(rail.current?.querySelectorAll<HTMLButtonElement>('[data-clip-id]') ?? []),
                ];
                event.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(cards.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)),
                );
                cards[next]?.focus();
                cards[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
            >
              <span className={styles.clipRailImage}>
                {frame?.status === 'ready' && frame.asset_id ? (
                  <img
                    src={assetUrl(frame.asset_id)}
                    width={112}
                    height={64}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span>{timelineTime(timeMs)}</span>
                )}
              </span>
              <span className={styles.clipRailInfo}>
                <strong>
                  {index + 1}. {clip.name}
                </strong>
                <small>{timelineTime(finalDuration(clip.document))}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useEffect, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { FilmStripIcon } from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { flushEditor } from '../lib/save';
import { useText } from '../lib/i18n';
import { VideoPreview } from './VideoPreview';
import type { Project } from '../types';
import styles from '../styles/Studio.module.css';

export function ComposedPreview({
  project,
  sourceVideo,
}: {
  project?: Project;
  sourceVideo?: RefObject<HTMLVideoElement | null>;
}) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const [request, setRequest] = useState<{ job: string; clip: string; signature: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [exact, setExact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ['preview-jobs', request?.job],
    queryFn: api.jobs,
    enabled: Boolean(request),
    refetchInterval: 1000,
  });
  const job = jobs.data?.find((item) => item.id === request?.job);
  const payload = job?.payload as { preview_asset_id?: string } | undefined;
  const matches =
    request?.clip === draft?.id && request?.signature === JSON.stringify(draft?.document);
  const asset =
    exact && matches && job?.status === 'completed' ? payload?.preview_asset_id : undefined;
  const busy = pending || Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));

  useEffect(() => {
    const cached = matches && job?.status === 'completed' ? payload?.preview_asset_id : undefined;
    if (!cached) {
      return;
    }
    const controller = new AbortController();
    function renew() {
      void fetch(assetUrl(cached!), { method: 'HEAD', signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            setError(text.videoError);
          }
        })
        .catch((failure: Error) => {
          if (!controller.signal.aborted) {
            setError(failure.message);
          }
        });
    }
    renew();
    const timer = window.setInterval(renew, 30_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [matches, job?.status, payload?.preview_asset_id, text.videoError]);

  async function render() {
    if (!draft) {
      return;
    }
    const clip = draft.id;
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const current = useEditor.getState().draft;
      if (!current || current.id !== clip) {
        return;
      }
      const queued = await api.previewRender(clip, current.revision);
      if (useEditor.getState().draft?.id === clip) {
        setRequest({ job: queued.id, clip, signature: JSON.stringify(current.document) });
        setExact(true);
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.composedPreview}>
      <div className={styles.previewActions}>
        <div className={styles.previewModes} role="group" aria-label={text.previewVideo}>
          <Button
            aria-label={text.livePreview}
            aria-pressed={!asset}
            onClick={() => setExact(false)}
          >
            {text.livePreviewShort}
          </Button>
          {matches && payload?.preview_asset_id && job?.status === 'completed' && (
            <Button aria-pressed={Boolean(asset)} onClick={() => setExact(true)}>
              {text.editedPreview}
            </Button>
          )}
        </div>
        <Button
          className={styles.previewRenderAction}
          aria-label={text.renderPreview}
          icon={<FilmStripIcon aria-hidden="true" />}
          disabled={!draft || busy}
          onClick={() => void render()}
        >
          {text.renderPreviewShort}
        </Button>
        {busy && (
          <span className={styles.previewProgress} role="status">
            {text.running} · {Math.round((job?.progress ?? 0) * 100)}%
          </span>
        )}
      </div>
      {busy && <progress aria-label={text.renderPreview} max={1} value={job?.progress ?? 0} />}
      <VideoPreview project={project} mediaRef={sourceVideo} renderedAsset={asset} />
      {request && !matches && (
        <p role="status" className={styles.hint}>
          {text.previewStale}
        </p>
      )}
      {(error || job?.error) && (
        <p role="alert" className={styles.error}>
          {error ?? job?.error}
        </p>
      )}
    </div>
  );
}

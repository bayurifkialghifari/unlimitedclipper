import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import {
  DownloadSimpleIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { jobMessage } from '../lib/job-text';
import { time } from '../lib/format';
import { useProject } from '../hooks/use-engine';
import { QueryState } from '../molecules/QueryState';
import { ImportControls } from '../organisms/ImportControls';
import { VideoPreview } from '../organisms/VideoPreview';
import { ComposedPreview } from '../organisms/ComposedPreview';
import { Inspector } from '../organisms/Inspector';
import { ManualClipDialog } from '../organisms/ManualClipDialog';
import type { Clip } from '../types';
import styles from '../styles/Studio.module.css';

export function Studio() {
  const text = useText();
  const project = useProject();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 5000 });
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!project.data) {
      return;
    }
    const selected = project.data.clips.find((clip) => clip.id === useEditor.getState().clipId);
    if (selected) {
      useEditor.getState().acceptServer(selected);
    } else if (!useEditor.getState().draft && project.data.clips[0]) {
      useEditor.getState().selectClip(project.data.clips[0]);
    }
  }, [project.data]);

  async function action(work: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      await work();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function select(clip: Clip) {
    void action(async () => {
      useEditor.getState().selectClip(clip);
    });
  }
  const source = project.data?.project;
  const lastDiscovery = jobs.data?.find(
    (job) => job.kind === 'generate' && job.project_id === source?.id,
  );
  const noResults =
    (lastDiscovery?.payload as { qualifying_moments?: number } | undefined)?.qualifying_moments ===
    0;
  return (
    <>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>UnlimitedClipper / {text.studio}</span>
          <h1>{source?.name ?? text.studio}</h1>
          {source && (
            <p className={styles.hint}>
              {time(source.duration_ms)} · {source.width} × {source.height}
            </p>
          )}
        </div>
        <ImportControls inputRef={input} />
      </header>
      {editor.projectId && (
        <QueryState
          pending={project.isPending}
          error={project.error}
          retry={() => void project.refetch()}
        />
      )}
      {(error || editor.error) && (
        <div className={styles.error} role="alert">
          <p>{error ?? editor.error}</p>
          {editor.error && (
            <Button
              onClick={() => {
                const saved = project.data?.clips.find((clip) => clip.id === editor.clipId);
                if (saved && window.confirm(text.reload)) {
                  useEditor.getState().selectClip(saved);
                }
              }}
            >
              {text.reload}
            </Button>
          )}
        </div>
      )}
      <div className={styles.workspace}>
        {editor.draft &&
        ((editor.draft.document.segments?.length ?? 0) > 1 ||
          Boolean(editor.draft.document.visual_layers?.length) ||
          Boolean(editor.draft.document.audio_layers?.length)) ? (
          <ComposedPreview key={editor.draft.id} />
        ) : (
          <VideoPreview project={source} onImport={() => input.current?.click()} />
        )}
        <Inspector project={source} onManualClip={() => setManual(true)} />
      </div>
      <section className={styles.clipPanel} aria-label={text.noClips}>
        <div className={styles.panelHeading}>
          <h2>
            {source ? text.library + ' · ' + (project.data?.clips.length ?? 0) : text.noClips}
          </h2>
          <div className={styles.headerActions}>
            {editor.draft && (
              <>
                <span className={styles.hint} role="status">
                  {editor.saving ? text.saving : editor.dirty ? text.unsaved : text.saved}
                </span>
                <Button
                  aria-label={text.undo}
                  disabled={!editor.history.length || pending}
                  onClick={editor.undo}
                >
                  <ArrowCounterClockwiseIcon />
                </Button>
                <Button
                  aria-label={text.redo}
                  disabled={!editor.future.length || pending}
                  onClick={editor.redo}
                >
                  <ArrowClockwiseIcon />
                </Button>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => void action(() => api.clipAction(editor.draft!.id, 'export'))}
                >
                  <DownloadSimpleIcon size={18} aria-hidden="true" />
                  {text.exportClip}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    void action(() =>
                      api.deleteClip(editor.draft!.id).then(() => {
                        useEditor.setState({ draft: null, clipId: null, dirty: false });
                        return project.refetch();
                      }),
                    )
                  }
                >
                  {text.delete}
                </Button>
              </>
            )}
            <Button
              disabled={!source || !project.data?.clips.length || pending}
              onClick={() => void action(() => api.batchExport(source!.id))}
            >
              {text.exportAll}
            </Button>
          </div>
        </div>
        {!project.data?.clips.length ? (
          <p className={styles.hint}>
            {lastDiscovery?.status === 'completed' && noResults
              ? jobMessage(text, lastDiscovery)
              : text.noClipsDetail}
          </p>
        ) : (
          <div className={styles.clipRail}>
            {project.data.clips.map((clip) => (
              <button
                key={clip.id}
                className={styles.clipCard}
                disabled={pending}
                aria-pressed={editor.clipId === clip.id}
                onClick={() => select(clip)}
              >
                {source?.thumbnail_id && (
                  <img src={assetUrl(source.thumbnail_id)} className={styles.clipImage} alt="" />
                )}
                <span className={styles.clipInfo}>
                  <strong>{clip.name}</strong>
                  <small>
                    {time(clip.document.start_ms)} — {time(clip.document.end_ms)}
                  </small>
                  {clip.explanation && <small>{clip.explanation}</small>}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {manual && source && <ManualClipDialog project={source} onClose={() => setManual(false)} />}
    </>
  );
}

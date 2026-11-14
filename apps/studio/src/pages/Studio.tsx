import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import {
  DownloadSimpleIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { jobMessage } from '../lib/job-text';
import { time } from '../lib/format';
import { outputDuration } from '../lib/timeline';
import { useProject } from '../hooks/use-engine';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import { ImportControls } from '../organisms/ImportControls';
import { VideoPreview } from '../organisms/VideoPreview';
import { ComposedPreview } from '../organisms/ComposedPreview';
import { Inspector } from '../organisms/Inspector';
import { TranscriptPanel } from '../organisms/TranscriptPanel';
import { VisualTimeline } from '../organisms/VisualTimeline';
import { ManualClipDialog } from '../organisms/ManualClipDialog';
import type { Clip } from '../types';
import shared from '../styles/Studio.module.css';
import styles from '../styles/Editor.module.css';

export function Studio() {
  const text = useText();
  const project = useProject();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 5000 });
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState('source');
  const [panel, setPanel] = useState('transcript');

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
  const busy = pending || editor.timelinePending;
  const activePanel = editor.timelineSelection ? 'settings' : panel;

  return (
    <div className={styles.studio}>
      <PageHeader
        title={source?.name ?? text.studio}
        detail={
          source
            ? time(source.duration_ms) + ' · ' + source.width + ' × ' + source.height
            : text.offline
        }
        children={<ImportControls inputRef={input} />}
      />
      {editor.projectId && (
        <QueryState
          pending={project.isPending}
          error={project.error}
          retry={() => void project.refetch()}
        />
      )}
      {(error || editor.error) && (
        <div className={shared.error} role="alert">
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
      <div className={styles.editorToolbar}>
        <div className={styles.actions} aria-label={text.previewVideo}>
          <Button aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
            {text.sourcePreview}
          </Button>
          <Button
            aria-pressed={mode === 'edited'}
            disabled={!editor.draft}
            onClick={() => setMode('edited')}
          >
            {text.editedPreview}
          </Button>
        </div>
        <div className={styles.actions}>
          {editor.draft && (
            <>
              <span className={styles.hint} role="status">
                {editor.saving ? text.saving : editor.dirty ? text.unsaved : text.saved}
              </span>
              <Button
                aria-label={text.undo}
                disabled={!editor.history.length || busy}
                onClick={editor.undo}
              >
                <ArrowCounterClockwiseIcon />
              </Button>
              <Button
                aria-label={text.redo}
                disabled={!editor.future.length || busy}
                onClick={editor.redo}
              >
                <ArrowClockwiseIcon />
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void action(() => api.clipAction(editor.draft!.id, 'export'))}
              >
                <DownloadSimpleIcon aria-hidden="true" />
                {text.exportClip}
              </Button>
              <Button
                aria-label={text.delete}
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api.deleteClip(editor.draft!.id);
                    useEditor.setState({
                      draft: null,
                      clipId: null,
                      dirty: false,
                      timelineSelection: null,
                    });
                    await project.refetch();
                  })
                }
              >
                <TrashIcon />
              </Button>
            </>
          )}
          <Button
            disabled={!source || !project.data?.clips.length || busy}
            onClick={() => void action(() => api.batchExport(source!.id))}
          >
            {text.exportAll}
          </Button>
        </div>
      </div>
      <div className={styles.mobileTabs} aria-label={text.options}>
        {[
          ['transcript', text.transcript],
          ['settings', text.options],
        ].map(([value, label]) => (
          <Button
            key={value}
            aria-pressed={activePanel === value}
            onClick={() => {
              useEditor.setState({ timelineSelection: null });
              setPanel(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className={styles.editorBody}>
        <aside className={styles.leftPanel} data-visible={activePanel === 'transcript'}>
          <section className={styles.library} aria-label={text.clipLibrary}>
            <h2>
              {text.clipLibrary} · {project.data?.clips.length ?? 0}
            </h2>
            {!project.data?.clips.length ? (
              <p className={styles.hint}>
                {lastDiscovery?.status === 'completed' && noResults
                  ? jobMessage(text, lastDiscovery)
                  : text.noClipsDetail}
              </p>
            ) : (
              <div className={styles.clipList}>
                {project.data.clips.map((clip) => (
                  <button
                    key={clip.id}
                    disabled={busy}
                    aria-pressed={editor.clipId === clip.id}
                    onClick={() => select(clip)}
                  >
                    {source?.thumbnail_id && <img src={assetUrl(source.thumbnail_id)} alt="" />}
                    <span>
                      <strong>{clip.name}</strong>
                      <small>{time(outputDuration(clip.document))}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <TranscriptPanel key={editor.clipId} />
        </aside>
        <div className={styles.previewSlot}>
          <div className={styles.playerSlot} hidden={mode !== 'source'}>
            <VideoPreview
              project={source}
              onImport={() => input.current?.click()}
              active={mode === 'source'}
            />
          </div>
          {editor.draft && (
            <div className={styles.playerSlot} hidden={mode !== 'edited'}>
              <ComposedPreview key={editor.draft.id} active={mode === 'edited'} />
            </div>
          )}
        </div>
        <div className={styles.rightPanel} data-visible={activePanel === 'settings'}>
          <Inspector project={source} onManualClip={() => setManual(true)} />
        </div>
      </div>
      {editor.draft && (
        <VisualTimeline
          key={editor.draft.id}
          sourceDuration={source?.duration_ms ?? editor.draft.document.end_ms}
        />
      )}
      {manual && source && <ManualClipDialog project={source} onClose={() => setManual(false)} />}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Select } from '@unlimitedclipper/ui';
import {
  ArrowLeftIcon,
  DownloadSimpleIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { applyLayout } from '../lib/editor-layout';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import { isStudioTool, StudioToolMenu, type StudioTool } from '../molecules/StudioToolMenu';
import { ComposedPreview } from '../organisms/ComposedPreview';
import { Inspector } from '../organisms/Inspector';
import { VisualTimeline } from '../organisms/VisualTimeline';
import { ClipRail } from '../organisms/ClipRail';
import shared from '../styles/Studio.module.css';
import styles from '../styles/Editor.module.css';
import type { Layout } from '../types';

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable]'))
  );
}

export function Studio() {
  const text = useText();
  const { clipId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editor = useEditor();
  const clip = useQuery({
    queryKey: ['clip', clipId],
    queryFn: () => api.clip(clipId!),
    enabled: Boolean(clipId),
  });
  const project = useQuery({
    queryKey: ['project', clip.data?.project_id],
    queryFn: () => api.project(clip.data!.project_id),
    enabled: Boolean(clip.data),
  });
  const sourceVideo = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(360);

  useEffect(() => {
    const saved = clip.data;
    if (!saved) {
      return;
    }
    let disposed = false;
    async function select() {
      const current = useEditor.getState();
      if (current.clipId === saved!.id) {
        current.acceptServer(saved!);
        return;
      }
      try {
        await flushEditor();
        if (!disposed) {
          useEditor.getState().selectProject(saved!.project_id);
          useEditor.getState().selectClip(saved!);
        }
      } catch (failure) {
        if (!disposed) {
          setError((failure as Error).message);
        }
      }
    }
    void select();
    return () => {
      disposed = true;
    };
  }, [clip.data]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') {
        return;
      }
      const current = useEditor.getState();
      if (pending || current.timelinePending || current.draft?.id !== clipId) {
        return;
      }
      event.preventDefault();
      if (key === 'y' || event.shiftKey) {
        current.redo();
      } else {
        current.undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clipId, pending]);

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

  const source = project.data?.project;
  const ready = editor.draft?.id === clipId;
  const busy = pending || editor.timelinePending;
  const requestedTool = searchParams.get('panel');
  const activeTool: StudioTool = editor.timelineSelection
    ? editor.timelineSelection.kind === 'audio'
      ? 'audio'
      : editor.timelineSelection.kind === 'filter'
        ? 'style'
        : editor.timelineSelection.kind === 'visual' &&
            editor.draft?.document.visual_layers?.some(
              (layer) => layer.id === editor.timelineSelection?.id && layer.kind === 'broll',
            )
          ? 'broll'
          : 'timeline'
    : isStudioTool(requestedTool)
      ? requestedTool
      : 'captions';
  return (
    <div className={styles.studio}>
      <PageHeader title={ready ? editor.draft!.name : text.studio} detail={source?.name}>
        <Button
          icon={<ArrowLeftIcon />}
          disabled={busy}
          onClick={() =>
            void action(async () => {
              navigate(source ? '/projects/' + source.id : '/projects');
            })
          }
        >
          {text.clipLibrary}
        </Button>
      </PageHeader>
      <QueryState
        pending={clip.isPending || Boolean(clip.data && project.isPending)}
        error={clip.error ?? project.error}
        retry={() => {
          void clip.refetch();
          if (clip.data) {
            void project.refetch();
          }
        }}
      />
      {(error || editor.error) && (
        <p className={shared.error} role="alert">
          {error ?? editor.error}
        </p>
      )}
      {ready && (
        <>
          <div className={styles.editorToolbar}>
            <div className={styles.editorSetup}>
              <div className={styles.editorLayoutSelect}>
                <Select
                  label={text.format}
                  value={editor.draft!.document.layout}
                  onChange={(value) =>
                    editor.change((document) => {
                      applyLayout(document, value as Layout, source);
                    })
                  }
                >
                  {(['portrait', 'square', 'landscape', 'contain', 'blur', 'gaming'] as const).map(
                    (layout) => (
                      <option
                        key={layout}
                        value={layout}
                        disabled={
                          Boolean(editor.draft!.document.camera_motion?.length) &&
                          !['portrait', 'square', 'landscape'].includes(layout)
                        }
                      >
                        {text[layout]}
                      </option>
                    ),
                  )}
                </Select>
                {Boolean(editor.draft!.document.camera_motion?.length) && (
                  <small>{text.cameraMotionLayoutLimit}</small>
                )}
              </div>
              <span className={styles.hint} role="status">
                {editor.saving ? text.saving : editor.dirty ? text.unsaved : text.saved}
              </span>
            </div>
            <div className={styles.actions}>
              <Button
                className={styles.iconAction}
                aria-label={text.undo}
                aria-keyshortcuts="Control+Z Meta+Z"
                disabled={!editor.history.length || busy}
                onClick={editor.undo}
                icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
              />
              <Button
                className={styles.iconAction}
                aria-label={text.redo}
                aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
                disabled={!editor.future.length || busy}
                onClick={editor.redo}
                icon={<ArrowClockwiseIcon aria-hidden="true" />}
              />
              <Button
                variant="primary"
                icon={<DownloadSimpleIcon />}
                disabled={busy}
                onClick={() => void action(() => api.clipAction(clipId!, 'export'))}
              >
                {text.exportClip}
              </Button>
            </div>
          </div>
          <StudioToolMenu
            active={activeTool}
            onSelect={(tool) => {
              useEditor.setState({ timelineSelection: null });
              setSearchParams(
                (previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('panel', tool);
                  return next;
                },
                { replace: true },
              );
            }}
          />
          <div
            className={styles.editorBody}
            style={{ '--inspector-width': inspectorWidth + 'px' } as React.CSSProperties}
          >
            <div className={styles.previewSlot}>
              <ComposedPreview key={clipId} project={source} sourceVideo={sourceVideo} />
            </div>
            <button
              type="button"
              className={styles.inspectorResize}
              role="slider"
              aria-label={text.inspectorWidth}
              aria-orientation="vertical"
              tabIndex={0}
              aria-valuemin={320}
              aria-valuemax={480}
              aria-valuenow={inspectorWidth}
              onKeyDown={(event) => {
                if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  setInspectorWidth(event.key === 'Home' ? 320 : 480);
                }
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  setInspectorWidth(
                    Math.max(
                      320,
                      Math.min(480, inspectorWidth + (event.key === 'ArrowLeft' ? 20 : -20)),
                    ),
                  );
                }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                  setInspectorWidth(Math.max(320, Math.min(480, bounds.right - event.clientX)));
                }
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            />
            <div className={styles.rightPanel}>
              <Inspector project={source} sourceVideo={sourceVideo} focused />
            </div>
          </div>
          <VisualTimeline
            key={clipId}
            sourceDuration={source?.duration_ms ?? editor.draft!.document.end_ms}
            hasAudio={source?.has_audio ?? false}
          />
          {project.data && (
            <ClipRail detail={project.data} activeClipId={clipId!} disabled={busy} />
          )}
        </>
      )}
      {source && (
        <span className={styles.hint}>
          {time(source.duration_ms)} · {source.width} × {source.height}
        </span>
      )}
    </div>
  );
}

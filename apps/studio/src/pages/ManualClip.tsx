import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field } from '@unlimitedclipper/ui';
import { ArrowLeftIcon, ScissorsIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { PageHeader } from '../molecules/PageHeader';
import { QueryState } from '../molecules/QueryState';
import { VideoPreview } from '../organisms/VideoPreview';
import styles from '../styles/Studio.module.css';

export function ManualClip() {
  const { projectId } = useParams();
  const text = useText();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.project(projectId!),
    enabled: Boolean(projectId),
  });
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(30);
  const [name, setName] = useState(text.manualClip);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = query.data?.project;
  const maximum = (project?.duration_ms ?? 0) / 1000;
  const valid =
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= maximum;

  useEffect(() => {
    let disposed = false;
    void flushEditor()
      .then(() => {
        if (!disposed && projectId) {
          useEditor.getState().selectProject(projectId);
          useEditor.getState().seekTo(0);
          setReady(true);
        }
      })
      .catch((failure: Error) => {
        if (!disposed) {
          setError(failure.message);
        }
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  async function create() {
    if (!valid || !project) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const clip = await api.createClip(
        project.id,
        name.trim(),
        Math.round(start * 1000),
        Math.round(end * 1000),
      );
      navigate('/studio/' + clip.id);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title={text.manualClip} detail={project?.name}>
        <Button
          disabled={pending}
          icon={<ArrowLeftIcon />}
          onClick={() => navigate('/projects/' + projectId)}
        >
          {text.clipLibrary}
        </Button>
      </PageHeader>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {ready && project && (
        <div className={styles.projectWorkspace}>
          <div className={styles.manualPreview}>
            <VideoPreview project={project} />
          </div>
          <form
            className={styles.rangeForm}
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Field
              label={text.name}
              value={name}
              required
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
            />
            <Field
              label={text.sourceStartSeconds}
              type="number"
              min={0}
              max={maximum}
              step={0.001}
              value={start}
              required
              onChange={(event) => setStart(Number(event.target.value))}
            />
            <Button
              disabled={pending}
              onClick={() => setStart(Math.round(useEditor.getState().playhead) / 1000)}
            >
              {text.rangeStartHere}
            </Button>
            <Field
              label={text.sourceEndSeconds}
              type="number"
              min={start + 0.001}
              max={maximum}
              step={0.001}
              value={end}
              required
              onChange={(event) => setEnd(Number(event.target.value))}
            />
            <Button
              disabled={pending}
              onClick={() => setEnd(Math.round(useEditor.getState().playhead) / 1000)}
            >
              {text.rangeEndHere}
            </Button>
            <p className={styles.hint}>{text.manualClipHint}</p>
            <Button
              type="submit"
              variant="primary"
              icon={<ScissorsIcon />}
              disabled={pending || !valid || !name.trim()}
            >
              {pending ? text.running : text.editClip}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

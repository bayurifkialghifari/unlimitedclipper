import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import {
  ArrowLeftIcon,
  ScissorsIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { flushEditor } from '../lib/save';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { finalDuration } from '../lib/timeline';
import { PageHeader } from '../molecules/PageHeader';
import { QueryState } from '../molecules/QueryState';
import { Inspector } from '../organisms/Inspector';
import styles from '../styles/Studio.module.css';

export function ProjectDetail() {
  const { projectId } = useParams();
  const text = useText();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.project(projectId!),
    enabled: Boolean(projectId),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let disposed = false;
    void flushEditor()
      .then(() => {
        if (!disposed && projectId) {
          useEditor.getState().selectProject(projectId);
          useEditor.getState().seekTo(0);
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

  const project = query.data?.project;
  return (
    <div className={styles.page}>
      <PageHeader
        title={project?.name ?? text.clipLibrary}
        detail={project && time(project.duration_ms)}
      >
        <Button icon={<ArrowLeftIcon />} onClick={() => navigate('/projects')}>
          {text.library}
        </Button>
        <Button
          icon={<ScissorsIcon />}
          variant="primary"
          disabled={!project || Boolean(error)}
          onClick={() => navigate('/projects/' + projectId + '/manual')}
        >
          {text.manualClip}
        </Button>
        <Button
          icon={<DownloadSimpleIcon />}
          disabled={pending || !query.data?.clips.length}
          onClick={() => {
            setPending(true);
            setError(null);
            void api
              .batchExport(projectId!)
              .catch((failure: Error) => setError(failure.message))
              .finally(() => setPending(false));
          }}
        >
          {text.exportAll}
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
      {project && (
        <div className={styles.projectWorkspace}>
          <section aria-label={text.clipLibrary}>
            {!query.data?.clips.length && (
              <div className={styles.empty}>
                <h2>{text.noClips}</h2>
                <p>{text.noClipsDetail}</p>
              </div>
            )}
            {Boolean(query.data?.clips.length) && (
              <p className={styles.hint}>{text.perClipStyleHint}</p>
            )}
            <div className={styles.gallery}>
              {query.data?.clips.map((clip) => (
                <article key={clip.id} className={styles.projectCard}>
                  {project.thumbnail_id && (
                    <img
                      className={styles.projectImage}
                      src={assetUrl(project.thumbnail_id)}
                      alt=""
                    />
                  )}
                  <div className={styles.projectInfo}>
                    <h2>{clip.name}</h2>
                    <p>
                      {time(finalDuration(clip.document))} · {time(clip.document.start_ms)} –{' '}
                      {time(clip.document.end_ms)}
                    </p>
                    <div className={styles.clipCardActions}>
                      <Button
                        icon={<PencilSimpleIcon aria-hidden="true" />}
                        variant="primary"
                        disabled={Boolean(error)}
                        onClick={() => navigate('/studio/' + clip.id)}
                      >
                        {text.editClip}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
          {!error && <Inspector key={project.id} project={project} />}
        </div>
      )}
    </div>
  );
}

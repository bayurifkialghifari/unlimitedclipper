import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Field } from '@unlimitedclipper/ui';
import { api, assetUrl } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useText } from '../lib/i18n';
import { time, date } from '../lib/format';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import { ImportControls } from '../organisms/ImportControls';
import { DeleteProjectDialog } from '../organisms/DeleteProjectDialog';
import type { Project } from '../types';
import styles from '../styles/Studio.module.css';

export function Projects() {
  const text = useText();
  const query = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  return (
    <div className={styles.page}>
      <PageHeader title={text.library}>
        <Field
          label={text.search}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </PageHeader>
      <ImportControls inputRef={inputRef} />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!query.isPending && !query.error && !query.data?.length && (
        <div className={styles.empty}>
          <h2>{text.noProjects}</h2>
          <p>{text.noProjectsDetail}</p>
        </div>
      )}
      <div className={styles.gallery + ' ' + styles.projectGallery}>
        {query.data
          ?.filter((project) =>
            project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )
          .map((project) => (
            <article key={project.id} className={styles.projectCard}>
              {project.thumbnail_id && (
                <img className={styles.projectImage} src={assetUrl(project.thumbnail_id)} alt="" />
              )}
              <div className={styles.projectInfo}>
                <h2>{project.name}</h2>
                <p>
                  {time(project.duration_ms)} · {date(project.created_at)}
                </p>
                <div className={styles.headerActions}>
                  <Button
                    disabled={pending}
                    variant="primary"
                    onClick={() =>
                      void action(async () => {
                        navigate('/projects/' + project.id);
                      })
                    }
                  >
                    {text.open}
                  </Button>
                  <Button disabled={pending} onClick={() => setDeleting(project)}>
                    {text.delete}
                  </Button>
                </div>
              </div>
            </article>
          ))}
      </div>
      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

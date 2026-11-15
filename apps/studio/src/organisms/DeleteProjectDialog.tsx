import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { flushEditor } from '../lib/save';
import type { Project } from '../types';
import styles from '../styles/Studio.module.css';

export function DeleteProjectDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const text = useText();
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector('button')?.focus();
  }, []);

  async function confirm() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      await api.deleteProject(project.id);
      if (useEditor.getState().projectId === project.id) {
        localStorage.removeItem('uc-project');
        useEditor.setState({
          projectId: null,
          clipId: null,
          draft: null,
          dirty: false,
          history: [],
          future: [],
        });
      }
      await client.invalidateQueries({ queryKey: ['projects'] });
      dialog.current?.close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="delete-project-title"
      aria-describedby="delete-project-description"
      onCancel={(event) => {
        if (pending) {
          event.preventDefault();
        }
      }}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <h2 id="delete-project-title">{text.deleteProjectTitle}</h2>
        <div className={styles.dialogBody}>
          <p id="delete-project-description">{text.deleteConfirm}</p>
          <strong className={styles.dialogProjectName}>{project.name}</strong>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.dialogActions}>
          <Button disabled={pending} onClick={() => dialog.current?.close()}>
            {text.cancel}
          </Button>
          <Button variant="danger" type="submit" disabled={pending}>
            {pending ? text.running : text.deleteProjectAction}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

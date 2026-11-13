import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import type { Project } from '../types';
import styles from '../styles/Studio.module.css';

export function ManualClipDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const text = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const playhead = useEditor.getState().playhead / 1000;
  const [start, setStart] = useState(
    Math.min(playhead, Math.max(0, project.duration_ms / 1000 - 1)),
  );
  const [end, setEnd] = useState(Math.min(project.duration_ms / 1000, start + 30));
  const [name, setName] = useState(text.manualClip);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="manual-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          void flushEditor()
            .then(() =>
              api.createClip(project.id, name, Math.round(start * 1000), Math.round(end * 1000)),
            )
            .then(async (clip) => {
              useEditor.getState().selectClip(clip);
              await client.invalidateQueries({ queryKey: ['project', project.id] });
              onClose();
            })
            .catch((failure: Error) => setError(failure.message))
            .finally(() => setPending(false));
        }}
      >
        <h2 id="manual-title">{text.manualClip}</h2>
        <div className={styles.dialogBody}>
          <Field
            label={text.name}
            value={name}
            required
            maxLength={150}
            onChange={(event) => setName(event.target.value)}
          />
          <div className={styles.twoColumns}>
            <Field
              label={text.start + ' (s)'}
              type="number"
              min={0}
              max={end - 0.001}
              step={0.001}
              value={start}
              required
              onChange={(event) => setStart(Number(event.target.value))}
            />
            <Field
              label={text.end + ' (s)'}
              type="number"
              min={start + 0.001}
              max={project.duration_ms / 1000}
              step={0.001}
              value={end}
              required
              onChange={(event) => setEnd(Number(event.target.value))}
            />
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.dialogActions}>
          <Button disabled={pending} onClick={onClose}>
            {text.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={pending}>
            {text.manualClip}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

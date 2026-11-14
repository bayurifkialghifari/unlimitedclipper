import { useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { UploadSimpleIcon } from '@phosphor-icons/react';
import { api, uploadFile } from '../lib/api';
import { useActivity } from '../lib/activity-store';
import { useText } from '../lib/i18n';
import { importAndroidVideo, isAndroidHost } from '../lib/native';
import type { Job } from '../types';
import styles from '../styles/Studio.module.css';

export function ImportControls({
  inputRef,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const text = useText();
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const form = useRef<HTMLFormElement>(null);

  async function run(label: string, message: string, action: (id: string) => Promise<Job | null>) {
    setPending(true);
    setError(null);
    const activity = useActivity.getState();
    const id = activity.start(label, message);
    try {
      const job = await action(id);
      if (job) {
        client.setQueryData<Job[]>(['jobs'], (current) => [
          job,
          ...(current ?? []).filter((item) => item.id !== job.id),
        ]);
      }
      activity.finish(id);
      await client.invalidateQueries({ queryKey: ['jobs'] });
      setUrl('');
    } catch (failure) {
      setError((failure as Error).message);
      activity.fail(id, (failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className={styles.headerActions}>
        <form
          ref={form}
          className={styles.sourceForm}
          onSubmit={(event) => {
            event.preventDefault();
            void run(text.importVideo, text.preparingImport, () => api.youtube(url));
          }}
        >
          <input
            className={styles.sourceInput}
            type="url"
            aria-label={text.pasteLink}
            placeholder={text.pasteLink}
            required
            value={url}
            disabled={pending || isAndroidHost()}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" disabled={pending || !url || isAndroidHost()}>
            {text.importVideo}
          </Button>
        </form>
        <Button
          disabled={pending}
          onClick={() => {
            if (isAndroidHost()) {
              void run(text.importFile, text.preparingImport, importAndroidVideo);
            } else if (isTauri()) {
              void run(text.importFile, text.preparingImport, async () => {
                const path = await open({
                  multiple: false,
                  filters: [
                    {
                      name: text.source,
                      extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'ts'],
                    },
                  ],
                });
                if (path) {
                  return api.local(path);
                }
                return null;
              });
            } else {
              inputRef.current?.click();
            }
          }}
        >
          <UploadSimpleIcon size={18} aria-hidden="true" />
          {pending && isAndroidHost() ? text.waiting : text.importFile}
        </Button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".mp4,.mov,.mkv,.webm,.avi,.m4v,.ts"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void run(file.name, text.uploadingVideo, (id) =>
                uploadFile<Job>('/imports/upload', file, (progress) =>
                  useActivity
                    .getState()
                    .update(
                      id,
                      progress,
                      progress === 1 ? text.preparingImport : text.uploadingVideo,
                    ),
                ),
              );
            }
            event.target.value = '';
          }}
        />
      </div>
      {isAndroidHost() && <p className={styles.hint}>{text.androidYoutubeUnavailable}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

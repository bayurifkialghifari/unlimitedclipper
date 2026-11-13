import { useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { UploadSimpleIcon } from '@phosphor-icons/react';
import { api, uploadFile } from '../lib/api';
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
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const form = useRef<HTMLFormElement>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['jobs'] });
      setUrl('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
      setProgress(null);
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
            void run(() => api.youtube(url));
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
              void run(importAndroidVideo);
            } else if (isTauri()) {
              void run(async () => {
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
                  await api.local(path);
                }
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
              void run(() => uploadFile<Job>('/imports/upload', file, setProgress));
            }
            event.target.value = '';
          }}
        />
      </div>
      {isAndroidHost() && <p className={styles.hint}>{text.androidYoutubeUnavailable}</p>}
      {progress !== null && <progress aria-label={text.importFile} max={1} value={progress} />}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

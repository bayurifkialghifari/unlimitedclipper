import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from '@unlimitedclipper/ui';
import { api, request } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

type Update = { version: string; ready: boolean; restart_required?: boolean };
const clientId = crypto.randomUUID();

export function UpdateNotice() {
  const text = useText();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const component = useQuery({
    queryKey: ['updates'],
    queryFn: () => request<Update>('/updates'),
    refetchInterval: 5000,
  });
  const [application, setApplication] = useState<Update | null>(null);
  const [remaining, setRemaining] = useState(60);
  const [postponed, setPostponed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const installing = useRef(false);
  const dirty = useEditor((state) => state.dirty || state.saving);
  const busy =
    dirty || jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status));
  const ready = application?.ready || component.data?.ready;
  const auto = settings.data?.auto_update;

  useEffect(() => {
    const report = () => {
      void request('/activity', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId, dirty }),
      }).catch(() => {});
    };
    report();
    const timer = window.setInterval(report, 10_000);
    return () => window.clearInterval(timer);
  }, [dirty]);

  useEffect(() => {
    async function check() {
      setError(null);
      try {
        if (settings.data?.component_feed) {
          await request('/updates/check', { method: 'POST' });
        }
        if (isTauri() && settings.data?.update_feed) {
          setApplication(await invoke<Update>('check_application_update'));
        }
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    }
    const manualCheck = () => void check();
    window.addEventListener('uc-check-updates', manualCheck);
    if (auto) {
      void check();
    }
    const timer = auto ? window.setInterval(manualCheck, 86_400_000) : undefined;
    return () => {
      window.removeEventListener('uc-check-updates', manualCheck);
      window.clearInterval(timer);
    };
  }, [auto, settings.data?.component_feed, settings.data?.update_feed]);

  useEffect(() => {
    if (!ready || !auto || busy || error) {
      return;
    }
    const timer = window.setInterval(() => {
      if (Date.now() >= postponed) {
        setRemaining((seconds) => Math.max(0, seconds - 1));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, auto, busy, error, postponed]);

  useEffect(() => {
    if (remaining !== 0 || busy || !ready || error || (!auto && !requested) || installing.current) {
      return;
    }
    installing.current = true;
    void (
      application?.ready
        ? invoke('install_application_update')
        : request('/updates/install', { method: 'POST' })
    )
      .then(async () => {
        if (!application?.ready) {
          await request('/updates/restart', { method: 'POST' });
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          for (let attempt = 0; attempt < 20; attempt += 1) {
            try {
              await api.settings();
              location.reload();
              return;
            } catch {
              await new Promise((resolve) => window.setTimeout(resolve, 1000));
            }
          }
          throw new Error(text.restartFailed);
        }
        setRemaining(60);
        void client.invalidateQueries();
      })
      .catch((failure: Error) => {
        setRemaining(60);
        setError(failure.message);
      })
      .finally(() => {
        installing.current = false;
        setRequested(false);
      });
  }, [
    remaining,
    busy,
    ready,
    error,
    auto,
    requested,
    application?.ready,
    client,
    text.restartFailed,
  ]);

  if (!ready && !error && !component.data?.restart_required) {
    return null;
  }
  return (
    <aside className={styles.statusBar} aria-label={text.updates}>
      <span role="status">
        {error ??
          text.updates +
            ' · ' +
            (application?.version ?? component.data?.version) +
            ' · ' +
            (busy ? text.waiting : remaining + 's')}
      </span>
      {ready && (
        <Button
          onClick={() => {
            setRemaining(60);
            setPostponed(Date.now() + 3_600_000);
          }}
        >
          {text.postpone}
        </Button>
      )}
      {ready && !auto && (
        <Button
          disabled={busy}
          onClick={() => {
            setRequested(true);
            setRemaining(0);
          }}
        >
          {text.installUpdate}
        </Button>
      )}
      {component.data?.restart_required && (
        <Button
          disabled={busy}
          onClick={() => {
            void request('/updates/restart', { method: 'POST' })
              .then(() => {
                window.setTimeout(() => location.reload(), 3000);
              })
              .catch((failure: Error) => setError(failure.message));
          }}
        >
          {text.restart}
        </Button>
      )}
      {error && <Button onClick={() => setError(null)}>{text.close}</Button>}
    </aside>
  );
}

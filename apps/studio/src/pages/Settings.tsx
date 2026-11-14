import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button, Field, Select, Toggle } from '@unlimitedclipper/ui';
import {
  GlobeIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  ArrowCounterClockwiseIcon,
  BroomIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import { api, request } from '../lib/api';
import { useLanguage, useText } from '../lib/i18n';
import { languages } from '../lib/format';
import { QueryState } from '../molecules/QueryState';
import { PageHeader } from '../molecules/PageHeader';
import { isAndroidHost } from '../lib/native';
import { QualityPackSettings } from '../organisms/QualityPackSettings';
import { ModelSetup } from '../organisms/ModelSetup';
import { UpdateControls } from '../organisms/UpdateControls';
import type { Settings } from '../types';
import styles from '../styles/Studio.module.css';

function Preferences({ initial }: { initial: Settings }) {
  const text = useText();
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings({ ...settings, [key]: value });
    setMessage(null);
  }
  return (
    <form
      className={styles.settingsSection}
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        void api
          .saveSettings(settings)
          .then((saved) => {
            useLanguage.getState().setLanguage(saved.language as 'id' | 'en');
            setMessage(text.saved);
            void client.invalidateQueries({ queryKey: ['settings'] });
          })
          .catch((failure: Error) => setError(failure.message))
          .finally(() => setPending(false));
      }}
    >
      <h2>{text.preferences}</h2>
      <Select
        label={text.uiLanguage}
        value={settings.language}
        onChange={(value) => change('language', value)}
      >
        <option value="id">Bahasa Indonesia</option>
        <option value="en">English</option>
      </Select>
      <Select
        label={text.speechModel}
        disabled={isAndroidHost()}
        value={settings.speech_model}
        onChange={(value) => change('speech_model', value)}
      >
        <option value="whisper-small">Whisper small Q5_1</option>
        <option value="whisper-medium">Whisper medium Q5_0</option>
      </Select>
      <Select
        label={text.language}
        disabled={isAndroidHost()}
        value={settings.transcription_language}
        onChange={(value) => change('transcription_language', value)}
      >
        {languages.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        label={text.resolution}
        value={settings.resolution}
        onChange={(value) => change('resolution', Number(value))}
      >
        {[720, 1080, 1440, 2160].map((value) => (
          <option key={value} value={value}>
            {value}p
          </option>
        ))}
      </Select>
      <Field
        label={text.clipCount}
        disabled={isAndroidHost()}
        type="number"
        min={1}
        max={1000}
        value={settings.clip_count}
        onChange={(event) => change('clip_count', Number(event.target.value))}
      />
      <Field
        label={text.duration + ' (s)'}
        disabled={isAndroidHost()}
        type="number"
        min={0}
        max={3600}
        value={settings.clip_duration_ms / 1000}
        onChange={(event) =>
          change('clip_duration_ms', Math.round(Number(event.target.value) * 1000))
        }
      />
      <h2>{text.updates}</h2>
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      <fieldset
        className={styles.disabledGroup}
        disabled={isAndroidHost() || (!settings.update_feed && !settings.component_feed)}
      >
        <Toggle
          label={text.autoUpdate}
          checked={settings.auto_update && Boolean(settings.update_feed || settings.component_feed)}
          onChange={(value) => change('auto_update', value)}
        />
      </fieldset>
      <UpdateControls configured={Boolean(settings.update_feed || settings.component_feed)} />
      <Button icon={<FloppyDiskIcon />} variant="primary" type="submit" disabled={pending}>
        {text.savePreferences}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function SettingsPage() {
  const text = useText();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const updates = useQuery({
    queryKey: ['updates'],
    queryFn: () => request<{ version: string; ready: boolean }>('/updates'),
  });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const client = useQueryClient();
  async function action(id: string, work: () => Promise<unknown>) {
    setPending(id);
    setError(null);
    setMessage(null);
    try {
      await work();
      await client.invalidateQueries();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(null);
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader title={text.settings}>
        {isTauri() && !isAndroidHost() && (
          <Button
            icon={<GlobeIcon />}
            disabled={pending !== null}
            onClick={() => void action('browser', () => invoke('open_browser'))}
          >
            {text.openBrowser}
          </Button>
        )}
        {!isAndroidHost() && (
          <a
            className={styles.downloadLink}
            href="/api/v1/diagnostics"
            download="unlimitedclipper-diagnostics.json"
          >
            <DownloadSimpleIcon aria-hidden="true" size={18} />
            {text.diagnostics}
          </a>
        )}
      </PageHeader>
      <QueryState
        pending={settings.isPending}
        error={settings.error}
        retry={() => void client.invalidateQueries()}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className={styles.settingsGrid}>
        <ModelSetup />
        <section className={styles.settingsSection}>
          <h2>{text.tools}</h2>
          <Button
            icon={<ArrowCounterClockwiseIcon />}
            disabled={
              isAndroidHost() || pending !== null || !updates.data?.version || updates.data.ready
            }
            onClick={() =>
              void action('rollback', () => request('/updates/rollback', { method: 'POST' }))
            }
          >
            {text.restoreTools}
          </Button>
          <div className={styles.toolRows}>
            {Object.entries(health.data?.tools ?? {}).map(([tool, ready]) => (
              <div className={styles.toolRow} key={tool}>
                <span>{tool}</span>
                <span>{ready ? text.ready : text.missing}</span>
              </div>
            ))}
          </div>
          <Button
            icon={<BroomIcon />}
            disabled={
              pending !== null ||
              jobs.data?.some((job) => ['queued', 'running', 'cancelling'].includes(job.status))
            }
            onClick={() => {
              if (window.confirm(text.clearConfirm)) {
                void action('cleanup', () => request('/storage/cleanup', { method: 'POST' }));
              }
            }}
          >
            {text.cleanup}
          </Button>
        </section>
        {settings.data && <Preferences initial={settings.data} />}
        <details className={styles.settingsSection}>
          <summary>
            <SlidersHorizontalIcon aria-hidden="true" size={18} /> {text.advancedSpeech}
          </summary>
          <QualityPackSettings />
        </details>
      </div>
    </div>
  );
}

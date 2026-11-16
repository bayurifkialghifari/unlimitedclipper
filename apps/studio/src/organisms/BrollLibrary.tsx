import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { PlayIcon, PlusIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { api, assetUrl, uploadFile } from '../lib/api';
import { brollDragType, placeBroll } from '../lib/broll-placement';
import { AutoBrollPanel } from './AutoBrollPanel';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import type { BrollAsset, Job } from '../types';
import styles from '../styles/Studio.module.css';

function StockThumbnail({ url, fallbackLabel }: { url: string | null; fallbackLabel: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <span className={styles.brollMissingFrame} role="img" aria-label={fallbackLabel}>
        <PlayIcon aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={url}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      width={96}
      height={54}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function BrollLibrary({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const text = useText();
  const client = useQueryClient();
  const draft = useEditor((state) => state.draft);
  const playhead = useEditor((state) => state.playhead);
  const assets = useQuery({
    queryKey: ['broll-assets', projectId],
    queryFn: () => api.brollAssets(projectId),
  });
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: api.jobs,
    refetchInterval: 3000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stock = useQuery({
    queryKey: ['broll-stock', projectId, stockQuery],
    queryFn: () => api.brollStock(projectId, stockQuery),
    enabled: stockQuery.length >= 2,
    retry: false,
  });
  const activeJob = jobs.data?.find((job) => job.id === activeJobId);
  const selected = assets.data?.find((asset) => asset.asset_id === selectedId) ?? assets.data?.[0];
  const jobRunning = Boolean(
    activeJob && ['queued', 'running', 'cancelling'].includes(activeJob.status),
  );
  const busy = disabled || uploadProgress !== null || jobRunning;

  useEffect(() => {
    if (!activeJob) {
      return;
    }
    if (activeJob.status === 'completed') {
      const payload = activeJob.payload as { asset_id?: string };
      void client.invalidateQueries({ queryKey: ['broll-assets', projectId] }).then(() => {
        setSelectedId(payload.asset_id ?? null);
        setActiveJobId(null);
      });
    }
  }, [activeJob, client, projectId]);

  function add(asset: BrollAsset) {
    if (!draft || disabled) {
      return;
    }
    try {
      placeBroll(asset, draft.id, playhead);
      setError(null);
    } catch {
      setError(text.brollPlacementError);
    }
  }

  async function upload(file: File) {
    setUploadProgress(0);
    setError(null);
    try {
      const job = await uploadFile<Job>(
        '/projects/' + projectId + '/broll-assets',
        file,
        setUploadProgress,
      );
      setActiveJobId(job.id);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setUploadProgress(null);
    }
  }

  async function importStock(pageId: number) {
    setError(null);
    try {
      const job = await api.importBrollStock(projectId, pageId);
      setActiveJobId(job.id);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  async function remove(asset: BrollAsset) {
    if (!window.confirm(text.brollDeleteConfirm.replace('{name}', asset.name))) {
      return;
    }
    setError(null);
    try {
      await api.deleteBrollAsset(projectId, asset.asset_id);
      if (selectedId === asset.asset_id) {
        setSelectedId(null);
      }
      await client.invalidateQueries({ queryKey: ['broll-assets', projectId] });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  async function updateJob(action: 'retry' | 'cancel') {
    if (!activeJob) {
      return;
    }
    setError(null);
    try {
      if (action === 'retry') {
        await api.retryJob(activeJob.id);
      } else {
        await api.cancelJob(activeJob.id);
      }
      await jobs.refetch();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  return (
    <section className={styles.brollLibrary} aria-label={text.brollLibrary}>
      <h3>{text.brollLibrary}</h3>
      {draft && <AutoBrollPanel clipId={draft.id} assets={assets.data ?? []} disabled={disabled} />}
      <p className={styles.hint}>{text.brollDragHint}</p>
      {assets.isPending && <p role="status">{text.loading}</p>}
      {assets.isError && (
        <div role="alert" className={styles.brollStatus}>
          <span>{assets.error.message}</span>
          <Button onClick={() => void assets.refetch()}>{text.retry}</Button>
        </div>
      )}
      {assets.data && (
        <div className={styles.brollAssets}>
          {assets.data.map((asset) => (
            <div
              key={asset.asset_id}
              className={styles.brollAsset}
              data-selected={selected?.asset_id === asset.asset_id}
            >
              <button
                type="button"
                className={styles.brollSelect}
                draggable={!disabled}
                aria-label={text.brollSelect + ' ' + asset.name}
                aria-pressed={selected?.asset_id === asset.asset_id}
                onClick={() => setSelectedId(asset.asset_id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(brollDragType, asset.asset_id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                {asset.thumbnail_id ? (
                  <img src={assetUrl(asset.thumbnail_id)} width={96} height={54} alt="" />
                ) : (
                  <span className={styles.brollMissingFrame} aria-hidden="true">
                    <PlayIcon />
                  </span>
                )}
                <span className={styles.brollAssetLabel}>
                  <strong>{asset.name}</strong>
                  <small>{(asset.duration_ms / 1000).toFixed(1)} s</small>
                </span>
              </button>
              <Button
                icon={<PlusIcon aria-hidden="true" />}
                aria-label={text.brollAdd + ' ' + asset.name}
                disabled={disabled || !draft || (draft.document.visual_layers?.length ?? 0) >= 64}
                onClick={() => add(asset)}
              />
              {asset.origin !== 'project' && (
                <Button
                  variant="danger"
                  icon={<TrashIcon aria-hidden="true" />}
                  aria-label={text.delete + ' ' + asset.name}
                  disabled={busy}
                  onClick={() => void remove(asset)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div className={styles.brollPreview}>
          <video
            key={selected.asset_id}
            controls
            preload="metadata"
            src={assetUrl(selected.preview_asset_id ?? selected.asset_id)}
            aria-label={text.brollPreview + ' ' + selected.name}
          >
            <track kind="captions" />
          </video>
          <p>
            {selected.origin === 'stock' ? text.brollStockSource : text.brollLocalSource}
            {selected.license ? ' · ' + selected.license : ''}
          </p>
          {selected.source_url && (
            <a href={selected.source_url} target="_blank" rel="noreferrer">
              {text.brollSourceLink}
            </a>
          )}
        </div>
      )}
      <Field
        label={text.brollUpload}
        type="file"
        accept=".mp4,.mov,.mkv,.webm,.avi,.m4v,.ts"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            void upload(file);
          }
        }}
      />
      {uploadProgress !== null && (
        <progress max={1} value={uploadProgress} aria-label={text.brollUpload} />
      )}
      {activeJob && (
        <div className={styles.brollStatus} role="status">
          <span>{activeJob.status === 'failed' ? activeJob.error : activeJob.message}</span>
          {['failed', 'cancelled'].includes(activeJob.status) && (
            <Button onClick={() => void updateJob('retry')}>{text.retry}</Button>
          )}
          {jobRunning && activeJob.status !== 'cancelling' && (
            <Button onClick={() => void updateJob('cancel')}>{text.cancel}</Button>
          )}
          {jobRunning ? (
            <progress max={1} value={activeJob.progress} aria-label={text.brollImporting} />
          ) : (
            <Button onClick={() => setActiveJobId(null)}>{text.close}</Button>
          )}
        </div>
      )}
      <form
        className={styles.brollSearch}
        onSubmit={(event) => {
          event.preventDefault();
          setStockQuery(search.trim());
        }}
      >
        <Field
          label={text.brollStockSearch}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" disabled={search.trim().length < 2 || stock.isFetching}>
          {text.brollSearchAction}
        </Button>
      </form>
      {stock.isFetching && <p role="status">{text.brollSearching}</p>}
      {stock.isError && (
        <div role="alert" className={styles.brollStatus}>
          <span>{stock.error.message}</span>
          <Button onClick={() => void stock.refetch()}>{text.retry}</Button>
        </div>
      )}
      {stock.isSuccess && stock.data.length === 0 && <p role="status">{text.brollStockEmpty}</p>}
      {stock.data?.map((video) => (
        <div key={video.page_id} className={styles.brollAsset}>
          <StockThumbnail
            key={video.thumbnail_url}
            url={video.thumbnail_url ?? null}
            fallbackLabel={text.brollThumbnailUnavailable}
          />
          <span className={styles.brollAssetLabel}>
            <strong>{video.title}</strong>
            <small>CC0 · {(video.size_bytes / 1048576).toFixed(1)} MB</small>
            <a href={video.source_url} target="_blank" rel="noreferrer">
              {text.brollSourceLink}
            </a>
          </span>
          <Button
            icon={<UploadSimpleIcon aria-hidden="true" />}
            aria-label={text.brollImport + ' ' + video.title}
            disabled={busy}
            onClick={() => void importStock(video.page_id)}
          />
        </div>
      ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@unlimitedclipper/ui';
import { assetUrl } from '../lib/api';
import { useText } from '../lib/i18n';
import { date } from '../lib/format';
import type { Export } from '../types';
import { ExportDownload } from './ExportDownload';
import styles from '../styles/Studio.module.css';

export function ExportCard({ item }: { item: Export }) {
  const text = useText();
  const navigate = useNavigate();
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [captions, setCaptions] = useState<string>();
  const [captionAttempt, setCaptionAttempt] = useState(0);
  useEffect(() => {
    if (!played) {
      return;
    }
    const controller = new AbortController();
    let url: string | undefined;
    void fetch(assetUrl(item.srt_asset_id), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(text.previewError);
        }
        const subtitles = await response.text();
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(
            new Blob(['WEBVTT\n\n', subtitles.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')], {
              type: 'text/vtt',
            }),
          );
          setCaptions(url);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCaptionError(true);
        }
      });
    return () => {
      controller.abort();
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [played, item.srt_asset_id, text.previewError, captionAttempt]);
  return (
    <article className={styles.exportCard}>
      <video
        className={styles.exportVideo}
        src={assetUrl(item.asset_id)}
        controls
        playsInline
        preload="metadata"
        aria-label={item.name}
        onPlay={() => setPlayed(true)}
        onError={() => setError(true)}
        onLoadedMetadata={() => setError(false)}
      >
        <track kind="captions" src={captions} />
      </video>
      <h2>{item.name}</h2>
      <p className={styles.hint}>
        {date(item.created_at)} · rev. {item.revision}
      </p>
      {error && <p role="alert">{text.exportPreviewError}</p>}
      {captionError && (
        <div className={styles.exportCaptionError} role="alert">
          <span>{text.previewError}</span>
          <Button
            onClick={() => {
              setCaptionError(false);
              setCaptionAttempt((attempt) => attempt + 1);
            }}
          >
            {text.retry}
          </Button>
        </div>
      )}
      <div className={styles.headerActions}>
        <Button onClick={() => navigate('/studio/' + item.clip_id + '?panel=captions')}>
          {text.changeClipStyle}
        </Button>
        <ExportDownload assetId={item.asset_id} label="MP4" />
        <ExportDownload assetId={item.srt_asset_id} label="SRT" />
        <ExportDownload assetId={item.ass_asset_id} label="ASS" />
      </div>
    </article>
  );
}

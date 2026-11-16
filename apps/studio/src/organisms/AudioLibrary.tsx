import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { PauseIcon, PlayIcon, PlusIcon } from '@phosphor-icons/react';
import { api, assetUrl, uploadFile } from '../lib/api';
import { audioDragType, placeManagedAudio } from '../lib/audio-placement';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import type { AudioAsset } from '../types';
import { SoundEffectsLibrary } from './SoundEffectsLibrary';
import styles from '../styles/Studio.module.css';

export function AudioLibrary({ disabled }: { disabled: boolean }) {
  const text = useText();
  const client = useQueryClient();
  const draft = useEditor((state) => state.draft);
  const audioAssets = useQuery({ queryKey: ['audio-assets'], queryFn: api.audioAssets });
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleAssets = (audioAssets.data ?? []).filter((asset) =>
    asset.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    return () => {
      player.current?.pause();
      player.current = null;
    };
  }, []);

  async function preview(asset: AudioAsset) {
    if (playing === asset.asset_id) {
      player.current?.pause();
      setPlaying(null);
      return;
    }
    player.current?.pause();
    const audio = new Audio(assetUrl(asset.asset_id));
    audio.volume = 0.35;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => {
      setPlaying(null);
      setError(text.sfxPlaybackError);
    };
    player.current = audio;
    setError(null);
    try {
      await audio.play();
      setPlaying(asset.asset_id);
    } catch {
      setError(text.sfxPlaybackError);
      setPlaying(null);
    }
  }

  function add(asset: AudioAsset) {
    const current = useEditor.getState();
    if (!current.draft || disabled) {
      return;
    }
    setError(null);
    try {
      placeManagedAudio(asset, current.draft.id, Math.round(current.playhead), 0.35, {
        clipChanged: text.sfxClipChanged,
        placementError: text.sfxPlacementError,
      });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function upload(file: File) {
    setProgress(0);
    setError(null);
    try {
      await uploadFile<AudioAsset>('/assets/audio', file, setProgress);
      await client.invalidateQueries({ queryKey: ['audio-assets'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setProgress(null);
    }
  }
  return (
    <div className={styles.audioLibrary}>
      <h3>{text.importedAudio}</h3>
      <p className={styles.hint}>{text.audioDragHint}</p>
      <Field
        label={text.searchAudio}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {audioAssets.isPending && <p role="status">{text.loading}</p>}
      {audioAssets.isError && (
        <div>
          <p role="alert">{audioAssets.error.message}</p>
          <Button onClick={() => void audioAssets.refetch()}>{text.retry}</Button>
        </div>
      )}
      {audioAssets.isSuccess && visibleAssets.length === 0 && (
        <p role="status">{search ? text.noSoundsFound : text.noImportedAudio}</p>
      )}
      {visibleAssets.length > 0 && (
        <div className={styles.sfxList}>
          {visibleAssets.map((asset) => (
            <div
              className={styles.sfxRow}
              key={asset.asset_id}
              draggable={!disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData(audioDragType, asset.asset_id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <span>
                {asset.name}
                <small>{(asset.duration_ms / 1000).toFixed(1)} s</small>
              </span>
              <Button
                aria-label={
                  (playing === asset.asset_id ? text.pause : text.play) + ' ' + asset.name
                }
                onClick={() => void preview(asset)}
              >
                {playing === asset.asset_id ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <Button
                aria-label={text.sfxAdd + ' ' + asset.name}
                disabled={disabled || !draft || (draft.document.audio_layers?.length ?? 0) >= 16}
                onClick={() => add(asset)}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Field
        label={text.importAudio}
        type="file"
        accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,.opus"
        disabled={disabled || progress !== null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            void upload(file);
          }
        }}
      />
      {progress !== null && <progress max={1} value={progress} aria-label={text.importAudio} />}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <a href="https://www.myinstants.com/" target="_blank" rel="noreferrer">
        {text.soundboardLink}
      </a>
      <SoundEffectsLibrary disabled={disabled || progress !== null} />
    </div>
  );
}

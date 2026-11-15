import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Field } from '@unlimitedclipper/ui';
import { uploadFile } from '../lib/api';
import { useText } from '../lib/i18n';
import type { AudioAsset } from '../types';
import { SoundEffectsLibrary } from './SoundEffectsLibrary';
import styles from '../styles/Studio.module.css';

export function AudioLibrary({ disabled }: { disabled: boolean }) {
  const text = useText();
  const client = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <div>
      <SoundEffectsLibrary disabled={disabled || progress !== null} />
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
    </div>
  );
}

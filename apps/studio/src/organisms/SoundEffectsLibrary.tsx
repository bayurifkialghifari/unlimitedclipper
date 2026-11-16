import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { PlayIcon, PauseIcon, PlusIcon } from '@phosphor-icons/react';
import manifest from '../../../../resources/sfx.json';
import { uploadFile } from '../lib/api';
import { placeManagedAudio } from '../lib/audio-placement';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import type { AudioAsset } from '../types';
import styles from '../styles/Studio.module.css';

export function SoundEffectsLibrary({ disabled }: { disabled: boolean }) {
  const text = useText();
  const client = useQueryClient();
  const draft = useEditor((state) => state.draft);
  const player = useRef<HTMLAudioElement>(null);
  const imported = useRef(new Map<string, AudioAsset>());
  const [playing, setPlaying] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const limit = (draft?.document.audio_layers?.length ?? 0) >= 16;
  const names = { whoosh: text.sfxWhoosh, click: text.sfxClick, switch: text.sfxSwitch };
  const currentSound = manifest.sounds.find((sound) => sound.id === playing);
  const visibleSounds = manifest.sounds.filter((sound) => {
    const matchesCategory = category === 'all' || sound.group === category;
    const matchesSearch = name(sound).toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });
  const caption = currentSound
    ? 'WEBVTT\n\n00:00:00.000 --> 00:00:' +
      (currentSound.duration_ms / 1000).toFixed(3).padStart(6, '0') +
      '\n[' +
      name(currentSound) +
      ']\n'
    : 'WEBVTT\n';
  function name(sound: (typeof manifest.sounds)[number]) {
    return names[sound.group as keyof typeof names] + ' ' + sound.number;
  }
  async function audition(sound: (typeof manifest.sounds)[number]) {
    const audio = player.current;
    if (!audio) {
      return;
    }
    audio.pause();
    if (playing === sound.id) {
      setPlaying(null);
      return;
    }
    audio.src = '/sfx/' + sound.filename;
    audio.volume = 0.35;
    setError(null);
    try {
      await audio.play();
      setPlaying(sound.id);
    } catch {
      setPlaying(null);
      setError(text.sfxPlaybackError);
    }
  }
  async function add(sound: (typeof manifest.sounds)[number]) {
    const original = useEditor.getState();
    if (!original.draft || disabled || pending) {
      return;
    }
    const clipId = original.draft.id;
    const start = Math.round(original.playhead);
    setPending(sound.id);
    setError(null);
    try {
      let asset = imported.current.get(sound.id);
      if (!asset) {
        const response = await fetch('/sfx/' + sound.filename);
        if (!response.ok) {
          throw new Error(text.sfxMissing);
        }
        const bytes = await response.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== sound.size || hash !== sound.sha256) {
          throw new Error(text.sfxChecksumError);
        }
        asset = await uploadFile<AudioAsset>(
          '/assets/audio',
          new File([bytes], name(sound) + '.wav', { type: 'audio/wav' }),
        );
        imported.current.set(sound.id, asset);
        await client.invalidateQueries({ queryKey: ['audio-assets'] });
      }
      placeManagedAudio(asset, clipId, start, 0.35, {
        clipChanged: text.sfxClipChanged,
        placementError: text.sfxPlacementError,
      });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(null);
    }
  }
  return (
    <section className={styles.sfxSection} aria-label={text.soundEffects}>
      <h3>{text.soundEffects}</h3>
      <p className={styles.hint}>{text.sfxHint}</p>
      <audio
        ref={player}
        preload="none"
        aria-label={text.soundEffects}
        onEnded={() => setPlaying(null)}
        onError={() => {
          setPlaying(null);
          setError(text.sfxPlaybackError);
        }}
      >
        <track kind="captions" src={'data:text/vtt,' + encodeURIComponent(caption)} />
      </audio>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {limit && (
        <p role="status" className={styles.hint}>
          {text.sfxPlacementError}
        </p>
      )}
      <div className={styles.twoColumns}>
        <Field
          label={text.searchSounds}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select label={text.soundCategory} value={category} onChange={setCategory}>
          <option value="all">{text.allSounds}</option>
          <option value="whoosh">{text.sfxWhoosh}</option>
          <option value="click">{text.sfxClick}</option>
          <option value="switch">{text.sfxSwitch}</option>
        </Select>
      </div>
      {visibleSounds.length === 0 && <p role="status">{text.noSoundsFound}</p>}
      <div className={styles.sfxList}>
        {visibleSounds.map((sound) => (
          <div key={sound.id} className={styles.sfxRow}>
            <span>
              {name(sound)}
              <small>{(sound.duration_ms / 1000).toFixed(2)} s</small>
            </span>
            <Button
              aria-label={(playing === sound.id ? text.pause : text.play) + ' ' + name(sound)}
              title={name(sound)}
              onClick={() => void audition(sound)}
            >
              {playing === sound.id ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button
              aria-label={text.sfxAdd + ' ' + name(sound)}
              title={text.sfxAdd}
              disabled={disabled || pending !== null || !draft || limit}
              onClick={() => void add(sound)}
            >
              <PlusIcon aria-hidden="true" />
              {pending === sound.id && (
                <span role="status" className="sr-only">
                  {text.running}
                </span>
              )}
            </Button>
          </div>
        ))}
      </div>
      <details>
        <summary>{text.sfxCredits}</summary>
        {manifest.packs.map((pack) => (
          <p key={pack.id}>
            <a href={pack.source} target="_blank" rel="noreferrer">
              {pack.author}
            </a>
            {' · ' + pack.license}
          </p>
        ))}
      </details>
    </section>
  );
}

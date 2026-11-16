import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { FloppyDiskIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { CaptionPresetPicker } from '../molecules/CaptionPresetPicker';
import { QueryState } from '../molecules/QueryState';
import type { CaptionStyle, Word } from '../types';
import styles from '../styles/Studio.module.css';

export function CaptionPresetLibrary({
  current,
  words,
  onChange,
  disabled,
}: {
  current: CaptionStyle;
  words: Word[];
  onChange: (style: CaptionStyle) => void;
  disabled: boolean;
}) {
  const text = useText();
  const client = useQueryClient();
  const presets = useQuery({ queryKey: ['caption-presets'], queryFn: api.captionPresets });
  const [category, setCategory] = useState('all');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const categories = [
    ['all', text.captionAll],
    ['minimal', text.captionMinimal],
    ['bold', text.captionBold],
    ['highlight', text.captionHighlights],
    ['motion', text.captionMotion],
    ['custom', text.captionCustom],
  ];
  const shown = presets.data?.filter(
    (preset) => category === 'all' || preset.category === category,
  );

  async function action(work: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      await client.invalidateQueries({ queryKey: ['caption-presets'] });
      setMessage(success);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.captionLibrary} aria-label={text.captionLooks}>
      <QueryState
        pending={presets.isPending}
        error={presets.error}
        retry={() => void presets.refetch()}
      />
      {presets.data && (
        <>
          <div className={styles.captionCategories} aria-label={text.captionLooks}>
            {categories.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {shown?.length ? (
            <CaptionPresetPicker
              presets={shown}
              current={current}
              words={words}
              disabled={disabled || pending}
              onChange={onChange}
              onRemove={(preset) =>
                void action(() => api.deleteCaptionPreset(preset.id), text.captionStyleRemoved)
              }
            />
          ) : (
            <p className={styles.hint}>{text.captionNoSavedStyles}</p>
          )}
          <section className={styles.captionSaveStyle}>
            <h3>{text.captionSaveStyle}</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim() || pending || disabled) {
                  return;
                }
                void action(async () => {
                  await api.saveCaptionPreset(name.trim(), current);
                  setName('');
                  setCategory('custom');
                }, text.captionStyleSaved);
              }}
            >
              <Field
                label={text.captionStyleName}
                value={name}
                maxLength={60}
                required
                disabled={pending || disabled}
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" disabled={!name.trim() || pending || disabled}>
                <FloppyDiskIcon aria-hidden="true" />
                {pending ? text.running : text.captionSaveStyle}
              </Button>
            </form>
          </section>
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.hint} role="status">
          {message}
        </p>
      )}
    </section>
  );
}

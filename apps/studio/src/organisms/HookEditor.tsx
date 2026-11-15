import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { TextTIcon, SparkleIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { outputDuration } from '../lib/timeline';
import { CardEditor } from './CardEditor';
import styles from '../styles/Studio.module.css';

const recipes = [
  { name: 'hookClean', preset: 'plain', font: 'DM Sans', size: 68, color: '#FFFFFF' },
  { name: 'hookImpact', preset: 'bold', font: 'Oswald', size: 90, color: '#FFD28C' },
  { name: 'hookBoxed', preset: 'boxed', font: 'DM Sans', size: 74, color: '#FFFFFF' },
] as const;

export function HookEditor({
  canGenerate,
  generating,
  onGenerate,
}: {
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const text = useText();
  const inputId = useId();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const playhead = useEditor((state) => state.playhead);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = health.data?.editor_features?.includes('timed_hooks') ?? false;
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  const title = draft.document.title;
  const duration = outputDuration(draft.document);
  const start = title.start_ms ?? 0;
  const animation = title.animation ?? 'none';
  return (
    <section aria-label={text.hookEditor}>
      <h2>{text.hookEditor}</h2>
      <Button icon={<SparkleIcon />} disabled={!canGenerate} onClick={onGenerate}>
        {generating ? text.running : text.generateTitle}
      </Button>
      {!draft.document.words.some((word) => word.text.trim()) && (
        <p className={styles.hint}>{text.titleWordsRequired}</p>
      )}
      <label className={styles.hookLabel} htmlFor={inputId}>
        {text.titleText}
      </label>
      <textarea
        id={inputId}
        className={styles.hookInput}
        rows={3}
        value={title.text}
        maxLength={300}
        onChange={(event) =>
          change((document) => {
            document.title.text = event.target.value;
          })
        }
      />
      <div className={styles.styleRecipes} aria-label={text.hookStyles}>
        {recipes.map((recipe) => (
          <Button
            key={recipe.name}
            aria-pressed={
              title.preset === recipe.preset &&
              title.font === recipe.font &&
              title.size === recipe.size &&
              title.color === recipe.color
            }
            onClick={() =>
              change((document) => {
                document.title = {
                  ...document.title,
                  preset: recipe.preset,
                  font: recipe.font,
                  size: recipe.size,
                  color: recipe.color,
                };
              })
            }
          >
            <TextTIcon aria-hidden="true" />
            {text[recipe.name]}
          </Button>
        ))}
      </div>
      <p className={styles.hint}>{text.hookPreviewHint}</p>
      <Select
        label={text.preset}
        value={title.preset}
        onChange={(preset) =>
          change((document) => {
            document.title.preset = preset;
          })
        }
      >
        <option value="bold">{text.bold}</option>
        <option value="plain">{text.plain}</option>
        <option value="boxed">{text.boxed}</option>
      </Select>
      <Select
        label={text.font}
        value={title.font}
        onChange={(font) =>
          change((document) => {
            document.title.font = font;
          })
        }
      >
        {['Noto Sans', 'DM Sans', 'Oswald'].map((font) => (
          <option key={font}>{font}</option>
        ))}
      </Select>
      <div className={styles.twoColumns}>
        <Field
          label={text.size}
          type="number"
          min={12}
          max={220}
          value={title.size}
          onChange={(event) =>
            change((document) => {
              document.title.size = Number(event.target.value);
            })
          }
        />
        <Field
          label={text.color}
          type="color"
          value={title.color}
          onChange={(event) =>
            change((document) => {
              document.title.color = event.target.value;
            })
          }
        />
      </div>
      <Field
        label={text.position + ' (%)'}
        type="range"
        min={5}
        max={95}
        value={title.position_y * 100}
        onChange={(event) =>
          change((document) => {
            document.title.position_y = Number(event.target.value) / 100;
          })
        }
      />
      <div className={styles.twoColumns}>
        <Field
          label={text.hookStart + ' (s)'}
          type="number"
          min={0}
          max={(duration - 1) / 1000}
          step={0.1}
          value={start / 1000}
          disabled={!supported}
          onChange={(event) =>
            change((document) => {
              document.title.start_ms = Math.round(Number(event.target.value) * 1000);
            })
          }
        />
        <Field
          label={text.titleDuration + ' (s)'}
          type="number"
          min={0}
          max={Math.max(0, duration - start) / 1000}
          step={0.1}
          value={title.duration_ms / 1000}
          onChange={(event) =>
            change((document) => {
              document.title.duration_ms = Math.round(Number(event.target.value) * 1000);
            })
          }
        />
      </div>
      <Select
        label={text.animation}
        value={animation}
        disabled={!supported}
        onChange={(value) =>
          change((document) => {
            document.title.animation = value;
          })
        }
      >
        <option value="none">{text.none}</option>
        <option value="fade">{text.fade}</option>
        <option value="pop">{text.pop}</option>
      </Select>
      <Button
        disabled={!supported || playhead >= duration}
        onClick={() =>
          change((document) => {
            document.title.start_ms = Math.round(playhead);
          })
        }
      >
        {text.hookAtPlayhead}
      </Button>
      {!supported && <p className={styles.hint}>{text.editorUpgrade}</p>}
      <CardEditor
        kind="intro_card"
        supported={health.data?.editor_features?.includes('heading_cards') ?? false}
      />
      <CardEditor
        kind="outro_card"
        supported={health.data?.editor_features?.includes('heading_cards') ?? false}
      />
    </section>
  );
}

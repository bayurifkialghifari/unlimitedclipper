import { useId } from 'react';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { PlusIcon, TrashIcon, PlayIcon } from '@phosphor-icons/react';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { identifiedSegments, introDuration, outputDuration } from '../lib/timeline';
import type { HeadingCard } from '../types';
import styles from '../styles/Studio.module.css';

export function CardEditor({
  kind,
  supported,
}: {
  kind: 'intro_card' | 'outro_card';
  supported: boolean;
}) {
  const text = useText();
  const inputId = useId();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  if (!draft) {
    return null;
  }
  const card = draft.document[kind];
  const heading = kind === 'intro_card' ? text.openingCard : text.closingCard;
  const words =
    kind === 'intro_card' ? draft.document.words.slice(0, 8) : draft.document.words.slice(-8);
  const seed = draft.document.title.text.trim() || words.map((word) => word.text).join(' ');

  function preview() {
    const document = useEditor.getState().draft?.document;
    if (document) {
      const content = kind === 'intro_card' ? 0 : outputDuration(document);
      const offset = Math.min(250, (document[kind]?.duration_ms ?? 0) / 2);
      const output = (kind === 'intro_card' ? 0 : introDuration(document) + content) + offset;
      useEditor.getState().seekTo(content, output);
    }
  }

  function update(recipe: (card: HeadingCard) => void) {
    change((document) => {
      const current = document[kind];
      if (current) {
        recipe(current);
      }
    }, true);
    preview();
  }

  return (
    <section aria-label={heading}>
      <h3>{heading}</h3>
      {!card ? (
        <Button
          icon={<PlusIcon />}
          disabled={!supported || !seed.trim()}
          onClick={() => {
            change((document) => {
              document.segments = identifiedSegments(document);
              document.version = 4;
              document[kind] = {
                text: seed.slice(0, 300),
                duration_ms: 2000,
                font: 'Oswald',
                size: 90,
                color: '#FFD28C',
                background: '#151B24',
                position_y: 0.5,
                animation: 'fade',
              };
            }, true);
            preview();
          }}
        >
          {text.addCard}
        </Button>
      ) : (
        <>
          <label className={styles.hookLabel} htmlFor={inputId}>
            {text.cardText}
          </label>
          <textarea
            id={inputId}
            className={styles.hookInput}
            rows={3}
            maxLength={300}
            value={card.text}
            disabled={!supported}
            onChange={(event) =>
              update((card) => {
                card.text = event.target.value;
              })
            }
          />
          <div className={styles.twoColumns}>
            <Field
              label={text.titleDuration + ' (s)'}
              type="number"
              min={0.3}
              max={10}
              step={0.1}
              value={card.duration_ms / 1000}
              disabled={!supported}
              onChange={(event) =>
                update((card) => {
                  card.duration_ms = Math.max(
                    300,
                    Math.min(10_000, Math.round(Number(event.target.value) * 1000)),
                  );
                })
              }
            />
            <Field
              label={text.size}
              type="number"
              min={12}
              max={220}
              value={card.size}
              disabled={!supported}
              onChange={(event) =>
                update((card) => {
                  card.size = Math.max(12, Math.min(220, Math.round(Number(event.target.value))));
                })
              }
            />
            <Field
              label={text.color}
              type="color"
              value={card.color}
              disabled={!supported}
              onChange={(event) =>
                update((card) => {
                  card.color = event.target.value;
                })
              }
            />
            <Field
              label={text.cardBackground}
              type="color"
              value={card.background}
              disabled={!supported}
              onChange={(event) =>
                update((card) => {
                  card.background = event.target.value;
                })
              }
            />
          </div>
          <Select
            label={text.font}
            value={card.font}
            disabled={!supported}
            onChange={(font) =>
              update((card) => {
                card.font = font;
              })
            }
          >
            {['Noto Sans', 'DM Sans', 'Oswald'].map((font) => (
              <option key={font}>{font}</option>
            ))}
          </Select>
          <Field
            label={text.position + ' (%)'}
            type="range"
            min={5}
            max={95}
            value={card.position_y * 100}
            disabled={!supported}
            onChange={(event) =>
              update((card) => {
                card.position_y = Number(event.target.value) / 100;
              })
            }
          />
          <Select
            label={text.animation}
            value={card.animation}
            disabled={!supported}
            onChange={(animation) =>
              update((card) => {
                card.animation = animation;
              })
            }
          >
            <option value="none">{text.none}</option>
            <option value="fade">{text.fade}</option>
            <option value="pop">{text.pop}</option>
          </Select>
          <div className={styles.twoColumns}>
            <Button icon={<PlayIcon />} onClick={preview}>
              {text.previewCard}
            </Button>
            <Button
              icon={<TrashIcon />}
              disabled={!supported}
              onClick={() => {
                change((document) => {
                  delete document[kind];
                }, true);
                useEditor.getState().seekTo(0);
              }}
            >
              {text.removeCard}
            </Button>
          </div>
        </>
      )}
      <p className={styles.hint}>{supported ? text.cardTimingHint : text.editorUpgrade}</p>
      {supported && !card && !seed.trim() && <p className={styles.hint}>{text.cardTextRequired}</p>}
    </section>
  );
}

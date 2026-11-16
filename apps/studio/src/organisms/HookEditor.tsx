import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { PlayIcon, TextTIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { identifiedSegments, outputDuration } from '../lib/timeline';
import { useTimelineRemap } from '../hooks/use-timeline-remap';
import { CardEditor } from './CardEditor';
import { HookProposals } from './HookProposals';
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
  const seekTo = useEditor((state) => state.seekTo);
  const [teaserStart, setTeaserStart] = useState<string | null>(null);
  const [teaserLength, setTeaserLength] = useState('2.00');
  const { remapTeaser, pending: teaserPending, teaserSupported } = useTimelineRemap();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = health.data?.editor_features?.includes('timed_hooks') ?? false;
  const proposalsSupported = health.data?.editor_features?.includes('hook_proposals') ?? false;
  const cardsSupported = health.data?.editor_features?.includes('heading_cards') ?? false;
  const narrationSupported = health.data?.editor_features?.includes('card_narration') ?? false;
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  const title = draft.document.title;
  const openingCard = draft.document.intro_card;
  const duration = outputDuration(draft.document);
  const teaserStartMs = Math.round(Number(teaserStart ?? (playhead / 1000).toFixed(2)) * 1000);
  const teaserLengthMs = Math.round(Number(teaserLength) * 1000);
  const validTeaser =
    Number.isFinite(teaserStartMs) &&
    Number.isFinite(teaserLengthMs) &&
    teaserStartMs >= 0 &&
    teaserLengthMs >= 300 &&
    teaserLengthMs <= 5000 &&
    teaserStartMs + teaserLengthMs <= duration;
  const start = title.start_ms ?? 0;
  const animation = title.animation ?? 'none';
  const openingText =
    title.text.trim() ||
    draft.document.words
      .slice(0, 8)
      .map((word) => word.text)
      .join(' ')
      .trim();

  function useOpeningCard() {
    if (!openingText || !cardsSupported || openingCard) {
      return;
    }
    change((document) => {
      document.segments = identifiedSegments(document);
      document.version = Math.max(4, document.version);
      document.title.text = '';
      document.intro_card = {
        text: openingText.slice(0, 300),
        duration_ms: 2000,
        font: 'Oswald',
        size: 90,
        color: '#FFD28C',
        background: '#151B24',
        position_y: 0.5,
        animation: 'fade',
      };
    }, true);
    seekTo(0, 250);
  }

  function useOverlay() {
    if (!openingCard) {
      return;
    }
    change((document) => {
      document.title.text = document.intro_card?.text.slice(0, 300) ?? '';
      document.title.start_ms = 0;
      document.title.duration_ms = Math.min(3000, outputDuration(document));
      document.intro_card = null;
    }, true);
    seekTo(0);
  }

  return (
    <section aria-label={text.hookEditor}>
      <h2>{text.hookEditor}</h2>
      <HookProposals
        key={draft.id}
        canGenerate={canGenerate}
        generating={generating}
        supported={proposalsSupported}
        cardsSupported={cardsSupported}
        onGenerate={onGenerate}
      />
      <section className={styles.teaserTools}>
        <h3>{text.teaserMove}</h3>
        <div className={styles.teaserFields}>
          <p className={styles.hint}>{text.teaserHint}</p>
          <div className={styles.twoColumns}>
            <Field
              label={text.teaserStart}
              type="number"
              min={0}
              max={Math.max(0, (duration - 300) / 1000)}
              step={0.01}
              value={teaserStart ?? (playhead / 1000).toFixed(2)}
              onChange={(event) => setTeaserStart(event.target.value)}
            />
            <Field
              label={text.teaserLength}
              type="number"
              min={0.3}
              max={5}
              step={0.01}
              value={teaserLength}
              onChange={(event) => setTeaserLength(event.target.value)}
            />
          </div>
          {!teaserSupported && <p className={styles.hint}>{text.teaserUnavailable}</p>}
          <Button
            disabled={!validTeaser || !teaserSupported || teaserPending}
            onClick={() => void remapTeaser(teaserStartMs, teaserStartMs + teaserLengthMs)}
          >
            {text.teaserApply}
          </Button>
        </div>
      </section>
      <h3>{text.hookCurrent}</h3>
      <div className={styles.hookModeActions} role="group" aria-label={text.hookOpeningMode}>
        <Button aria-pressed={!openingCard} disabled={!openingCard} onClick={useOverlay}>
          {text.hookUseOverlay}
        </Button>
        <Button
          aria-pressed={Boolean(openingCard)}
          disabled={Boolean(openingCard) || !cardsSupported || !openingText}
          onClick={useOpeningCard}
        >
          {text.hookUseCard}
        </Button>
      </div>
      {!openingCard && (
        <>
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
          <Button
            icon={<PlayIcon aria-hidden="true" />}
            disabled={!title.text.trim() || title.duration_ms <= 0}
            onClick={() => seekTo(start)}
          >
            {text.hookPreview}
          </Button>
          {!supported && <p className={styles.hint}>{text.editorUpgrade}</p>}
        </>
      )}
      {openingCard && (
        <CardEditor
          kind="intro_card"
          supported={cardsSupported}
          narrationSupported={narrationSupported}
        />
      )}
      <CardEditor
        kind="outro_card"
        supported={cardsSupported}
        narrationSupported={narrationSupported}
      />
    </section>
  );
}

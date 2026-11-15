import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { PlusIcon, TrashIcon, PlayIcon } from '@phosphor-icons/react';
import { useEditor } from '../lib/editor-store';
import { api, assetUrl } from '../lib/api';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import { identifiedSegments, introDuration, outputDuration } from '../lib/timeline';
import type { CardNarration, HeadingCard } from '../types';
import styles from '../styles/Studio.module.css';

export function CardEditor({
  kind,
  supported,
  narrationSupported,
}: {
  kind: 'intro_card' | 'outro_card';
  supported: boolean;
  narrationSupported: boolean;
}) {
  const text = useText();
  const inputId = useId();
  const draft = useEditor((state) => state.draft);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const change = useEditor((state) => state.change);
  const client = useQueryClient();
  const [language, setLanguage] = useState('id');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardKind = kind === 'intro_card' ? 'intro' : 'outro';
  const pack = useQuery({
    queryKey: ['narration-pack'],
    queryFn: api.narrationPack,
    enabled: narrationSupported && Boolean(draft?.document[kind]),
  });
  const proposal = useQuery({
    queryKey: ['card-narration', draft?.id, cardKind],
    queryFn: () => api.cardNarrationJob(draft!.id, cardKind),
    enabled: narrationSupported && Boolean(draft?.document[kind]),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ['queued', 'running', 'cancelling'].includes(status) ? 1500 : false;
    },
  });
  if (!draft) {
    return null;
  }
  const card = draft.document[kind];
  const heading = kind === 'intro_card' ? text.openingCard : text.closingCard;
  const words =
    kind === 'intro_card' ? draft.document.words.slice(0, 8) : draft.document.words.slice(-8);
  const seed = draft.document.title.text.trim() || words.map((word) => word.text).join(' ');
  const job = proposal.data;
  const generated =
    job?.status === 'completed'
      ? (job.payload as { card_narration?: CardNarration }).card_narration
      : undefined;
  const generating = Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));
  const stale = Boolean(
    generated &&
    (Number((job?.payload as { revision?: number }).revision) !== draft.revision ||
      generated.text !== card?.text),
  );
  const canUseNarration = Boolean(
    generated && card && !stale && !dirty && !saving && !pending && !generating,
  );

  async function generateNarration() {
    const current = useEditor.getState();
    if (!current.draft || current.dirty || current.saving) {
      setError(text.narrationSaveFirst);
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const queued = await api.generateCardNarration(
        current.draft.id,
        cardKind,
        current.draft.revision,
        language,
      );
      client.setQueryData(['card-narration', current.draft.id, cardKind], queued);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function applyNarration() {
    const current = useEditor.getState();
    if (!canUseNarration || !generated || !current.draft) {
      setError(text.narrationStale);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const saved = await api.clip(current.draft.id);
      const latest = useEditor.getState();
      if (
        saved.revision !== current.draft.revision ||
        latest.draft?.id !== current.draft.id ||
        latest.draft.revision !== current.draft.revision ||
        latest.dirty ||
        latest.saving ||
        latest.draft.document[kind]?.text !== generated.text
      ) {
        setError(text.narrationStale);
        return;
      }
      latest.change((document) => {
        const card = document[kind];
        if (card) {
          card.narration = generated;
          card.duration_ms = Math.max(card.duration_ms, generated.duration_ms + 250);
        }
      }, true);
      preview();
      setMessage(text.narrationApplied);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function preview() {
    const document = useEditor.getState().draft?.document;
    if (document) {
      const content = kind === 'intro_card' ? 0 : outputDuration(document);
      const offset = document[kind]?.narration
        ? 0
        : Math.min(250, (document[kind]?.duration_ms ?? 0) / 2);
      const output = (kind === 'intro_card' ? 0 : introDuration(document) + content) + offset;
      useEditor.getState().seekTo(content, output);
    }
  }

  function update(recipe: (card: HeadingCard) => void) {
    setMessage(null);
    setError(null);
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
                card.narration = null;
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
                    card.narration?.duration_ms ?? 300,
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
          {narrationSupported && !isAndroidHost() && (
            <section aria-label={text.narrationPack}>
              <h4>{text.narrationPack}</h4>
              <Select
                label={text.language}
                value={language}
                disabled={pending || generating}
                onChange={setLanguage}
              >
                <option value="id">{text.transcriptionLanguages.id}</option>
                <option value="en">{text.transcriptionLanguages.en}</option>
              </Select>
              <Button
                disabled={
                  pending ||
                  generating ||
                  dirty ||
                  saving ||
                  !pack.data?.ready ||
                  card.text.length > 280
                }
                onClick={() => void generateNarration()}
              >
                {generating ? text.narrationGenerating : text.narrationGenerate}
              </Button>
              {!pack.data?.ready && !pack.isPending && (
                <p className={styles.hint}>{text.narrationPackMissing}</p>
              )}
              {(dirty || saving) && <p className={styles.hint}>{text.narrationSaveFirst}</p>}
              {card.text.length > 280 && <p className={styles.hint}>{text.narrationTooLong}</p>}
              {generating && <p role="status">{text.narrationGenerating}</p>}
              {proposal.isError && <p role="alert">{proposal.error.message}</p>}
              {pack.isError && <p role="alert">{pack.error.message}</p>}
              {job?.status === 'failed' && <p role="alert">{job.error ?? job.message}</p>}
              {stale && <p role="status">{text.narrationStale}</p>}
              {generated && !stale && (
                <>
                  <p>
                    {text.narrationDuration}: {(generated.duration_ms / 1000).toFixed(1)} s
                  </p>
                  <audio
                    controls
                    src={assetUrl(generated.asset_id)}
                    aria-label={text.narrationListen}
                  >
                    <track kind="captions" />
                  </audio>
                  <Button
                    disabled={!canUseNarration || card.narration?.asset_id === generated.asset_id}
                    onClick={() => void applyNarration()}
                  >
                    {text.narrationApply}
                  </Button>
                </>
              )}
              {card.narration && (
                <Button
                  disabled={pending}
                  onClick={() =>
                    update((card) => {
                      card.narration = null;
                    })
                  }
                >
                  {text.narrationRemove}
                </Button>
              )}
              {message && <p role="status">{message}</p>}
              {error && <p role="alert">{error}</p>}
            </section>
          )}
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

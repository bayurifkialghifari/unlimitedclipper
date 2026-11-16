import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { SparkleIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { hookSourceSignature } from '../lib/hook-source';
import { useText } from '../lib/i18n';
import { identifiedSegments, outputDuration } from '../lib/timeline';
import type { HookProposalSet } from '../types';
import styles from '../styles/Studio.module.css';

export function HookProposals({
  canGenerate,
  generating,
  supported,
  cardsSupported,
  onGenerate,
}: {
  canGenerate: boolean;
  generating: boolean;
  supported: boolean;
  cardsSupported: boolean;
  onGenerate: () => void;
}) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const proposals = useQuery({
    queryKey: ['hook-proposals', draft?.id],
    queryFn: () => api.hookProposals(draft!.id),
    enabled: Boolean(draft) && supported,
    refetchInterval: generating ? 1500 : false,
  });

  if (!draft) {
    return null;
  }

  const set = proposals.data;
  const latestJob = jobs.data
    ?.filter((job) => job.kind === 'hook_proposals' && job.clip_id === draft.id)
    .sort((left, right) => right.created_at - left.created_at)[0];
  const jobError =
    latestJob?.status === 'failed' && latestJob.updated_at > (set?.created_at ?? 0)
      ? (latestJob.error ?? latestJob.message)
      : null;
  const stale = Boolean(
    set &&
    (set.source_signature
      ? set.source_signature !== hookSourceSignature(draft.document)
      : set.revision !== draft.revision),
  );
  const selected =
    set?.proposals.find((proposal) => proposal.id === selectedId) ?? set?.proposals[0];
  const canApply = Boolean(set && !stale && !dirty && !saving && !pending && !generating);

  async function apply(proposal: HookProposalSet['proposals'][number], mode: 'overlay' | 'card') {
    const snapshot = useEditor.getState();
    if (!set || !snapshot.draft || snapshot.dirty || snapshot.saving || generating || pending) {
      setError(text.hookSaveFirst);
      return;
    }
    const sourceChanged = set.source_signature
      ? set.source_signature !== hookSourceSignature(snapshot.draft.document)
      : snapshot.draft.revision !== set.revision;
    if (snapshot.draft.id !== set.clip_id || sourceChanged) {
      setError(text.hookStale);
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.clip(set.clip_id);
      const current = useEditor.getState();
      const savedSourceChanged = set.source_signature
        ? set.source_signature !== hookSourceSignature(saved.document)
        : saved.revision !== set.revision;
      if (
        saved.revision !== snapshot.draft.revision ||
        savedSourceChanged ||
        current.draft?.id !== set.clip_id ||
        current.draft.revision !== saved.revision ||
        current.dirty
      ) {
        setError(text.hookStale);
        return;
      }
      current.change((document) => {
        if (mode === 'overlay') {
          document.intro_card = null;
          document.title.text = proposal.text.slice(0, 300);
          document.title.start_ms = 0;
          document.title.duration_ms = Math.min(3000, outputDuration(document));
        } else {
          document.segments = identifiedSegments(document);
          document.version = Math.max(4, document.version);
          document.title.text = '';
          document.intro_card = {
            text: proposal.text.slice(0, 300),
            duration_ms: document.intro_card?.duration_ms ?? 2000,
            font: document.intro_card?.font ?? 'Oswald',
            size: document.intro_card?.size ?? 90,
            color: document.intro_card?.color ?? '#FFD28C',
            background: document.intro_card?.background ?? '#151B24',
            position_y: document.intro_card?.position_y ?? 0.5,
            animation: document.intro_card?.animation ?? 'fade',
          };
        }
      }, true);
      current.seekTo(0, mode === 'card' ? 250 : undefined);
      setMessage(text.hookApplied);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label={text.hookIdeas} className={styles.hookIdeas}>
      <h3>{text.hookIdeas}</h3>
      <Button
        icon={<SparkleIcon aria-hidden="true" />}
        disabled={!supported || !canGenerate || generating}
        onClick={onGenerate}
      >
        {generating ? text.hookGenerating : text.hookSuggest}
      </Button>
      {!supported && <p className={styles.hint}>{text.editorUpgrade}</p>}
      {supported && !canGenerate && !generating && (
        <p className={styles.hint}>
          {dirty || saving ? text.hookGenerateAfterSave : text.hookRequirements}
        </p>
      )}
      {generating && <p role="status">{text.hookGenerating}</p>}
      {proposals.isPending && supported && <p role="status">{text.hookIdeasLoading}</p>}
      {proposals.isError && (
        <div>
          <p role="alert">{proposals.error.message}</p>
          <Button onClick={() => void proposals.refetch()}>{text.retry}</Button>
        </div>
      )}
      {jobError && <p role="alert">{jobError}</p>}
      {supported && !proposals.isPending && !proposals.isError && !set && !generating && (
        <p className={styles.hint}>{text.hookIdeaEmpty}</p>
      )}
      {stale && <p role="status">{text.hookStale}</p>}
      {dirty && set && !stale && <p role="status">{text.hookSaveFirst}</p>}
      {set && (
        <>
          <p className={styles.hint}>
            {set.proposals.length} {text.hookIdeaCount}
          </p>
          <ol className={styles.hookIdeaList}>
            {set.proposals.map((proposal, index) => (
              <li key={proposal.id} className={styles.hookIdea}>
                <button
                  type="button"
                  aria-pressed={selected?.id === proposal.id}
                  onClick={() => setSelectedId(proposal.id)}
                >
                  <span className={styles.hookIdeaNumber}>{index + 1}</span>
                  <span>{proposal.text}</span>
                </button>
              </li>
            ))}
          </ol>
          {selected && (
            <div className={styles.hookIdeaReview}>
              <strong>{selected.text}</strong>
              <p>
                <span>{text.hookEvidence}: </span>
                <q>{selected.source_quote}</q>
              </p>
              <p>
                <span>{text.hookReason}: </span>
                {selected.explanation}
              </p>
              <p className={styles.hint}>{text.hookModeHint}</p>
              <div className={styles.hookIdeaActions}>
                <Button
                  aria-label={text.hookUseOverlay + ': ' + selected.text}
                  disabled={!canApply}
                  onClick={() => void apply(selected, 'overlay')}
                >
                  {text.hookUseOverlay}
                </Button>
                <Button
                  aria-label={text.hookUseCard + ': ' + selected.text}
                  disabled={!canApply || !cardsSupported}
                  onClick={() => void apply(selected, 'card')}
                >
                  {text.hookUseCard}
                </Button>
              </div>
              {!cardsSupported && <p className={styles.hint}>{text.editorUpgrade}</p>}
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

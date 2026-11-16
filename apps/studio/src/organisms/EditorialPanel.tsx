import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Toggle } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import { sourceSegments } from '../lib/timeline';
import type { EditDocument } from '../types';
import styles from '../styles/Studio.module.css';

type ProposalPayload = {
  proposed_document?: EditDocument;
  base_revision?: number;
  remove_silence?: boolean;
  auto_motion?: boolean;
  silence_gaps?: { start_ms: number; end_ms: number }[];
  motion_review?: {
    anchors: number;
    single_face_samples: number;
    emphasis_pulses: number;
    skipped_multi_face_samples: number;
  };
};

function sourceToContent(document: EditDocument, source: number): number | null {
  let offset = 0;
  for (const segment of sourceSegments(document)) {
    if (source >= segment.start_ms && source < segment.end_ms) {
      return offset + source - segment.start_ms;
    }
    offset += segment.end_ms - segment.start_ms;
  }
  return null;
}

function seconds(milliseconds: number) {
  return (milliseconds / 1000).toFixed(2) + 's';
}

export function EditorialPanel() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const [profile, setProfile] = useState('editorial');
  const [removeSilence, setRemoveSilence] = useState(false);
  const [autoMotion, setAutoMotion] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pack = useQuery({ queryKey: ['quality-pack'], queryFn: api.qualityPack });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 1000 });
  const savedProposal = useQuery({
    queryKey: ['auto-edit-proposal', draft?.id],
    queryFn: () => api.autoEditProposal(draft!.id),
    enabled: Boolean(draft),
    refetchInterval: 2500,
  });
  const job =
    jobs.data?.find((candidate) => candidate.id === jobId) ??
    savedProposal.data ??
    jobs.data?.find(
      (candidate) => candidate.kind === 'auto_edit' && candidate.clip_id === draft?.id,
    );
  const proposal = job?.payload as ProposalPayload | undefined;
  const busy = pending || Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));
  const ready = Boolean(models.data?.some((model) => model.id === 'qwen3-4b' && model.ready));
  const supportedLayout = Boolean(
    draft && ['portrait', 'square', 'landscape'].includes(draft.document.layout),
  );
  const motionAvailable = supportedLayout && !draft?.document.camera_motion?.length;
  const canApply = Boolean(
    job?.status === 'completed' &&
    proposal?.proposed_document &&
    draft?.revision === proposal.base_revision &&
    !dirty &&
    !saving &&
    !busy,
  );
  const canReview = Boolean(draft?.revision === proposal?.base_revision && !dirty);
  const silenceGaps = proposal?.silence_gaps ?? [];
  const removedDuration = silenceGaps.reduce((total, gap) => total + gap.end_ms - gap.start_ms, 0);

  async function generate() {
    if (!draft) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const current = useEditor.getState().draft!;
      const queued = await api.autoEdit(
        current.id,
        current.revision,
        profile,
        removeSilence,
        autoMotion,
      );
      setJobId(queued.id);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function apply() {
    if (!canApply || !proposal?.proposed_document) {
      setError(text.proposalConflict);
      return;
    }
    change(
      (document) => Object.assign(document, structuredClone(proposal.proposed_document!)),
      true,
    );
    setJobId(null);
  }

  function reviewSource(source: number) {
    if (!draft) {
      return;
    }
    const time = sourceToContent(draft.document, source);
    if (time !== null) {
      useEditor.getState().seekTo(Math.max(0, time - 150));
    }
  }

  return (
    <section className={styles.settingsSection} aria-label={text.autoEditTitle}>
      <h3>{text.autoEditTitle}</h3>
      <Select label={text.options} value={profile} onChange={setProfile} disabled={busy}>
        <option value="editorial">{text.editorialProfile}</option>
        <option value="reaction">{text.reactionProfile}</option>
      </Select>
      <fieldset
        disabled={busy || !pack.data?.ready || isAndroidHost()}
        className={styles.disabledGroup}
      >
        <Toggle label={text.removeSilence} checked={removeSilence} onChange={setRemoveSilence} />
      </fieldset>
      <fieldset
        disabled={busy || (!motionAvailable && !autoMotion) || isAndroidHost()}
        className={styles.disabledGroup}
      >
        <Toggle label={text.autoMotion} checked={autoMotion} onChange={setAutoMotion} />
      </fieldset>
      <p className={styles.hint}>{text.autoMotionHint}</p>
      {!supportedLayout && <p className={styles.hint}>{text.autoMotionLayout}</p>}
      {draft?.document.camera_motion?.length ? (
        <p className={styles.hint}>{text.autoMotionExisting}</p>
      ) : null}
      {!pack.data?.ready && <p className={styles.hint}>{text.qualityPackMissing}</p>}
      {pack.isError && <p role="alert">{pack.error.message}</p>}
      {models.isError && <p role="alert">{models.error.message}</p>}
      {jobs.isError && <p role="alert">{jobs.error.message}</p>}
      {savedProposal.isError && <p role="alert">{savedProposal.error.message}</p>}
      {!ready && <p className={styles.hint}>{text.captionModelMissing}</p>}
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      <Button
        onClick={() => void generate()}
        disabled={
          busy ||
          !draft?.document.words.length ||
          !ready ||
          isAndroidHost() ||
          (autoMotion && !motionAvailable)
        }
      >
        {text.autoEditTitle}
      </Button>
      {busy && <p role="status">{text.running}</p>}
      {job?.status === 'completed' && proposal?.proposed_document && (
        <div className={styles.proposalReview}>
          <p>{text.reviewProposal}</p>
          <p className={styles.hint}>{text.speakerReviewHint}</p>
          <p>
            {text.timelineSegments}: {proposal.proposed_document.segments?.length ?? 1}
            {' · '}
            {text.visualLayers}: {proposal.proposed_document.visual_layers?.length ?? 0}
          </p>
          {proposal.auto_motion && proposal.motion_review && (
            <div>
              <p>
                {text.motionProposal}: {proposal.motion_review.anchors}
                {' · '}
                {text.motionFaceReview}: {proposal.motion_review.single_face_samples}
                {' · '}
                {text.motionPulseReview}: {proposal.motion_review.emphasis_pulses}
              </p>
              {proposal.motion_review.skipped_multi_face_samples > 0 && (
                <p className={styles.hint}>
                  {text.motionMultiFaceReview}: {proposal.motion_review.skipped_multi_face_samples}
                </p>
              )}
              {proposal.motion_review.anchors === 0 && (
                <p className={styles.hint}>{text.motionNoProposal}</p>
              )}
              {proposal.motion_review.anchors > 0 && (
                <section>
                  <h3>{text.motionProposal}</h3>
                  <p className={styles.hint}>{text.motionProposalReviewHint}</p>
                  <ol className={styles.proposalList}>
                    {proposal.proposed_document.camera_motion?.map((key) => (
                      <li key={key.time_ms}>
                        <Button
                          variant="ghost"
                          disabled={!canReview}
                          onClick={() => useEditor.getState().seekTo(key.time_ms)}
                        >
                          {text.motionTime}: {seconds(key.time_ms)}
                        </Button>
                        {' · '}X {Math.round(key.x * 100)}%{' · '}Y {Math.round(key.y * 100)}%
                        {' · '}
                        {text.motionZoom} {Math.round(key.zoom * 100)}%
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
          {proposal.remove_silence && (
            <div>
              <p>
                {text.silenceProposal}: {silenceGaps.length}
                {' · '}
                {seconds(removedDuration)}
              </p>
              {silenceGaps.length === 0 ? (
                <p className={styles.hint}>{text.silenceNone}</p>
              ) : (
                <ol className={styles.proposalList}>
                  {silenceGaps.map((gap) => {
                    const contentTime = draft
                      ? sourceToContent(draft.document, gap.start_ms)
                      : null;
                    return (
                      <li key={gap.start_ms}>
                        <Button
                          variant="ghost"
                          disabled={!canReview || contentTime === null}
                          onClick={() => reviewSource(gap.start_ms)}
                        >
                          {text.reviewGap}
                        </Button>
                        {' · '}
                        {text.sourceTime} {seconds(gap.start_ms)}–{seconds(gap.end_ms)}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
          <Button onClick={apply} disabled={!canApply}>
            {text.applyProposal}
          </Button>
          {draft?.revision !== proposal.base_revision && (
            <p role="alert">{text.proposalConflict}</p>
          )}
          {(dirty || saving) && draft?.revision === proposal.base_revision && (
            <p role="status">{text.proposalSaveFirst}</p>
          )}
        </div>
      )}
      {(error || job?.error) && (
        <p role="alert" className={styles.error}>
          {error ?? job?.error}
        </p>
      )}
    </section>
  );
}

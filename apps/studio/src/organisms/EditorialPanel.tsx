import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Toggle } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { flushEditor } from '../lib/save';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import type { EditDocument } from '../types';
import styles from '../styles/Studio.module.css';

export function EditorialPanel() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const dirty = useEditor((state) => state.dirty);
  const [profile, setProfile] = useState('editorial');
  const [removeSilence, setRemoveSilence] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pack = useQuery({ queryKey: ['quality-pack'], queryFn: api.qualityPack });
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs, refetchInterval: 1000 });
  const job = jobs.data?.find((job) => job.id === jobId);
  const proposal = job?.payload as
    { proposed_document?: EditDocument; base_revision?: number } | undefined;
  const busy = pending || Boolean(job && ['queued', 'running', 'cancelling'].includes(job.status));
  const ready = Boolean(models.data?.some((model) => model.id === 'qwen3-4b' && model.ready));

  async function generate() {
    if (!draft) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const current = useEditor.getState().draft!;
      const queued = await api.autoEdit(current.id, current.revision, profile, removeSilence);
      setJobId(queued.id);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  function apply() {
    if (!proposal?.proposed_document || draft?.revision !== proposal.base_revision || dirty) {
      setError(text.proposalConflict);
      return;
    }
    change(
      (document) => Object.assign(document, structuredClone(proposal.proposed_document!)),
      true,
    );
    setJobId(null);
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
      {!pack.data?.ready && <p className={styles.hint}>{text.qualityPackMissing}</p>}
      {!ready && <p className={styles.hint}>{text.captionModelMissing}</p>}
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      <Button
        onClick={() => void generate()}
        disabled={busy || !draft?.document.words.length || !ready || isAndroidHost()}
      >
        {text.autoEditTitle}
      </Button>
      {busy && <p role="status">{text.running}</p>}
      {job?.status === 'completed' && proposal?.proposed_document && (
        <div>
          <p>{text.reviewProposal}</p>
          <p className={styles.hint}>{text.speakerReviewHint}</p>
          <p>
            {text.timelineSegments}: {proposal.proposed_document.segments?.length ?? 1}
            {' · '}
            {text.visualLayers}: {proposal.proposed_document.visual_layers?.length ?? 0}
          </p>
          <Button onClick={apply} disabled={draft?.revision !== proposal.base_revision || dirty}>
            {text.applyProposal}
          </Button>
          {draft?.revision !== proposal.base_revision && (
            <p role="alert">{text.proposalConflict}</p>
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

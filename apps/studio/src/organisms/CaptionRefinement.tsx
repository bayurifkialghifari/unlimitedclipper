import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { useEditor } from '../lib/editor-store';
import { flushEditor } from '../lib/save';
import { isAndroidHost } from '../lib/native';
import type { ModelStatus } from '../types';
import styles from '../styles/Studio.module.css';

export function CaptionRefinement({
  models,
  language,
  disabled,
  running,
  hasAudio,
}: {
  models: ModelStatus[];
  language: string;
  disabled: boolean;
  running: boolean;
  hasAudio: boolean;
}) {
  const text = useText();
  const client = useQueryClient();
  const draft = useEditor((state) => state.draft);
  const [selectedModel, setModel] = useState<string | null>(null);
  const [vocabulary, setVocabulary] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speechModels = models.filter((model) => model.kind === 'speech');
  const mediumReady = speechModels.some((model) => model.id === 'whisper-medium' && model.ready);
  const model = selectedModel ?? (mediumReady ? 'whisper-medium' : 'whisper-small');
  const ready = speechModels.some((item) => item.id === model && item.ready);
  const review =
    draft?.document.words.filter(
      (word) =>
        (word.confidence !== undefined && word.confidence !== null && word.confidence < 0.65) ||
        word.timing?.provenance === 'estimated' ||
        (word.timing?.alignment_confidence !== undefined &&
          word.timing.alignment_confidence !== null &&
          word.timing.alignment_confidence < 0.5) ||
        word.end_ms - word.start_ms > 1500,
    ) ?? [];

  async function refine() {
    setPending(true);
    setError(null);
    try {
      await flushEditor();
      const clip = useEditor.getState().draft;
      if (!clip) {
        return;
      }
      await api.refineCaptions(clip.id, clip.revision, model, language, vocabulary);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.captionRefinement} aria-label={text.captionQuality}>
      <h3>{text.captionQuality}</h3>
      <p className={styles.hint}>{text.captionRefineDetail}</p>
      <p className={styles.hint}>{text.timingReviewHint}</p>
      {isAndroidHost() && <p className={styles.hint}>{text.androidUnavailable}</p>}
      <Select label={text.speechModel} value={model} onChange={setModel}>
        {speechModels.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.ready ? '' : ' · ' + text.missing}
          </option>
        ))}
      </Select>
      <Field
        label={text.captionVocabulary}
        value={vocabulary}
        maxLength={400}
        placeholder={text.captionVocabularyHint}
        onChange={(event) => setVocabulary(event.target.value)}
      />
      {!ready && <p className={styles.hint}>{text.captionModelMissing}</p>}
      {!hasAudio && <p className={styles.hint}>{text.captionNoAudio}</p>}
      {disabled && !running && <p className={styles.hint}>{text.captionBusy}</p>}
      <Button
        disabled={!draft || disabled || pending || !ready || !hasAudio}
        onClick={() => void refine()}
      >
        {pending || running ? text.running : text.refineCaptions}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {draft?.document.caption_model && (
        <p className={styles.hint}>
          {text.captionModelUsed}:{' '}
          {models.find((item) => item.id === draft.document.caption_model?.split(':')[0])?.name ??
            text.speechModel}
        </p>
      )}
      {review.length > 0 && (
        <>
          <p className={styles.hint}>
            {review.length} {text.captionReviewDetail}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              useEditor.getState().selectWords(review.map((word) => word.id));
              useEditor.getState().seekTo(review[0].start_ms);
            }}
          >
            {text.reviewCaptions}
          </Button>
        </>
      )}
    </section>
  );
}

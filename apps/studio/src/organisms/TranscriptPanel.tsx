import { useRef } from 'react';
import { Button, Field } from '@unlimitedclipper/ui';
import { ScissorsIcon, TextTIcon } from '@phosphor-icons/react';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { time } from '../lib/format';
import { removeOutputRange } from '../lib/timeline';
import { useTimelineRemap } from '../hooks/use-timeline-remap';
import styles from '../styles/Editor.module.css';

export function TranscriptPanel({ showTextEditor = true }: { showTextEditor?: boolean }) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const selected = useEditor((state) => state.selectedWords);
  const playhead = useEditor((state) => state.playhead);
  const anchor = useRef<string | null>(null);
  const { remap, pending, supported } = useTimelineRemap();
  const words = draft?.document.words ?? [];
  const chosen = words.filter((word) => selected.includes(word.id));
  const word = chosen.length === 1 ? chosen[0] : null;

  function cut() {
    if (!draft || !chosen.length) {
      return;
    }
    const segments = removeOutputRange(
      draft.document,
      Math.min(...chosen.map((word) => word.start_ms)),
      Math.max(...chosen.map((word) => word.end_ms)),
    );
    if (!segments.length) {
      useEditor.setState({ error: text.cutLastScene });
      return;
    }
    void remap(segments);
  }

  return (
    <section className={styles.transcript} aria-label={text.transcript}>
      <h2>{text.transcript}</h2>
      <p className={styles.hint}>{words.length ? text.transcriptHint : text.emptyTranscript}</p>
      <div className={styles.transcriptWords}>
        {words.map((word, index) => (
          <button
            key={word.id}
            type="button"
            aria-pressed={selected.includes(word.id)}
            data-active={playhead >= word.start_ms && playhead < word.end_ms}
            title={time(word.start_ms) + ' – ' + time(word.end_ms)}
            onClick={(event) => {
              const first = words.findIndex((item) => item.id === anchor.current);
              const range =
                event.shiftKey && first >= 0
                  ? words.slice(Math.min(first, index), Math.max(first, index) + 1)
                  : [word];
              if (!event.shiftKey) {
                anchor.current = word.id;
              }
              useEditor.getState().selectWords(range.map((item) => item.id));
              useEditor.getState().seekTo(word.start_ms);
            }}
          >
            {word.text}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <Button disabled={!chosen.length || pending || !supported} onClick={cut}>
          <ScissorsIcon aria-hidden="true" />
          {text.cutVideo}
        </Button>
        <Button
          disabled={!chosen.length || pending}
          onClick={() =>
            useEditor.getState().change((document) => {
              document.words = document.words.filter((word) => !selected.includes(word.id));
            })
          }
        >
          <TextTIcon aria-hidden="true" />
          {text.removeCaption}
        </Button>
      </div>
      {word && showTextEditor && (
        <Field
          label={text.text}
          value={word.text}
          maxLength={200}
          onChange={(event) =>
            useEditor.getState().change((document) => {
              document.words.find((item) => item.id === word.id)!.text = event.target.value;
            })
          }
        />
      )}
    </section>
  );
}

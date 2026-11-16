import { Button, Select } from '@unlimitedclipper/ui';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { sourceSegments } from '../lib/timeline';
import styles from '../styles/Studio.module.css';

export function TransitionEditor() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  if (!draft) {
    return null;
  }
  const scenes = sourceSegments(draft.document);
  return (
    <section aria-label={text.transitions}>
      <h3>{text.transitions}</h3>
      <p className={styles.hint}>{text.transitionHint}</p>
      {scenes.length < 2 && <p className={styles.hint}>{text.transitionUnavailable}</p>}
      {scenes.map((scene, index) => {
        if (index === 0 || !scene.id) {
          return null;
        }
        const cut = scenes
          .slice(0, index)
          .reduce((total, previous) => total + previous.end_ms - previous.start_ms, 0);
        const previous = scenes[index - 1];
        const maximum = Math.min(
          600,
          previous.end_ms - previous.start_ms,
          scene.end_ms - scene.start_ms,
        );
        const active = draft.document.scene_transitions?.find(
          (transition) => transition.incoming_scene_id === scene.id,
        );
        return (
          <div key={scene.id} className={styles.transitionRow}>
            <Button variant="ghost" onClick={() => useEditor.getState().seekTo(cut)}>
              {text.transitionScene} {index + 1} · {(cut / 1000).toFixed(2)}s
            </Button>
            <Select
              label={text.transitions}
              value={active?.kind ?? 'cut'}
              disabled={maximum < 100}
              onChange={(kind) =>
                change((document) => {
                  document.version = Math.max(5, document.version);
                  document.scene_transitions = document.scene_transitions?.filter(
                    (transition) => transition.incoming_scene_id !== scene.id,
                  );
                  if (kind === 'dip_black') {
                    document.scene_transitions?.push({
                      incoming_scene_id: scene.id!,
                      kind,
                      duration_ms: [300, 200, 100].find((duration) => duration <= maximum) ?? 100,
                    });
                  }
                })
              }
            >
              <option value="cut">{text.transitionCut}</option>
              <option value="dip_black">{text.transitionDipBlack}</option>
            </Select>
            {active && (
              <Select
                label={text.transitionDuration}
                value={String(active.duration_ms)}
                onChange={(value) =>
                  change((document) => {
                    const transition = document.scene_transitions?.find(
                      (item) => item.incoming_scene_id === scene.id,
                    );
                    if (transition) {
                      transition.duration_ms = Number(value);
                    }
                  })
                }
              >
                {[100, 200, 300, 500, 600, active.duration_ms]
                  .filter((duration) => duration <= maximum)
                  .filter((duration, position, values) => values.indexOf(duration) === position)
                  .sort((left, right) => left - right)
                  .map((duration) => (
                    <option key={duration} value={duration}>
                      {(duration / 1000).toFixed(1)}s
                    </option>
                  ))}
              </Select>
            )}
          </div>
        );
      })}
    </section>
  );
}

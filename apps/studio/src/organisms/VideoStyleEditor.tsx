import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

const neutral = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };
const recipes = [
  { name: 'filterNatural', values: neutral },
  { name: 'filterCrisp', values: { brightness: 3, contrast: 20, saturation: 12, warmth: 0 } },
  { name: 'filterWarm', values: { brightness: 4, contrast: 8, saturation: 5, warmth: 30 } },
  { name: 'filterCool', values: { brightness: 0, contrast: 15, saturation: -8, warmth: -25 } },
  { name: 'filterMono', values: { brightness: 0, contrast: 18, saturation: -100, warmth: 0 } },
] as const;

export function VideoStyleEditor() {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = health.data?.editor_features?.includes('video_adjustments') ?? false;
  const values = draft?.document.video_adjustments ?? neutral;
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  return (
    <section aria-label={text.videoFilters}>
      <h2>{text.videoFilters}</h2>
      <p className={styles.hint}>{supported ? text.videoFiltersHint : text.editorUpgrade}</p>
      <div className={styles.styleRecipes} aria-label={text.preset}>
        {recipes.map((recipe) => (
          <Button
            key={recipe.name}
            disabled={!supported}
            aria-pressed={Object.keys(neutral).every(
              (key) =>
                values[key as keyof typeof neutral] === recipe.values[key as keyof typeof neutral],
            )}
            onClick={() =>
              change((document) => {
                document.video_adjustments = { ...recipe.values };
              })
            }
          >
            {text[recipe.name]}
          </Button>
        ))}
      </div>
      {(['brightness', 'contrast', 'saturation', 'warmth'] as const).map((key) => (
        <Field
          key={key}
          label={text[key] + ' · ' + values[key]}
          type="range"
          min={-100}
          max={100}
          step={1}
          value={values[key]}
          disabled={!supported}
          onChange={(event) =>
            change((document) => {
              document.video_adjustments = { ...values, [key]: Number(event.target.value) };
            })
          }
        />
      ))}
      <Button
        icon={<ArrowCounterClockwiseIcon />}
        disabled={!supported || Object.values(values).every((value) => value === 0)}
        onClick={() =>
          change((document) => {
            document.video_adjustments = { ...neutral };
          })
        }
      >
        {text.resetFilters}
      </Button>
    </section>
  );
}

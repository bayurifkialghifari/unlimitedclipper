import { useEffect, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import { ArrowCounterClockwiseIcon, CameraIcon, CheckIcon } from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { FilterThumbnail } from '../molecules/FilterThumbnail';
import type { Project } from '../types';
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

function sourceFrame(video: HTMLVideoElement) {
  if (video.readyState < 2 || video.seeking || !video.videoWidth || video.error) {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(320 / video.videoWidth, 320 / video.videoHeight);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

export function VideoStyleEditor({
  project,
  sourceVideo,
}: {
  project?: Project;
  sourceVideo?: RefObject<HTMLVideoElement | null>;
}) {
  const text = useText();
  const draft = useEditor((state) => state.draft);
  const change = useEditor((state) => state.change);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = health.data?.editor_features?.includes('video_adjustments') ?? false;
  const values = draft?.document.video_adjustments ?? neutral;
  const [frame, setFrame] = useState<{ clip: string; source: string } | null>(null);
  const [canCapture, setCanCapture] = useState(false);
  const clipId = draft?.id;
  function capture() {
    const video = sourceVideo?.current;
    if (!video || !clipId) {
      return;
    }
    const source = sourceFrame(video);
    if (source) {
      setFrame({ clip: clipId, source });
    }
  }
  useEffect(() => {
    const video = sourceVideo?.current;
    if (!video) {
      return;
    }
    const ready = () => {
      setCanCapture(
        video.readyState >= 2 && video.videoWidth > 0 && !video.error && !video.seeking,
      );
      const source = sourceFrame(video);
      if (source && clipId) {
        setFrame({ clip: clipId, source });
      }
    };
    ready();
    video.addEventListener('loadeddata', ready);
    video.addEventListener('seeked', ready);
    video.addEventListener('seeking', ready);
    video.addEventListener('emptied', ready);
    video.addEventListener('error', ready);
    return () => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('seeked', ready);
      video.removeEventListener('seeking', ready);
      video.removeEventListener('emptied', ready);
      video.removeEventListener('error', ready);
    };
  }, [sourceVideo, clipId, project?.asset_id]);
  const thumbnail =
    frame && frame.clip === clipId
      ? frame.source
      : project?.thumbnail_id
        ? assetUrl(project.thumbnail_id)
        : undefined;
  if (!draft) {
    return <p>{text.selectClip}</p>;
  }
  return (
    <section aria-label={text.videoFilters}>
      <h2>{text.videoFilters}</h2>
      <p className={styles.hint}>{supported ? text.videoFiltersHint : text.editorUpgrade}</p>
      <div className={styles.filterCurrent} aria-label={text.filterPreview}>
        <FilterThumbnail
          key={thumbnail}
          source={thumbnail}
          values={values}
          alt={text.filterPreview}
          unavailable={text.filterPreviewUnavailable}
          loading={text.filterPreviewLoading}
        />
      </div>
      <Button icon={<CameraIcon />} disabled={!canCapture} onClick={capture}>
        {text.filterCaptureFrame}
      </Button>
      <p className={styles.hint}>{text.filterThumbnailHint}</p>
      <div className={styles.filterRecipes} aria-label={text.preset}>
        {recipes.map((recipe) => (
          <Button
            key={recipe.name}
            className={styles.filterRecipe}
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
            <FilterThumbnail
              key={thumbnail}
              source={thumbnail}
              values={recipe.values}
              unavailable={text.filterPreviewUnavailable}
              loading={text.filterPreviewLoading}
            />
            <span className={styles.filterRecipeLabel}>
              {text[recipe.name]}
              <CheckIcon aria-hidden="true" className={styles.filterSelected} />
            </span>
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

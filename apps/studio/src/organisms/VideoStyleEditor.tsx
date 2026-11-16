import { useEffect, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@unlimitedclipper/ui';
import {
  ArrowCounterClockwiseIcon,
  CameraIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { api, assetUrl } from '../lib/api';
import { filterDragType, placeFilter } from '../lib/filter-placement';
import { FilterThumbnail } from '../molecules/FilterThumbnail';
import { LayerTimingFields } from '../molecules/LayerTimingFields';
import type { Project, VideoAdjustments } from '../types';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { outputDuration } from '../lib/timeline';
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
  const playhead = useEditor((state) => state.playhead);
  const selection = useEditor((state) => state.timelineSelection);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = health.data?.editor_features?.includes('video_adjustments') ?? false;
  const selectedSpan = draft?.document.filter_layers?.find(
    (layer) => selection?.kind === 'filter' && layer.id === selection.id,
  );
  const values = selectedSpan?.adjustments ?? draft?.document.video_adjustments ?? neutral;
  const [recipeSelection, setRecipeSelection] = useState<{
    scope: string;
    values: string;
    index: number;
  } | null>(null);
  const scope = draft?.id + ':' + (selectedSpan?.id ?? 'whole');
  const valueKey = JSON.stringify(values);
  const appliedIndex = recipes.findIndex(
    (recipe) =>
      recipe.values.brightness === values.brightness &&
      recipe.values.contrast === values.contrast &&
      recipe.values.saturation === values.saturation &&
      recipe.values.warmth === values.warmth,
  );
  const previewIndex =
    recipeSelection?.scope === scope && recipeSelection.values === valueKey
      ? recipeSelection.index
      : null;
  const recipeIndex = previewIndex ?? Math.max(0, appliedIndex);
  const [error, setError] = useState<string | null>(null);
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
  const selectedRecipe = recipes[recipeIndex];

  function updateValues(next: VideoAdjustments) {
    change((document) => {
      const span = document.filter_layers?.find((layer) => layer.id === selectedSpan?.id);
      if (span) {
        span.adjustments = next;
      } else {
        document.video_adjustments = next;
      }
    });
  }

  function addAtPlayhead() {
    if (!supported || !draft) {
      return;
    }
    let id = '';
    try {
      change((document) => {
        id = placeFilter(document, selectedRecipe.values, playhead);
      });
      useEditor.setState({ timelineSelection: { kind: 'filter', id } });
      setError(null);
    } catch {
      setError(text.filterTrackFull);
    }
  }

  function updateTiming(startMs: number, endMs: number) {
    if (!selectedSpan || !draft) {
      return;
    }
    const conflict = draft.document.filter_layers?.some(
      (layer) => layer.id !== selectedSpan.id && startMs < layer.end_ms && endMs > layer.start_ms,
    );
    if (conflict) {
      setError(text.filterOverlap);
      return;
    }
    change((document) => {
      const span = document.filter_layers?.find((layer) => layer.id === selectedSpan.id);
      if (span) {
        span.start_ms = startMs;
        span.end_ms = endMs;
        document.filter_layers?.sort((left, right) => left.start_ms - right.start_ms);
      }
    });
    setError(null);
  }
  return (
    <section aria-label={text.videoFilters}>
      <h2>{text.videoFilters}</h2>
      <p className={styles.hint}>{supported ? text.videoFiltersHint : text.editorUpgrade}</p>
      {selectedSpan && (
        <div className={styles.selectedFilter}>
          <div className={styles.layerHeading}>
            <strong>{text.filterSelectedSpan}</strong>
            <Button
              variant="danger"
              icon={<TrashIcon aria-hidden="true" />}
              onClick={() => {
                change((document) => {
                  document.filter_layers = document.filter_layers?.filter(
                    (layer) => layer.id !== selectedSpan.id,
                  );
                });
                useEditor.setState({ timelineSelection: null });
              }}
            >
              {text.delete}
            </Button>
          </div>
          <LayerTimingFields
            layer={selectedSpan}
            duration={outputDuration(draft.document)}
            onChange={(timing) => updateTiming(timing.start_ms, timing.end_ms)}
          />
        </div>
      )}
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
        {recipes.map((recipe, index) => (
          <Button
            key={recipe.name}
            className={styles.filterRecipe}
            disabled={!supported}
            draggable={supported}
            onDragStart={(event) => {
              event.dataTransfer.setData(filterDragType, JSON.stringify(recipe.values));
              event.dataTransfer.effectAllowed = 'copy';
            }}
            aria-pressed={
              previewIndex === index || (previewIndex === null && appliedIndex === index)
            }
            onClick={() => setRecipeSelection({ scope, values: valueKey, index })}
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
      <div className={styles.visualAddActions}>
        <Button
          icon={<PlusIcon aria-hidden="true" />}
          disabled={!supported || (draft.document.filter_layers?.length ?? 0) >= 32}
          onClick={addAtPlayhead}
        >
          {text.filterAddAtPlayhead}
        </Button>
        <Button disabled={!supported} onClick={() => updateValues({ ...selectedRecipe.values })}>
          {selectedSpan ? text.filterApplySelected : text.filterApplyWholeClip}
        </Button>
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
          onChange={(event) => updateValues({ ...values, [key]: Number(event.target.value) })}
        />
      ))}
      <Button
        icon={<ArrowCounterClockwiseIcon />}
        disabled={!supported || Object.values(values).every((value) => value === 0)}
        onClick={() => updateValues({ ...neutral })}
      >
        {text.resetFilters}
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

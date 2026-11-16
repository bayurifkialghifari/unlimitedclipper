import type { EditDocument, FilterLayer, VideoAdjustments } from '../types';
import { identifiedSegments, outputDuration } from './timeline';

export const filterDragType = 'application/x-unlimitedclipper-filter';

export function placeFilter(
  document: EditDocument,
  adjustments: VideoAdjustments,
  positionMs: number,
) {
  const duration = outputDuration(document);
  const start = Math.max(0, Math.min(duration - 1, Math.round(positionMs)));
  const end = Math.min(duration, start + 3000);
  const remaining = (document.filter_layers ?? []).flatMap((layer) => {
    if (layer.end_ms <= start || layer.start_ms >= end) {
      return [layer];
    }
    const fragments: FilterLayer[] = [];
    if (layer.start_ms < start) {
      fragments.push({ ...layer, end_ms: start });
    }
    if (layer.end_ms > end) {
      fragments.push({ ...layer, id: crypto.randomUUID(), start_ms: end });
    }
    return fragments;
  });
  if (remaining.length >= 32) {
    throw new Error('Filter track is full. Remove another filter first.');
  }
  const id = crypto.randomUUID();
  document.segments = identifiedSegments(document);
  document.version = Math.max(document.version, 5);
  document.filter_layers = [
    ...remaining,
    { id, start_ms: start, end_ms: end, adjustments: { ...adjustments } },
  ].sort((left, right) => left.start_ms - right.start_ms);
  return id;
}

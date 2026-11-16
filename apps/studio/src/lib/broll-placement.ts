import type { BrollAsset, VisualLayer } from '../types';
import { useEditor } from './editor-store';
import { outputDuration, sourceSegments } from './timeline';

export const brollDragType = 'application/x-unlimitedclipper-broll';

export function placeBroll(asset: BrollAsset, clipId: string, startMs: number) {
  const current = useEditor.getState();
  if (current.draft?.id !== clipId) {
    throw new Error('The selected clip changed.');
  }
  const duration = outputDuration(current.draft.document);
  const start = Math.max(0, Math.round(startMs));
  if (
    start >= duration ||
    asset.duration_ms <= 0 ||
    (current.draft.document.visual_layers?.length ?? 0) >= 64
  ) {
    throw new Error('This B-roll cannot fit at the selected time.');
  }
  const end = Math.min(duration, start + Math.min(asset.duration_ms, 3_000));
  const id = crypto.randomUUID();
  const layer: VisualLayer = {
    id,
    kind: 'broll',
    enabled: true,
    start_ms: start,
    end_ms: end,
    text: '',
    x: 0.5,
    y: 0.24,
    color: '#FFCB66',
    size: 60,
    crop: null,
    secondary_crop: null,
    asset_id: asset.asset_id,
    source_start_ms: 0,
  };
  current.change((document) => {
    document.version = Math.max(2, document.version);
    document.segments = sourceSegments(document);
    document.visual_layers = [...(document.visual_layers ?? []), layer];
  });
  useEditor.setState({ timelineSelection: { kind: 'visual', id } });
  return id;
}

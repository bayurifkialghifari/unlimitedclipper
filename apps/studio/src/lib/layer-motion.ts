import type { VisualLayer } from '../types';

export function retimeLayerMotion(
  layer: VisualLayer,
  startMs: number,
  endMs: number,
  moving: boolean,
) {
  if (!layer.motion?.length) {
    return;
  }
  if (moving) {
    const delta = startMs - layer.start_ms;
    layer.motion = layer.motion.map((key) => ({ ...key, time_ms: key.time_ms + delta }));
    return;
  }
  layer.motion = layer.motion.filter((key) => key.time_ms >= startMs && key.time_ms <= endMs);
}

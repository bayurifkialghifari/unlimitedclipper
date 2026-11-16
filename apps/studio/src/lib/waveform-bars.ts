import type { SourceSegment } from '../types';

export type WaveformBar = {
  x: number;
  width: number;
  level: number;
};

export function waveformBars(
  peaks: number[],
  bucketMs: number,
  scenes: SourceSegment[],
  trackWidth: number,
): WaveformBar[] {
  const duration = scenes.reduce((total, scene) => total + scene.end_ms - scene.start_ms, 0);
  if (!duration || !bucketMs || !peaks.length) {
    return [];
  }
  const columns = Math.max(1, Math.min(1200, Math.floor(trackWidth / 4)));
  const width = trackWidth / columns;
  const bars: WaveformBar[] = [];

  for (let column = 0; column < columns; column += 1) {
    const from = (column / columns) * duration;
    const to = ((column + 1) / columns) * duration;
    let offset = 0;
    let peak = 0;
    for (const scene of scenes) {
      const length = scene.end_ms - scene.start_ms;
      const overlapStart = Math.max(from, offset);
      const overlapEnd = Math.min(to, offset + length);
      if (overlapEnd > overlapStart) {
        const sourceStart = scene.start_ms + overlapStart - offset;
        const sourceEnd = scene.start_ms + overlapEnd - offset;
        const first = Math.floor(sourceStart / bucketMs);
        const last = Math.ceil(sourceEnd / bucketMs) - 1;
        for (let index = first; index <= last && index < peaks.length; index += 1) {
          peak = Math.max(peak, peaks[index] ?? 0);
        }
      }
      offset += length;
      if (offset >= to) {
        break;
      }
    }
    bars.push({
      x: column * width,
      width: Math.max(1, width - 1),
      level: peak / 255,
    });
  }
  const audible = bars
    .map((bar) => bar.level)
    .filter((level) => level > 0)
    .sort((left, right) => left - right);
  const reference = audible[Math.ceil((audible.length - 1) * 0.95)] ?? 0;
  if (reference === 0) {
    return bars;
  }
  return bars.map((bar) => ({
    ...bar,
    level: Math.min(1, Math.sqrt(bar.level / reference)),
  }));
}

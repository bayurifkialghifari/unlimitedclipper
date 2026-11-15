import type { EditDocument, SourceSegment } from '../types';
import { identifiedSegments, sourceSegments } from './timeline';

export function timelineTime(milliseconds: number, tenths = false) {
  const value = Math.max(0, Math.round(milliseconds));
  const seconds = Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const prefix = hours
    ? [hours, minutes.toString().padStart(2, '0'), remainder.toString().padStart(2, '0')].join(':')
    : [minutes.toString().padStart(2, '0'), remainder.toString().padStart(2, '0')].join(':');
  return tenths ? prefix + '.' + Math.floor((value % 1000) / 100) : prefix;
}

export function timelineTicks(durationMs: number, widthPx: number) {
  const duration = Math.max(1, durationMs);
  const pixelsPerMs = Math.max(1, widthPx) / duration;
  const minimumStep = 82 / pixelsPerMs;
  let power = 100;
  let step = power;
  while (step < minimumStep) {
    if (step === power) {
      step = power * 2;
    } else if (step === power * 2) {
      step = power * 5;
    } else {
      power *= 10;
      step = power;
    }
  }
  const ticks: number[] = [];
  for (let timeMs = 0; timeMs <= durationMs; timeMs += step) {
    ticks.push(timeMs);
  }
  return {
    ticks,
    step,
  };
}

export function sceneFrameTimes(document: EditDocument, limit = 32) {
  const scenes = identifiedSegments(document);
  const lengths = scenes.map((scene) => scene.end_ms - scene.start_ms);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const target = Math.min(limit, Math.max(scenes.length, Math.ceil(total / 2000)));
  const counts = scenes.map(() => 1);
  while (counts.reduce((sum, count) => sum + count, 0) < target) {
    let best = -1;
    let bestSpan = 0;
    for (let index = 0; index < scenes.length; index += 1) {
      const span = lengths[index] / counts[index];
      if (span > bestSpan && span >= 1500) {
        best = index;
        bestSpan = span;
      }
    }
    if (best < 0) {
      break;
    }
    counts[best] += 1;
  }
  const result = new Map<string, number[]>();
  scenes.forEach((scene, index) => {
    const length = lengths[index];
    const times = Array.from({ length: counts[index] }, (_, frame) =>
      Math.min(
        scene.end_ms - 1,
        scene.start_ms + Math.floor((length * (frame + 0.5)) / counts[index]),
      ),
    );
    result.set(scene.id!, times);
  });
  return result;
}

export function clipRepresentativeTime(document: EditDocument) {
  const first = sourceSegments(document)[0] as SourceSegment | undefined;
  if (!first) {
    return 0;
  }
  return Math.min(
    first.end_ms - 1,
    first.start_ms + Math.floor((first.end_ms - first.start_ms) / 2),
  );
}

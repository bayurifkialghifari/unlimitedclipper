import { expect, test } from 'vitest';
import {
  clipRepresentativeTime,
  sceneFrameTimes,
  timelineTicks,
  timelineTime,
} from '../../apps/studio/src/lib/timeline-presentation';
import type { EditDocument } from '../../apps/studio/src/types';

test('short timeline ticks remain distinct at fit and zoomed widths', () => {
  for (const width of [320, 1200, 4800]) {
    const { ticks, step } = timelineTicks(4000, width);
    const labels = ticks.map((tick) => timelineTime(tick, step < 1000));
    expect(new Set(labels).size).toBe(labels.length);
    expect(ticks[0]).toBe(0);
    expect(ticks.every((tick) => tick <= 4000)).toBe(true);
  }
});

test('footage samples follow edited scene order and stay inside source ranges', () => {
  const document = {
    version: 3,
    segments: [
      { id: 'later', start_ms: 9000, end_ms: 11000 },
      { id: 'earlier', start_ms: 1000, end_ms: 5000 },
    ],
  } as EditDocument;
  const samples = sceneFrameTimes(document);
  expect([...samples.keys()]).toEqual(['later', 'earlier']);
  expect(samples.get('later')?.every((time) => time >= 9000 && time < 11000)).toBe(true);
  expect(samples.get('earlier')?.every((time) => time >= 1000 && time < 5000)).toBe(true);
  expect([...samples.values()].flat().length).toBeLessThanOrEqual(32);
  expect(clipRepresentativeTime(document)).toBe(10000);
});

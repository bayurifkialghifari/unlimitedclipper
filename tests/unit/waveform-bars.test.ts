import { describe, expect, it } from 'vitest';
import { waveformBars } from '../../apps/studio/src/lib/waveform-bars';

describe('waveformBars', () => {
  it('follows source audio when output scenes are reordered', () => {
    const bars = waveformBars(
      [0, 0, 255, 255],
      100,
      [
        { start_ms: 200, end_ms: 400 },
        { start_ms: 0, end_ms: 200 },
      ],
      16,
    );
    expect(bars.map((bar) => bar.level)).toEqual([1, 1, 0, 0]);
  });

  it('retains a short sound that falls between display-column centers', () => {
    const bars = waveformBars([255, 0, 0, 0], 100, [{ start_ms: 0, end_ms: 400 }], 8);
    expect(bars.map((bar) => bar.level)).toEqual([1, 0]);
  });

  it('starts an imported audio layer at its trimmed source offset', () => {
    const bars = waveformBars([0, 255, 0, 128], 100, [{ start_ms: 100, end_ms: 400 }], 12);
    expect(bars.map((bar) => bar.level)).toEqual([1, 0, expect.any(Number)]);
    expect(bars[2].level).toBeGreaterThan(0);
    expect(bars[2].level).toBeLessThan(1);
  });
});

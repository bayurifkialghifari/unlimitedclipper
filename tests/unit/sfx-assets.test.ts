import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import manifest from '../../resources/sfx.json';

test('included offline sounds match the reviewed CC0 archive bytes', () => {
  expect(new Set(manifest.sounds.map((sound) => sound.id)).size).toBe(manifest.sounds.length);
  for (const sound of manifest.sounds) {
    const data = readFileSync('apps/studio/public/sfx/' + sound.filename);
    expect(data.length).toBe(sound.size);
    expect(createHash('sha256').update(data).digest('hex')).toBe(sound.sha256);
    expect(data.toString('ascii', 0, 4)).toBe('RIFF');
    expect(data.toString('ascii', 8, 12)).toBe('WAVE');
    expect(sound.duration_ms).toBeGreaterThan(0);
    expect(manifest.packs.find((pack) => pack.id === sound.pack)?.license).toBe('CC0-1.0');
  }
});

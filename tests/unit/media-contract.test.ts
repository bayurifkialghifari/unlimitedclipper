import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

describe('release manifests', () => {
  test('pins models to immutable revisions and verified sizes', () => {
    const models = JSON.parse(readFileSync('resources/models.json', 'utf8')) as Array<{
      url: string;
      sha256: string;
      size: number;
    }>;
    for (const model of models) {
      expect(new URL(model.url).pathname.split('/').at(-2)).toMatch(/^[a-f0-9]{40}$/);
      expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(model.size).toBeGreaterThan(0);
    }
  });
});

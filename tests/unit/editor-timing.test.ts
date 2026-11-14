import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Clip } from '../../apps/studio/src/types';

let editor: typeof import('../../apps/studio/src/lib/editor-store').useEditor;

beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  editor = (await import('../../apps/studio/src/lib/editor-store')).useEditor;
});

beforeEach(() => {
  editor.getState().selectClip({
    id: 'timing-fixture',
    project_id: 'project',
    name: 'Timing fixture',
    revision: 1,
    document: {
      version: 2,
      start_ms: 1000,
      end_ms: 6000,
      segments: [{ start_ms: 1000, end_ms: 6000 }],
      words: [
        {
          id: 'word',
          text: 'Hello',
          start_ms: 1000,
          end_ms: 1400,
          timing: {
            provenance: 'aligned',
            source_start_ms: 2000,
            source_end_ms: 2400,
            alignment_confidence: 0.8,
          },
        },
      ],
    },
  } as unknown as Clip);
});

test('manual text corrections survive undo and engine proposals retain acoustic provenance', () => {
  editor.getState().change((document) => {
    document.words[0].text = 'Corrected';
  });
  expect(editor.getState().draft?.document.words[0].timing?.provenance).toBe('manual');
  editor.getState().undo();
  expect(editor.getState().draft?.document.words[0].text).toBe('Hello');
  expect(editor.getState().draft?.document.words[0].timing?.provenance).toBe('aligned');
  editor.getState().change((document) => {
    document.words[0].start_ms = 950;
    document.words[0].timing!.source_start_ms = 1950;
  }, true);
  expect(editor.getState().draft?.document.words[0].timing?.provenance).toBe('aligned');
});

test('removing an earlier range does not turn a source-preserving word shift into a manual edit', () => {
  editor.getState().change((document) => {
    document.start_ms = 1500;
    document.segments = [{ start_ms: 1500, end_ms: 6000 }];
    document.words[0].start_ms -= 500;
    document.words[0].end_ms -= 500;
  });
  expect(editor.getState().draft?.document.words[0].timing?.provenance).toBe('aligned');
  expect(editor.getState().draft?.document.words[0].timing?.source_start_ms).toBe(2000);
});

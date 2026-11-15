import type { EditDocument } from '../types';

export function hookSourceSignature(document: EditDocument): string {
  return JSON.stringify([
    document.start_ms,
    document.end_ms,
    (document.segments ?? []).map((segment) => [segment.start_ms, segment.end_ms]),
    document.words.map((word) => [word.id, word.text, word.start_ms, word.end_ms]),
  ]);
}

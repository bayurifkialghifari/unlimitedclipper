import type { EditDocument, SourceSegment } from '../types';

export function sourceSegments(document: EditDocument): SourceSegment[] {
  if (document.version === 1 || !document.segments?.length) {
    return [{ start_ms: document.start_ms, end_ms: document.end_ms }];
  }
  return document.segments;
}

export function outputDuration(document: EditDocument): number {
  return sourceSegments(document).reduce(
    (sum, segment) => sum + segment.end_ms - segment.start_ms,
    0,
  );
}

export function outputToSource(document: EditDocument, milliseconds: number): number | null {
  let offset = 0;
  for (const segment of sourceSegments(document)) {
    const duration = segment.end_ms - segment.start_ms;
    if (milliseconds >= offset && milliseconds < offset + duration) {
      return segment.start_ms + milliseconds - offset;
    }
    offset += duration;
  }
  return milliseconds === offset ? document.end_ms : null;
}

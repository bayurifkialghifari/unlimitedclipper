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
  return milliseconds === offset ? (sourceSegments(document).at(-1)?.end_ms ?? null) : null;
}

export function identifiedSegments(document: EditDocument): SourceSegment[] {
  return sourceSegments(document).map((segment, index) => ({
    ...segment,
    id: segment.id ?? `scene-${index}-${segment.start_ms}-${segment.end_ms}`,
  }));
}

export function removeOutputRange(
  document: EditDocument,
  start: number,
  end: number,
): SourceSegment[] {
  let offset = 0;
  return identifiedSegments(document).flatMap((segment) => {
    const length = segment.end_ms - segment.start_ms;
    const left = Math.max(0, Math.min(length, start - offset));
    const right = Math.max(0, Math.min(length, end - offset));
    offset += length;
    if (right <= left) {
      return [segment];
    }
    const retained: SourceSegment[] = [];
    if (left > 0) {
      retained.push({ ...segment, end_ms: segment.start_ms + left });
    }
    if (right < length) {
      retained.push({
        ...segment,
        id: left > 0 ? crypto.randomUUID() : segment.id,
        start_ms: segment.start_ms + right,
      });
    }
    return retained;
  });
}

import type { CropRect, EditDocument, PreviewPlan } from '../types';

type MotionCurve = PreviewPlan['layer_motion'][string];
type CameraPlan = NonNullable<PreviewPlan['camera_motion']>;

export function motionValuesAt(curve: MotionCurve, milliseconds: number): number[] {
  for (const interval of curve.intervals) {
    if (milliseconds < interval.start_ms) {
      return curve.initial;
    }
    if (milliseconds < interval.end_ms) {
      const progress = (milliseconds - interval.start_ms) / (interval.end_ms - interval.start_ms);
      return interval.coefficients.map(
        ([base, first, second, third]) =>
          base + progress * (first + progress * (second + progress * third)),
      );
    }
  }
  return curve.final_values;
}

export function cameraAt(
  document: EditDocument,
  milliseconds: number,
  plan?: CameraPlan | null,
): CropRect {
  if (document.camera_motion?.length && plan) {
    const [centerX, centerY, zoom] = motionValuesAt(plan.curve, milliseconds);
    const width = plan.base_width / zoom;
    const height = plan.base_height / zoom;
    return {
      x: Math.max(0, Math.min(1 - width, centerX - width / 2)),
      y: Math.max(0, Math.min(1 - height, centerY - height / 2)),
      width,
      height,
    };
  }
  let previous = { time_ms: 0, x: document.crop.x, y: document.crop.y };
  for (const next of document.keyframes) {
    if (next.time_ms > milliseconds) {
      const fraction = Math.max(
        0,
        (milliseconds - previous.time_ms) / (next.time_ms - previous.time_ms),
      );
      return {
        ...document.crop,
        x: previous.x + (next.x - previous.x) * fraction,
        y: previous.y + (next.y - previous.y) * fraction,
      };
    }
    previous = next;
  }
  return { ...document.crop, x: previous.x, y: previous.y };
}

export function drawRegion(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  crop: CropRect,
  x: number,
  y: number,
  width: number,
  height: number,
  contain = false,
) {
  const sourceWidth = video.videoWidth * crop.width;
  const sourceHeight = video.videoHeight * crop.height;
  const scale = contain
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(
    video,
    crop.x * video.videoWidth,
    crop.y * video.videoHeight,
    sourceWidth,
    sourceHeight,
    x + (width - sourceWidth * scale) / 2,
    y + (height - sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale,
  );
  context.restore();
}

export function colorFilter(document?: EditDocument) {
  const values = document?.video_adjustments;
  if (!values) {
    return 'none';
  }
  return (
    'brightness(' +
    (1 + values.brightness / 100) +
    ') contrast(' +
    (1 + values.contrast / 100) +
    ') saturate(' +
    (1 + values.saturation / 100) +
    ')'
  );
}

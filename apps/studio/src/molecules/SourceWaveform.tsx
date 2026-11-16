import { memo } from 'react';
import { waveformBars } from '../lib/waveform-bars';
import type { SourceSegment } from '../types';
import styles from '../styles/Editor.module.css';

type Props = {
  peaks: number[];
  bucketMs: number;
  scenes: SourceSegment[];
  trackWidth: number;
};

function SourceWaveformView({ peaks, bucketMs, scenes, trackWidth }: Props) {
  const bars = waveformBars(peaks, bucketMs, scenes, trackWidth);
  return (
    <svg
      className={styles.waveformSvg}
      viewBox={'0 0 ' + trackWidth + ' 48'}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((bar, index) => {
        const height = Math.max(1, bar.level * 40);
        return <rect key={index} x={bar.x} y={24 - height / 2} width={bar.width} height={height} />;
      })}
    </svg>
  );
}

export const SourceWaveform = memo(SourceWaveformView, (previous, next) => {
  return (
    previous.peaks === next.peaks &&
    previous.bucketMs === next.bucketMs &&
    previous.trackWidth === next.trackWidth &&
    previous.scenes.length === next.scenes.length &&
    previous.scenes.every((scene, index) => {
      const current = next.scenes[index];
      return (
        scene.id === current.id &&
        scene.start_ms === current.start_ms &&
        scene.end_ms === current.end_ms
      );
    })
  );
});

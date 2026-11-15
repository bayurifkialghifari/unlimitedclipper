import { useRef } from 'react';
import styles from '../styles/Studio.module.css';

export function CropHandle({
  label,
  onMove,
  pointerDirection = 'pan',
}: {
  label: string;
  onMove: (horizontal: number, vertical: number) => void;
  pointerDirection?: 'pan' | 'move';
}) {
  const position = useRef<{ x: number; y: number } | null>(null);
  return (
    <button
      type="button"
      className={styles.cropHandle}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        position.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!position.current) {
          return;
        }
        const horizontal = event.clientX - position.current.x;
        const vertical = event.clientY - position.current.y;
        position.current = { x: event.clientX, y: event.clientY };
        const direction = pointerDirection === 'move' ? 1 : -1;
        onMove(
          (direction * horizontal) / event.currentTarget.clientWidth,
          (direction * vertical) / event.currentTarget.clientHeight,
        );
      }}
      onPointerUp={() => {
        position.current = null;
      }}
      onPointerCancel={() => {
        position.current = null;
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.01;
        const directions: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const direction = directions[event.key];
        if (direction) {
          event.preventDefault();
          onMove(...direction);
        }
      }}
    />
  );
}

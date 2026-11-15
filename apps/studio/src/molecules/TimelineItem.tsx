import { useRef, type PointerEvent } from 'react';
import { useText } from '../lib/i18n';
import styles from '../styles/Editor.module.css';

export type TimelineGesture = 'move' | 'start' | 'end';

export function TimelineItem({
  label,
  start,
  end,
  scale,
  selected,
  disabled,
  frames,
  sourceRange,
  onSelect,
  onPreview,
  onCommit,
}: {
  label: string;
  start: number;
  end: number;
  scale: number;
  selected: boolean;
  disabled?: boolean;
  frames?: { sourceTimeMs: number; url?: string }[];
  sourceRange?: string;
  onSelect: () => void;
  onPreview: (mode: TimelineGesture, delta: number | null) => void;
  onCommit: (mode: TimelineGesture, delta: number) => void;
}) {
  const text = useText();
  const drag = useRef<{ x: number; mode: TimelineGesture; delta: number } | null>(null);

  function begin(event: PointerEvent<HTMLButtonElement>, mode: TimelineGesture) {
    if (event.button !== 0 || disabled) {
      return;
    }
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, mode, delta: 0 };
    onPreview(mode, 0);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current) {
      drag.current.delta = Math.round((event.clientX - drag.current.x) / scale);
      onPreview(drag.current.mode, drag.current.delta);
    }
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    drag.current = null;
    if (current) {
      onPreview(current.mode, null);
      if (!cancelled && Math.abs(event.clientX - current.x) >= 3) {
        onCommit(current.mode, current.delta);
      }
    }
  }

  function control(mode: TimelineGesture, name: string) {
    return (
      <button
        type="button"
        className={mode === 'move' ? styles.itemBody : styles.trimHandle}
        aria-label={name + ' · ' + label}
        title={mode === 'move' ? sourceRange : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerDown={(event) => begin(event, mode)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drag.current) {
            onPreview(drag.current.mode, null);
            drag.current = null;
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onSelect();
            onCommit(mode, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1000 : 100));
          }
        }}
      >
        {mode === 'move' ? (
          <>
            {Boolean(frames?.length) && (
              <span className={styles.timelineItemMedia} aria-hidden="true">
                {frames?.map((frame) =>
                  frame.url ? (
                    <img
                      key={frame.sourceTimeMs}
                      src={frame.url}
                      width={256}
                      height={144}
                      loading="lazy"
                      alt=""
                    />
                  ) : (
                    <span key={frame.sourceTimeMs} />
                  ),
                )}
              </span>
            )}
            <span className={styles.timelineItemLabel}>{label}</span>
          </>
        ) : (
          <span aria-hidden="true">Ⅱ</span>
        )}
      </button>
    );
  }

  return (
    <div
      className={styles.timelineItem}
      data-selected={selected}
      data-media={Boolean(frames?.some((frame) => frame.url))}
      style={{ left: start * scale, width: Math.max(12, (end - start) * scale) }}
    >
      {control('start', text.trimStart)}
      {control('move', text.moveLayer)}
      {control('end', text.trimEnd)}
    </div>
  );
}

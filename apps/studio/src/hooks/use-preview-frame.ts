import { useEffect, useState, type RefObject } from 'react';

export function usePreviewFrame(stage: RefObject<HTMLDivElement | null>, aspect: number) {
  const [width, setWidth] = useState(270);
  useEffect(() => {
    const element = stage.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.contentRect;
      if (size.width > 0 && size.height > 0) {
        setWidth(Math.min(size.width, size.height * aspect));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [stage, aspect]);
  return width;
}

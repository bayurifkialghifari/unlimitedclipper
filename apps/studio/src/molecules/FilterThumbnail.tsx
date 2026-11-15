import { useId, useState } from 'react';
import type { EditDocument } from '../types';
import styles from '../styles/Studio.module.css';

type Adjustments = NonNullable<EditDocument['video_adjustments']>;

export function FilterThumbnail({
  source,
  values,
  alt = '',
  unavailable,
  loading,
}: {
  source?: string;
  values: Adjustments;
  alt?: string;
  unavailable: string;
  loading: string;
}) {
  const id = useId().replaceAll(':', '');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const contrast = 1 + values.contrast * 0.0075;
  const offset = values.brightness * 0.003 + (1 - contrast) / 2;
  const warmth = values.warmth * 0.0015;
  return (
    <span className={styles.filterThumbnail} aria-busy={Boolean(source && !failed && !loaded)}>
      <svg width="0" height="0" aria-hidden="true" className={styles.filterDefinitions}>
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="linear" slope={contrast} intercept={offset} />
              <feFuncG type="linear" slope={contrast} intercept={offset} />
              <feFuncB type="linear" slope={contrast} intercept={offset} />
            </feComponentTransfer>
            <feColorMatrix type="saturate" values={String(1 + values.saturation * 0.01)} />
            <feComponentTransfer>
              <feFuncR type="linear" intercept={warmth} slope="1" />
              <feFuncG type="identity" />
              <feFuncB type="linear" intercept={-warmth} slope="1" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      {source && !failed ? (
        <img
          src={source}
          alt={alt}
          draggable={false}
          style={{ filter: 'url(#' + id + ')' }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.filterUnavailable} aria-hidden={!alt}>
          {unavailable}
        </span>
      )}
      {source && !failed && !loaded && (
        <span className={styles.filterLoading} aria-hidden={!alt}>
          {loading}
        </span>
      )}
    </span>
  );
}

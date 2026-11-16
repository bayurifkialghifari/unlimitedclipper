import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { SourceWaveform } from './SourceWaveform';
import styles from '../styles/Editor.module.css';

export function AssetWaveform({
  assetId,
  sourceStartMs,
  durationMs,
  width,
}: {
  assetId: string;
  sourceStartMs: number;
  durationMs: number;
  width: number;
}) {
  const text = useText();
  const query = useQuery({
    queryKey: ['asset-waveform', assetId],
    queryFn: ({ signal }) => api.assetWaveform(assetId, signal),
    refetchInterval: (current) => (current.state.data?.status === 'pending' ? 1500 : false),
    retry: false,
  });
  if (query.data?.status === 'ready' && query.data.bucket_ms && query.data.peaks.length > 0) {
    return (
      <span className={styles.timelineItemWaveform}>
        <SourceWaveform
          peaks={query.data.peaks}
          bucketMs={query.data.bucket_ms}
          scenes={[{ start_ms: sourceStartMs, end_ms: sourceStartMs + durationMs }]}
          trackWidth={Math.max(12, width)}
        />
      </span>
    );
  }
  const status =
    query.data?.status === 'failed' || query.isError
      ? text.waveformFailed
      : query.data?.status === 'unavailable'
        ? text.waveformUnavailable
        : text.waveformPreparing;
  return <span className={styles.timelineItemWaveformStatus} title={status} />;
}

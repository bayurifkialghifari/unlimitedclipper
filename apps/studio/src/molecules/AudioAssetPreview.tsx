import { useQuery } from '@tanstack/react-query';
import { Button } from '@unlimitedclipper/ui';
import { api } from '../lib/api';
import { useText } from '../lib/i18n';
import { SourceWaveform } from './SourceWaveform';
import styles from '../styles/Studio.module.css';

export function AudioAssetPreview({
  assetId,
  durationMs,
}: {
  assetId: string;
  durationMs: number;
}) {
  const text = useText();
  const query = useQuery({
    queryKey: ['asset-waveform', assetId],
    queryFn: ({ signal }) => api.assetWaveform(assetId, signal),
    refetchInterval: (current) => (current.state.data?.status === 'pending' ? 1500 : false),
    retry: false,
  });

  async function retry() {
    if (query.data?.job_id) {
      await api.retryJob(query.data.job_id);
    }
    await query.refetch();
  }

  return (
    <div className={styles.audioAssetPreview} aria-label={text.audioWaveformPreview}>
      <span>{text.audioWaveformPreview}</span>
      {query.data?.status === 'ready' && query.data.bucket_ms ? (
        <SourceWaveform
          peaks={query.data.peaks}
          bucketMs={query.data.bucket_ms}
          scenes={[{ start_ms: 0, end_ms: durationMs }]}
          trackWidth={280}
        />
      ) : (
        <div role="status" className={styles.audioPreviewState}>
          {query.data?.status === 'failed' || query.isError
            ? (query.data?.error ?? query.error?.message ?? text.waveformFailed)
            : query.data?.status === 'unavailable'
              ? text.waveformUnavailable
              : text.waveformPreparing}
        </div>
      )}
      {(query.data?.status === 'failed' || query.isError) && (
        <Button onClick={() => void retry()}>{text.retry}</Button>
      )}
    </div>
  );
}

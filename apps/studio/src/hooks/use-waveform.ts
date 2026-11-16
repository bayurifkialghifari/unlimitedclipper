import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useWaveform(projectId: string | undefined, hasAudio: boolean) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = Boolean(health.data?.editor_features.includes('source_waveform'));
  const query = useQuery({
    queryKey: ['waveform', projectId],
    queryFn: ({ signal }) => api.waveform(projectId!, signal),
    enabled: Boolean(projectId && hasAudio && supported),
    refetchInterval: (current) => (current.state.data?.status === 'pending' ? 1500 : false),
    retry: false,
  });

  async function retryFailed() {
    const id = query.data?.job_id;
    if (!id) {
      return;
    }
    await api.retryJob(id);
    await query.refetch();
  }

  return {
    data: query.data,
    supported,
    loading: hasAudio && (health.isPending || (supported && query.isPending && query.isFetching)),
    error: query.error,
    retryFailed,
    refetch: query.refetch,
  };
}

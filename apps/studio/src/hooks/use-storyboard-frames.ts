import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { StoryboardFrame } from '../types';

export function useStoryboardFrames(projectId: string | undefined, sourceTimesMs: number[]) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = Boolean(health.data?.editor_features.includes('storyboard_frames'));
  const times = [...new Set(sourceTimesMs)].sort((left, right) => left - right).slice(0, 32);
  const key = times.join(',');
  const query = useQuery({
    queryKey: ['storyboard', projectId, key],
    queryFn: ({ signal }) => api.storyboard(projectId!, times, signal),
    enabled: Boolean(projectId && supported && times.length),
    refetchInterval: (current) =>
      current.state.data?.frames.some((frame) => frame.status === 'pending') ? 1500 : false,
    retry: false,
  });
  const frames = new Map<number, StoryboardFrame>();
  for (const frame of query.data?.frames ?? []) {
    frames.set(frame.source_time_ms, frame);
  }

  async function retryFailed() {
    const ids = new Set(
      query.data?.frames
        .filter((frame) => frame.status === 'failed' && frame.job_id)
        .map((frame) => frame.job_id!) ?? [],
    );
    for (const id of ids) {
      await api.retryJob(id);
    }
    await query.refetch();
  }

  return {
    frames,
    supported,
    loading: supported && query.isPending && query.isFetching,
    error: query.error,
    retryFailed,
    refetch: query.refetch,
  };
}

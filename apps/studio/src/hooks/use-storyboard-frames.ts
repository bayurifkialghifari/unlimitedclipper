import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { StoryboardFrame, StoryboardResponse } from '../types';

export function useStoryboardFrames(projectId: string | undefined, sourceTimesMs: number[]) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = Boolean(health.data?.editor_features.includes('storyboard_frames'));
  const times = [...new Set(sourceTimesMs)].sort((left, right) => left - right);
  const batches: number[][] = [];
  for (let index = 0; index < times.length; index += 32) {
    batches.push(times.slice(index, index + 32));
  }
  const queries = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ['storyboard', projectId, batch.join(',')],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.storyboard(projectId!, batch, signal),
      enabled: Boolean(projectId && supported),
      refetchInterval: (current: { state: { data?: StoryboardResponse } }) =>
        current.state.data?.frames.some((frame) => frame.status === 'pending') ? 1500 : false,
      retry: false,
    })),
  });
  const frames = new Map<number, StoryboardFrame>();
  for (const query of queries) {
    for (const frame of query.data?.frames ?? []) {
      frames.set(frame.source_time_ms, frame);
    }
  }

  async function retryFailed() {
    const ids = new Set(
      queries.flatMap(
        (query) =>
          query.data?.frames
            .filter((frame) => frame.status === 'failed' && frame.job_id)
            .map((frame) => frame.job_id!) ?? [],
      ),
    );
    for (const id of ids) {
      await api.retryJob(id);
    }
    await Promise.all(queries.map((query) => query.refetch()));
  }

  async function refetch() {
    await Promise.all(queries.map((query) => query.refetch()));
  }

  return {
    frames,
    supported,
    loading: supported && queries.some((query) => query.isPending && query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null,
    retryFailed,
    refetch,
  };
}

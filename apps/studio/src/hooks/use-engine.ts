import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import type { Job } from '../types';
import { saveDraft } from '../lib/save';

export function useEngineEvents() {
  const client = useQueryClient();
  useEffect(() => {
    const stream = new EventSource('/api/v1/events');
    const refresh = () => {
      void client.invalidateQueries();
    };
    stream.addEventListener('snapshot', refresh);
    stream.addEventListener('change', (message) => {
      const event = JSON.parse(message.data) as { kind: string; job?: Job };
      void client.invalidateQueries({ queryKey: ['jobs'] });
      if (
        event.kind !== 'job' ||
        event.job?.status === 'completed' ||
        event.job?.status === 'failed'
      ) {
        void client.invalidateQueries({ queryKey: ['projects'] });
        void client.invalidateQueries({ queryKey: ['project'] });
        void client.invalidateQueries({ queryKey: ['storyboard'] });
        void client.invalidateQueries({ queryKey: ['clip'] });
        void client.invalidateQueries({ queryKey: ['models'] });
        void client.invalidateQueries({ queryKey: ['narration-pack'] });
        void client.invalidateQueries({ queryKey: ['card-narration'] });
        void client.invalidateQueries({ queryKey: ['exports'] });
        void client.invalidateQueries({ queryKey: ['clip-rating'] });
        void client.invalidateQueries({ queryKey: ['hook-proposals'] });
        void client.invalidateQueries({ queryKey: ['caption-presets'] });
      }
    });
    return () => stream.close();
  }, [client]);
}

export function useProject() {
  const id = useEditor((state) => state.projectId);
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api.project(id!),
    enabled: Boolean(id),
  });
}

export function useAutosave() {
  const draft = useEditor((state) => state.draft);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const error = useEditor((state) => state.error);
  const client = useQueryClient();
  useEffect(() => {
    if (!draft || !dirty || saving || error) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveDraft()
        .then(() => {
          void client.invalidateQueries({ queryKey: ['project', draft.project_id] });
        })
        .catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, saving, error, client]);
}

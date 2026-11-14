import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import type { SourceSegment } from '../types';

export function useTimelineRemap() {
  const text = useText();
  const pending = useEditor((state) => state.timelinePending);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = Boolean(health.data?.edit_document_versions?.includes(3));

  async function remap(segments: SourceSegment[]) {
    const editor = useEditor.getState();
    const clip = editor.draft;
    if (!clip || editor.timelinePending) {
      return;
    }
    if (!supported) {
      useEditor.setState({ error: text.sceneUpgrade });
      return;
    }
    const snapshot = JSON.stringify(clip.document);
    useEditor.setState({ timelinePending: true, error: null });
    try {
      const mapped = await api.timelinePreview(clip.id, clip.document, segments);
      const current = useEditor.getState();
      if (current.clipId !== clip.id || JSON.stringify(current.draft?.document) !== snapshot) {
        throw new Error(text.proposalConflict);
      }
      current.change((document) => {
        Object.assign(document, mapped);
      }, true);
      current.seekTo(
        Math.min(
          current.playhead,
          segments.reduce((sum, scene) => sum + scene.end_ms - scene.start_ms, 0),
        ),
      );
    } catch (failure) {
      useEditor.setState({ error: (failure as Error).message });
    } finally {
      useEditor.setState({ timelinePending: false });
    }
  }

  return { remap, pending, supported };
}

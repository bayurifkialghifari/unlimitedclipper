import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { outputDuration } from '../lib/timeline';
import type { EditDocument, SourceSegment } from '../types';

export function useTimelineRemap() {
  const text = useText();
  const pending = useEditor((state) => state.timelinePending);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const supported = Boolean(health.data?.edit_document_versions?.includes(3));
  const teaserSupported = Boolean(health.data?.editor_features.includes('teaser_move'));

  async function applyPreview(
    request: (id: string, document: EditDocument) => Promise<EditDocument>,
    seekAt: number,
  ) {
    const editor = useEditor.getState();
    const clip = editor.draft;
    if (!clip || editor.timelinePending) {
      return;
    }
    const snapshot = JSON.stringify(clip.document);
    useEditor.setState({ timelinePending: true, error: null });
    try {
      const mapped = await request(clip.id, clip.document);
      const current = useEditor.getState();
      if (current.clipId !== clip.id || JSON.stringify(current.draft?.document) !== snapshot) {
        throw new Error(text.proposalConflict);
      }
      current.change((document) => {
        Object.assign(document, mapped);
      }, true);
      current.seekTo(Math.min(seekAt, outputDuration(mapped)));
    } catch (failure) {
      useEditor.setState({ error: (failure as Error).message });
    } finally {
      useEditor.setState({ timelinePending: false });
    }
  }

  async function remap(segments: SourceSegment[]) {
    if (!supported) {
      useEditor.setState({ error: text.sceneUpgrade });
      return;
    }
    await applyPreview(
      (id, document) => api.timelinePreview(id, document, segments),
      Math.min(
        useEditor.getState().playhead,
        segments.reduce((sum, scene) => sum + scene.end_ms - scene.start_ms, 0),
      ),
    );
  }

  async function remapTeaser(startMs: number, endMs: number) {
    if (!teaserSupported) {
      useEditor.setState({ error: text.teaserUnavailable });
      return;
    }
    await applyPreview((id, document) => api.teaserPreview(id, document, startMs, endMs), 0);
  }

  return { remap, remapTeaser, pending, supported, teaserSupported };
}

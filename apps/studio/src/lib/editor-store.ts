import { create } from 'zustand';
import type { Clip, EditDocument } from '../types';
import { outputToSource } from './timeline';

type EditorState = {
  projectId: string | null;
  clipId: string | null;
  draft: Clip | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  selectedWords: string[];
  timelinePending: boolean;
  timelineSelection: { kind: 'scene' | 'visual' | 'audio' | 'filter'; id: string } | null;
  playhead: number;
  seekRequest: {
    clipId: string | null;
    positionMs: number;
    outputPositionMs?: number;
  } | null;
  history: Clip[];
  future: Clip[];
  selectProject: (id: string) => void;
  selectClip: (clip: Clip) => void;
  acceptServer: (clip: Clip) => void;
  change: (recipe: (document: EditDocument) => void, preserveTiming?: boolean) => void;
  rename: (name: string) => void;
  acknowledge: (saved: Clip, snapshot: Clip) => void;
  setSaving: (saving: boolean, error?: string | null) => void;
  setPlayhead: (playhead: number) => void;
  seekTo: (positionMs: number, outputPositionMs?: number) => void;
  selectWords: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
};

export const useEditor = create<EditorState>((set, get) => ({
  projectId: localStorage.getItem('uc-project'),
  clipId: null,
  draft: null,
  dirty: false,
  saving: false,
  error: null,
  selectedWords: [],
  timelinePending: false,
  timelineSelection: null,
  playhead: 0,
  seekRequest: null,
  history: [],
  future: [],
  selectProject: (id) => {
    localStorage.setItem('uc-project', id);
    set({
      projectId: id,
      clipId: null,
      seekRequest: null,
      draft: null,
      dirty: false,
      history: [],
      future: [],
      error: null,
    });
  },
  selectClip: (clip) =>
    set({
      clipId: clip.id,
      seekRequest: null,
      draft: structuredClone(clip),
      dirty: false,
      history: [],
      future: [],
      selectedWords: [],
      timelineSelection: null,
      playhead: 0,
      error: null,
    }),
  acceptServer: (clip) => {
    const current = get();
    if (current.clipId === clip.id && !current.dirty && current.draft?.revision !== clip.revision) {
      set({ draft: structuredClone(clip) });
    }
  },
  change: (recipe, preserveTiming = false) => {
    const current = get();
    if (!current.draft) {
      return;
    }
    const draft = structuredClone(current.draft);
    recipe(draft.document);
    if (draft.document.version === 2 && draft.document.segments?.length === 1) {
      draft.document.segments[0] = {
        start_ms: draft.document.start_ms,
        end_ms: draft.document.end_ms,
      };
    }
    for (const word of draft.document.words) {
      const previous = current.draft.document.words.find((previous) => previous.id === word.id);
      const sourceStart = outputToSource(draft.document, word.start_ms);
      const sourceEnd = outputToSource(draft.document, word.end_ms - 1);
      const changed =
        previous &&
        (previous.text !== word.text ||
          outputToSource(current.draft.document, previous.start_ms) !== sourceStart ||
          outputToSource(current.draft.document, previous.end_ms - 1) !== sourceEnd);
      if (!preserveTiming && (changed || (!previous && !word.timing))) {
        if (sourceStart !== null && sourceEnd !== null) {
          word.timing = {
            provenance: 'manual',
            source_start_ms: sourceStart,
            source_end_ms: sourceEnd + 1,
            alignment_confidence: null,
          };
        }
      }
    }
    set({
      draft,
      dirty: true,
      error: null,
      history: [...current.history, current.draft].slice(-80),
      future: [],
    });
  },
  rename: (name) => {
    const current = get();
    if (current.draft) {
      set({
        draft: { ...current.draft, name },
        dirty: true,
        error: null,
        history: [...current.history, current.draft].slice(-80),
        future: [],
      });
    }
  },
  acknowledge: (saved, snapshot) => {
    const current = get();
    if (current.draft?.id !== saved.id) {
      return;
    }
    const unchanged =
      JSON.stringify(current.draft.document) === JSON.stringify(snapshot.document) &&
      current.draft.name === snapshot.name;
    set({
      draft: unchanged ? saved : { ...current.draft, revision: saved.revision },
      dirty: !unchanged,
      saving: false,
      error: null,
    });
  },
  setSaving: (saving, error = null) => set({ saving, error }),
  setPlayhead: (playhead) => set({ playhead }),
  seekTo: (positionMs, outputPositionMs) => {
    set({
      seekRequest: { clipId: get().clipId, positionMs, outputPositionMs },
      playhead: positionMs,
    });
  },
  selectWords: (selectedWords) => set({ selectedWords }),
  undo: () => {
    const current = get();
    const previous = current.history.at(-1);
    if (previous && current.draft) {
      set({
        draft: { ...previous, revision: current.draft.revision },
        dirty: true,
        history: current.history.slice(0, -1),
        future: [...current.future, current.draft],
        error: null,
      });
    }
  },
  redo: () => {
    const current = get();
    const next = current.future.at(-1);
    if (next && current.draft) {
      set({
        draft: { ...next, revision: current.draft.revision },
        dirty: true,
        history: [...current.history, current.draft],
        future: current.future.slice(0, -1),
        error: null,
      });
    }
  },
}));

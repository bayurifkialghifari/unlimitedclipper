import { api } from './api';
import { useEditor } from './editor-store';

let inFlight: Promise<void> | null = null;

export function saveDraft(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  const snapshot = useEditor.getState().draft;
  if (!snapshot || !useEditor.getState().dirty) {
    return Promise.resolve();
  }
  useEditor.getState().setSaving(true);
  inFlight = api
    .saveClip(snapshot)
    .then((saved) => {
      useEditor.getState().acknowledge(saved, snapshot);
    })
    .catch((error: Error) => {
      useEditor.getState().setSaving(false, error.message);
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function flushEditor() {
  if (inFlight) {
    await inFlight;
  }
  while (useEditor.getState().dirty) {
    await saveDraft();
  }
}

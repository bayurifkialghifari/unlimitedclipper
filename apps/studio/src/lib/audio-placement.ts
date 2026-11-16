import type { AudioAsset, AudioLayer } from '../types';
import { useEditor } from './editor-store';
import { outputDuration, sourceSegments } from './timeline';

export const audioDragType = 'application/x-unlimitedclipper-audio';

export function fitAudioFades(layer: AudioLayer) {
  const length = layer.end_ms - layer.start_ms;
  layer.fade_in_ms = Math.min(layer.fade_in_ms ?? 0, length);
  if (layer.fade_out_ms !== undefined && layer.fade_out_ms !== null) {
    layer.fade_out_ms = Math.min(layer.fade_out_ms, length - layer.fade_in_ms);
  }
}

export function placeManagedAudio(
  asset: AudioAsset,
  clipId: string,
  startMs: number,
  gain: number,
  messages: { clipChanged: string; placementError: string },
) {
  const current = useEditor.getState();
  if (current.draft?.id !== clipId) {
    throw new Error(messages.clipChanged);
  }
  const duration = outputDuration(current.draft.document);
  if (startMs >= duration || (current.draft.document.audio_layers?.length ?? 0) >= 16) {
    throw new Error(messages.placementError);
  }
  const endMs = Math.min(duration, startMs + asset.duration_ms);
  const id = crypto.randomUUID();
  current.change((document) => {
    document.version = Math.max(2, document.version);
    document.segments = sourceSegments(document);
    document.audio_layers = [
      ...(document.audio_layers ?? []),
      {
        id,
        enabled: true,
        start_ms: startMs,
        end_ms: endMs,
        asset_id: asset.asset_id,
        source_start_ms: 0,
        gain,
        fade_in_ms: 0,
        fade_out_ms: Math.min(80, endMs - startMs),
        normalize: false,
        ducking: false,
      },
    ];
  });
  useEditor.setState({ timelineSelection: { kind: 'audio', id } });
}

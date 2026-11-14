import type {
  Clip,
  EditDocument,
  Export,
  Health,
  CaptionPreset,
  CaptionStyle,
  ClipRating,
  Job,
  ModelStatus,
  Project,
  ProjectDetail,
  Settings,
  PackStatus,
  SourceSegment,
  AudioAsset,
} from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch('/api/v1' + path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(String(body.error ?? response.statusText), response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  audioAssets: () => request<AudioAsset[]>('/assets/audio'),
  qualityPack: () => request<PackStatus>('/models/quality-pack'),
  autoEdit: (id: string, revision: number, profile: string, remove_silence: boolean) =>
    request<Job>('/clips/' + id + '/auto-edit', {
      method: 'POST',
      body: JSON.stringify({ revision, profile, remove_silence }),
    }),
  previewRender: (id: string, revision: number) =>
    request<Job>('/clips/' + id + '/preview-render', {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),
  timelinePreview: (id: string, document: EditDocument, segments: SourceSegment[]) =>
    request<EditDocument>('/clips/' + id + '/timeline-preview', {
      method: 'POST',
      body: JSON.stringify({ document, segments }),
    }),
  health: () => request<Health>('/health'),
  projects: () => request<Project[]>('/projects'),
  project: (id: string) => request<ProjectDetail>('/projects/' + id),
  jobs: () => request<Job[]>('/jobs'),
  models: () => request<ModelStatus[]>('/models'),
  captionPresets: () => request<CaptionPreset[]>('/caption-presets'),
  saveCaptionPreset: (name: string, style: CaptionStyle) =>
    request<CaptionPreset>('/caption-presets', {
      method: 'POST',
      body: JSON.stringify({ name, style }),
    }),
  deleteCaptionPreset: (id: string) => request('/caption-presets/' + id, { method: 'DELETE' }),
  clipRating: (id: string) => request<ClipRating | null>('/clips/' + id + '/rating'),
  rateClip: (id: string, revision: number) =>
    request<Job>('/clips/' + id + '/rating', {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),
  settings: () => request<Settings>('/settings'),
  exports: () => request<Export[]>('/exports'),
  saveSettings: (settings: Settings) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  youtube: (url: string) =>
    request<Job>('/imports/youtube', { method: 'POST', body: JSON.stringify({ url }) }),
  local: (path: string) =>
    request<Job>('/imports/local', { method: 'POST', body: JSON.stringify({ path }) }),
  createClip: (project: string, name: string, start_ms: number, end_ms: number) =>
    request<Clip>('/projects/' + project + '/clips', {
      method: 'POST',
      body: JSON.stringify({ name, start_ms, end_ms }),
    }),
  saveClip: (clip: Clip) =>
    request<Clip>('/clips/' + clip.id, {
      method: 'PUT',
      body: JSON.stringify({ revision: clip.revision, name: clip.name, document: clip.document }),
    }),
  generate: (
    id: string,
    clip_count: number,
    duration_ms: number,
    language: string,
    focus = '',
    minimum_score = 85,
  ) =>
    request<Job>('/projects/' + id + '/generate', {
      method: 'POST',
      body: JSON.stringify({ clip_count, duration_ms, language, focus, minimum_score }),
    }),
  refineCaptions: (
    id: string,
    revision: number,
    speech_model: string,
    language: string,
    vocabulary: string,
  ) =>
    request<Job>('/clips/' + id + '/captions', {
      method: 'POST',
      body: JSON.stringify({ revision, speech_model, language, vocabulary }),
    }),
  clipAction: (id: string, action: 'export' | 'title' | 'track') =>
    request<Job>('/clips/' + id + '/' + action, { method: 'POST' }),
  batchExport: (id: string) => request<Job>('/projects/' + id + '/export', { method: 'POST' }),
  cancelJob: (id: string) => request<Job>('/jobs/' + id + '/cancel', { method: 'POST' }),
  retryJob: (id: string) => request<Job>('/jobs/' + id + '/retry', { method: 'POST' }),
  downloadModel: (id: string) => request<Job>('/models/' + id + '/download', { method: 'POST' }),
  deleteProject: (id: string) => request('/projects/' + id, { method: 'DELETE' }),
  deleteClip: (id: string) => request('/clips/' + id, { method: 'DELETE' }),
  fonts: () => request<string[]>('/fonts'),
  preview: async (id: string, document: EditDocument, signal?: AbortSignal) => {
    const response = await fetch('/api/v1/clips/' + id + '/preview', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(document),
      signal,
    });
    if (!response.ok) {
      throw new Error('Subtitle preview could not be refreshed.');
    }
    return response.text();
  },
};

export function assetUrl(id: string, download = false) {
  return '/api/v1/assets/' + encodeURIComponent(id) + (download ? '?download=1' : '');
}

export function uploadFile<T>(
  path: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1' + path);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onerror = () => reject(new Error('The local engine disconnected during upload.'));
    xhr.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('The local engine returned an unreadable response.'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        reject(
          new ApiError(String((data as { error?: string }).error ?? 'Upload failed.'), xhr.status),
        );
      }
    };
    const body = new FormData();
    body.append('file', file);
    xhr.send(body);
  });
}

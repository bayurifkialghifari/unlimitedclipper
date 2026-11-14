import type { useText } from './i18n';
import type { Job } from '../types';

type Copy = ReturnType<typeof useText>;

export function jobKind(text: Copy, job: Job) {
  const names: Record<string, string> = {
    import: text.importFile,
    youtube: text.importVideo,
    model: text.modelSetup,
    generate: text.generate,
    title: text.generateTitle,
    track: text.autoCrop,
    captions: text.refineCaptions,
    assess: text.rateClip,
    auto_edit: text.autoEditTitle,
    preview: text.renderPreview,
    component_update: text.updates,
    export: text.exports,
  };
  return names[job.kind] ?? text.jobs;
}

export function jobStatus(text: Copy, job: Job) {
  const names: Record<string, string> = {
    queued: text.waiting,
    running: text.running,
    cancelling: text.stopping,
    cancelled: text.cancelled,
    failed: text.failed,
    completed: text.completed,
  };
  return names[job.status] ?? text.waiting;
}

export function jobMessage(text: Copy, job: Job) {
  const result = job.payload as { qualifying_moments?: number } | null;
  if (job.kind === 'generate' && job.status === 'completed' && result?.qualifying_moments === 0) {
    return text.noQualifyingMoments;
  }
  if (job.status !== 'running') {
    return jobStatus(text, job);
  }
  const phases: Record<string, string> = {
    starting: text.running,
    queued: text.waiting,
    probe: text.phaseProbe,
    proxy: text.phaseProxy,
    import: text.phaseImport,
    download: text.phaseDownload,
    verify: text.phaseVerify,
    audio: text.phaseAudio,
    transcription: text.phaseTranscription,
    selection: text.phaseSelection,
    review: text.phaseReview,
    captions: text.phaseCaptions,
    alignment: text.phaseCaptions,
    rating: text.phaseRating,
    tracking: text.phaseTracking,
    render: text.phaseRender,
  };
  let message = phases[job.stage] ?? text.running;
  if (job.stage === 'selection') {
    const payload = job.payload as {
      processed_windows?: number;
      selection_section?: number;
      selection_sections?: number;
    } | null;
    const section = payload?.selection_section ?? (payload?.processed_windows ?? 0) + 1;
    message += ' · ' + text.section + ' ' + section;
    if (payload?.selection_sections) {
      message += '/' + payload.selection_sections;
    }
  }
  return message;
}

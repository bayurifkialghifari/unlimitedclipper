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
    auto_broll: text.autoBrollTitle,
    broll_import: text.brollImporting,
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
  const result = job.payload as {
    qualifying_moments?: number;
    discovery_report?: Record<string, number>;
  } | null;
  if (job.kind === 'generate' && job.status === 'completed' && result?.discovery_report) {
    const report = result.discovery_report;
    let message = text.discoveryResult
      .replace('{accepted}', String(result.qualifying_moments ?? report.accepted ?? 0))
      .replace('{requested}', String(report.requested ?? 4));
    if ((result.qualifying_moments ?? 0) < (report.requested ?? 4)) {
      message +=
        '. ' +
        text.discoveryShortfall +
        ' ' +
        text.discoveryRejected
          .replace('{weak}', String(report.below_threshold ?? 0))
          .replace(
            '{invalid}',
            String((report.invalid_evidence ?? 0) + (report.invalid_review ?? 0)),
          )
          .replace('{limits}', String((report.duration ?? 0) + (report.context_budget ?? 0)));
    }
    return message;
  }
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
    downloading: text.phaseDownload,
    searching: text.brollSearching,
    suggesting: text.phaseSelection,
    thumbnail: text.brollImporting,
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
  const model = (job.payload as Record<string, unknown> | null)?.[
    job.stage === 'selection' ? 'active_proposal_model' : 'review_model'
  ];
  if (['selection', 'review'].includes(job.stage) && typeof model === 'string') {
    message += ' · ' + model;
  }
  return message;
}

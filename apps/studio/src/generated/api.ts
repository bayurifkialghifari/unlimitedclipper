export interface paths {
  '/api/v1/activity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['editor_activity'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/assets/audio': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list_audio_assets'];
    put?: never;
    post: operations['upload_audio'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/assets/upload': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['upload_image'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/assets/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['serve_asset'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/caption-presets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['caption_presets'];
    put?: never;
    post: operations['save_caption_preset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/caption-presets/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['delete_caption_preset'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_clip'];
    put: operations['update_clip'];
    post?: never;
    delete: operations['delete_clip'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/auto-edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_auto_edit_proposal'];
    put?: never;
    post: operations['auto_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/captions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['caption_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/cards/{kind}/narration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_card_narration_job'];
    put?: never;
    post: operations['card_narration_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['export_clip'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/hook-proposals': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_hook_proposals'];
    put?: never;
    post: operations['hook_proposals_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['preview_subtitles'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/preview-plan': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['preview_plan'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/preview-render': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['preview_render'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/rating': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_clip_rating'];
    put?: never;
    post: operations['rate_clip'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/subtitles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['clip_subtitles'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/timeline-preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['timeline_preview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/title': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['title_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/clips/{id}/track': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['track_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/diagnostics': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['diagnostics'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['events'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/exports': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list_exports'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/fonts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['fonts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/fonts/{name}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['serve_font'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['health'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/imports/local': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['local_source'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/imports/upload': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['upload_source'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/imports/youtube': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['youtube_source'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list_jobs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/jobs/{id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['cancel_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/jobs/{id}/retry': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['retry_job'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list_models'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models/import-pack': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['import_quality_pack'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models/narration-pack': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['narration_pack_status'];
    put?: never;
    post: operations['download_narration_pack'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models/quality-pack': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['quality_pack_status'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models/{id}/download': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['download_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/models/{id}/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['import_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list_projects'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_project'];
    put?: never;
    post?: never;
    delete: operations['delete_project'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{id}/clips': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['create_clip'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{id}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['export_project'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{id}/generate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['generate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{id}/storyboard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['request_storyboard'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['session'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['get_settings'];
    put: operations['put_settings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/storage/cleanup': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['cleanup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/updates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['update_status'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/updates/check': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['check_updates'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/updates/install': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['install_updates'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/updates/restart': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['restart_updates'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/updates/rollback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rollback_updates'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    Activity: {
      client_id: string;
      dirty: boolean;
    };
    AudioAsset: {
      asset_id: string;
      /** Format: int64 */
      duration_ms: number;
      name: string;
    };
    AudioLayer: {
      asset_id?: string | null;
      enabled: boolean;
      /** Format: int64 */
      end_ms: number;
      /** Format: double */
      gain: number;
      id: string;
      /** Format: int64 */
      source_start_ms: number;
      /** Format: int64 */
      start_ms: number;
    };
    AutoEditRequest: {
      auto_motion?: boolean;
      profile: string;
      remove_silence: boolean;
      /** Format: int64 */
      revision: number;
    };
    CameraKeyframe: {
      easing?: components['schemas']['Easing'];
      /** Format: int64 */
      time_ms: number;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
      /** Format: double */
      zoom: number;
    };
    CameraMotionPlan: {
      /** Format: double */
      base_height: number;
      /** Format: double */
      base_width: number;
      curve: components['schemas']['MotionCurve'];
    };
    CaptionPreset: {
      category: string;
      id: string;
      name?: string | null;
      style: components['schemas']['CaptionStyle'];
      user_created: boolean;
    };
    CaptionStyle: {
      animation: string;
      bold?: boolean;
      color: string;
      enabled: boolean;
      font: string;
      highlight_color: string;
      /** Format: double */
      outline: number;
      outline_color: string;
      /** Format: double */
      position_y: number;
      preset: string;
      /** Format: int32 */
      size: number;
      uppercase?: boolean;
      words_per_line: number;
    };
    CardNarration: {
      asset_id: string;
      /** Format: int64 */
      duration_ms: number;
      language: string;
      text: string;
      voice: string;
    };
    CardNarrationRequest: {
      language: string;
      /** Format: int64 */
      revision: number;
    };
    Clip: {
      /** Format: int64 */
      created_at: number;
      document: components['schemas']['EditDocument'];
      explanation: string;
      id: string;
      name: string;
      project_id: string;
      /** Format: int64 */
      revision: number;
      /** Format: int32 */
      score?: number | null;
    };
    ClipRating: {
      clip_id: string;
      /** Format: int64 */
      created_at: number;
      dimensions: components['schemas']['RatingDimension'][];
      model: string;
      /** Format: int64 */
      revision: number;
      /** Format: int32 */
      score: number;
      suggestions: string[];
      summary: string;
    };
    CreateClipRequest: {
      /** Format: int64 */
      end_ms: number;
      name: string;
      /** Format: int64 */
      start_ms: number;
    };
    CropRect: {
      /** Format: double */
      height: number;
      /** Format: double */
      width: number;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
    };
    Easing:
      | {
          /** @enum {string} */
          kind: 'linear';
        }
      | {
          /** @enum {string} */
          kind: 'ease_in';
        }
      | {
          /** @enum {string} */
          kind: 'ease_out';
        }
      | {
          /** @enum {string} */
          kind: 'smooth';
        }
      | {
          /** @enum {string} */
          kind: 'hold';
        }
      | {
          /** Format: double */
          first: number;
          /** @enum {string} */
          kind: 'curve';
          /** Format: double */
          second: number;
        };
    EditDocument: {
      audio_layers?: components['schemas']['AudioLayer'][];
      camera_motion?: components['schemas']['CameraKeyframe'][];
      caption_model?: string | null;
      captions: components['schemas']['CaptionStyle'];
      crop: components['schemas']['CropRect'];
      /** Format: int64 */
      end_ms: number;
      facecam_crop: components['schemas']['CropRect'];
      gameplay_crop: components['schemas']['CropRect'];
      intro_card?: null | components['schemas']['HeadingCard'];
      keyframes: components['schemas']['Keyframe'][];
      layout: components['schemas']['Layout'];
      outro_card?: null | components['schemas']['HeadingCard'];
      /** Format: int32 */
      resolution: number;
      segments?: components['schemas']['SourceSegment'][];
      /** Format: double */
      split_ratio: number;
      /** Format: int64 */
      start_ms: number;
      title: components['schemas']['TitleStyle'];
      /** Format: int32 */
      version: number;
      video_adjustments?: components['schemas']['VideoAdjustments'];
      visual_layers?: components['schemas']['VisualLayer'][];
      watermark: components['schemas']['Watermark'];
      words: components['schemas']['Word'][];
    };
    Export: {
      ass_asset_id: string;
      asset_id: string;
      clip_id: string;
      /** Format: int64 */
      created_at: number;
      id: string;
      name: string;
      project_id: string;
      /** Format: int64 */
      revision: number;
      srt_asset_id: string;
    };
    GenerateRequest: {
      clip_count: number;
      content_profile?: string | null;
      /** Format: int64 */
      duration_ms: number;
      focus?: string;
      language: string;
      /** Format: int32 */
      minimum_score?: number;
    };
    HeadingCard: {
      animation: string;
      background: string;
      color: string;
      /** Format: int64 */
      duration_ms: number;
      font: string;
      narration?: null | components['schemas']['CardNarration'];
      /** Format: double */
      position_y: number;
      /** Format: int32 */
      size: number;
      text: string;
    };
    Health: {
      edit_document_versions: number[];
      editor_features: string[];
      models: components['schemas']['ModelStatus'][];
      native: boolean;
      platform: string;
      tools: {
        [key: string]: boolean;
      };
      version: string;
    };
    HookProposal: {
      explanation: string;
      id: string;
      source_quote: string;
      text: string;
    };
    HookProposalSet: {
      clip_id: string;
      /** Format: int64 */
      created_at: number;
      id: string;
      language: string;
      proposals: components['schemas']['HookProposal'][];
      /** Format: int64 */
      revision: number;
      source_signature?: string | null;
    };
    Job: {
      clip_id?: string | null;
      /** Format: int64 */
      created_at: number;
      error?: string | null;
      id: string;
      kind: string;
      message: string;
      payload: unknown;
      /** Format: double */
      progress: number;
      project_id?: string | null;
      stage: string;
      status: string;
      /** Format: int64 */
      updated_at: number;
    };
    Keyframe: {
      /** Format: int64 */
      time_ms: number;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
    };
    LayerKeyframe: {
      easing?: components['schemas']['Easing'];
      /** Format: double */
      opacity: number;
      /** Format: double */
      scale: number;
      /** Format: int64 */
      time_ms: number;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
    };
    /** @enum {string} */
    Layout: 'portrait' | 'square' | 'landscape' | 'contain' | 'blur' | 'gaming';
    LocalImportRequest: {
      path: string;
    };
    ModelSpec: {
      filename: string;
      id: string;
      kind: string;
      license: string;
      name: string;
      sha256: string;
      /** Format: int64 */
      size: number;
      url: string;
    };
    ModelStatus: components['schemas']['ModelSpec'] & {
      /** Format: int64 */
      downloaded_bytes: number;
      ready: boolean;
    };
    MotionCurve: {
      final_values: number[];
      initial: number[];
      intervals: components['schemas']['MotionInterval'][];
    };
    MotionInterval: {
      coefficients: number[][];
      /** Format: int64 */
      end_ms: number;
      /** Format: int64 */
      start_ms: number;
    };
    NarrationPackStatus: {
      /** Format: int64 */
      downloaded_bytes: number;
      id: string;
      license: string;
      name: string;
      ready: boolean;
      /** Format: int64 */
      size_bytes: number;
      source: string;
    };
    PackStatus: {
      languages: string[];
      ready: boolean;
      /** Format: int64 */
      size_bytes: number;
    };
    PreviewPlan: {
      camera_motion?: null | components['schemas']['CameraMotionPlan'];
      document: components['schemas']['EditDocument'];
      graphics: string;
      layer_motion: {
        [key: string]: components['schemas']['MotionCurve'];
      };
      source_asset_id: string;
    };
    PreviewPlanRequest: {
      document: components['schemas']['EditDocument'];
      /** Format: int64 */
      revision: number;
    };
    Project: {
      asset_id: string;
      /** Format: int64 */
      created_at: number;
      /** Format: int64 */
      duration_ms: number;
      has_audio: boolean;
      /** Format: int32 */
      height: number;
      id: string;
      language?: string | null;
      name: string;
      preview_asset_id?: string | null;
      source_kind: string;
      source_url?: string | null;
      thumbnail_id?: string | null;
      transcript_configuration?: string | null;
      /** Format: int32 */
      width: number;
      words: components['schemas']['Word'][];
    };
    ProjectDetail: {
      clips: components['schemas']['Clip'][];
      project: components['schemas']['Project'];
    };
    RatingDimension: {
      explanation: string;
      key: string;
      quote: string;
      /** Format: int32 */
      score: number;
    };
    RefineCaptionsRequest: {
      language: string;
      /** Format: int64 */
      revision: number;
      speech_model: string;
      vocabulary?: string;
    };
    RevisionRequest: {
      /** Format: int64 */
      revision: number;
    };
    SaveCaptionPreset: {
      name: string;
      style: components['schemas']['CaptionStyle'];
    };
    SessionRequest: {
      token: string;
    };
    Settings: {
      ai_mode?: string;
      auto_update: boolean;
      clip_count: number;
      /** Format: int64 */
      clip_duration_ms: number;
      component_feed: string;
      content_profile?: string;
      language: string;
      /** Format: int32 */
      resolution: number;
      speech_model: string;
      transcription_language: string;
      update_feed: string;
    };
    SourceSegment: {
      /** Format: int64 */
      end_ms: number;
      id?: string | null;
      /** Format: int64 */
      start_ms: number;
    };
    StoryboardFrame: {
      asset_id?: string | null;
      error?: string | null;
      job_id?: string | null;
      /** Format: int64 */
      source_time_ms: number;
      status: components['schemas']['StoryboardFrameStatus'];
    };
    /** @enum {string} */
    StoryboardFrameStatus: 'ready' | 'pending' | 'failed' | 'unavailable';
    StoryboardRequest: {
      source_times_ms: number[];
    };
    StoryboardResponse: {
      frames: components['schemas']['StoryboardFrame'][];
    };
    TimelineRequest: {
      document: components['schemas']['EditDocument'];
      segments: components['schemas']['SourceSegment'][];
    };
    TitleStyle: {
      animation?: string;
      color: string;
      /** Format: int64 */
      duration_ms: number;
      font: string;
      /** Format: double */
      position_y: number;
      preset: string;
      /** Format: int32 */
      size: number;
      /** Format: int64 */
      start_ms?: number;
      text: string;
    };
    TrackRequest: {
      mode?: string | null;
      /** Format: int64 */
      revision?: number | null;
    };
    UpdateClipRequest: {
      document: components['schemas']['EditDocument'];
      name: string;
      /** Format: int64 */
      revision: number;
    };
    UpdateState: {
      directory: string;
      previous_directory?: string | null;
      previous_version?: string | null;
      ready: boolean;
      restart_required?: boolean;
      version: string;
    };
    VideoAdjustments: {
      /**
       * Format: int32
       * @default 0
       */
      brightness: number;
      /**
       * Format: int32
       * @default 0
       */
      contrast: number;
      /**
       * Format: int32
       * @default 0
       */
      saturation: number;
      /**
       * Format: int32
       * @default 0
       */
      warmth: number;
    };
    VisualLayer: {
      asset_id?: string | null;
      color: string;
      crop?: null | components['schemas']['CropRect'];
      enabled: boolean;
      /** Format: int64 */
      end_ms: number;
      id: string;
      kind: string;
      motion?: components['schemas']['LayerKeyframe'][];
      secondary_crop?: null | components['schemas']['CropRect'];
      /** Format: int32 */
      size: number;
      /** Format: int64 */
      source_start_ms?: number;
      /** Format: int64 */
      start_ms: number;
      text: string;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
    };
    Watermark: {
      asset_id?: string | null;
      color: string;
      mode: string;
      /** Format: double */
      opacity: number;
      /** Format: double */
      scale: number;
      text: string;
      /** Format: double */
      x: number;
      /** Format: double */
      y: number;
    };
    Word: {
      color?: string | null;
      /** Format: double */
      confidence?: number | null;
      emphasis?: boolean;
      /** Format: int64 */
      end_ms: number;
      id: string;
      /** Format: int64 */
      start_ms: number;
      text: string;
      timing?: null | components['schemas']['WordTiming'];
    };
    WordTiming: {
      /** Format: double */
      alignment_confidence?: number | null;
      provenance: string;
      /** Format: int64 */
      source_end_ms: number;
      /** Format: int64 */
      source_start_ms: number;
    };
    YoutubeRequest: {
      url: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  editor_activity: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Activity'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  list_audio_assets: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AudioAsset'][];
        };
      };
    };
  };
  upload_audio: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AudioAsset'];
        };
      };
    };
  };
  upload_image: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  serve_asset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  caption_presets: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CaptionPreset'][];
        };
      };
    };
  };
  save_caption_preset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaveCaptionPreset'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CaptionPreset'];
        };
      };
    };
  };
  delete_caption_preset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  get_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Clip'];
        };
      };
    };
  };
  update_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateClipRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Clip'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  delete_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  get_auto_edit_proposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': null | components['schemas']['Job'];
        };
      };
    };
  };
  auto_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AutoEditRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  caption_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RefineCaptionsRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  get_card_narration_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': null | components['schemas']['Job'];
        };
      };
    };
  };
  card_narration_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CardNarrationRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  export_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  get_hook_proposals: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': null | components['schemas']['HookProposalSet'];
        };
      };
    };
  };
  hook_proposals_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RevisionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  preview_subtitles: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EditDocument'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
    };
  };
  preview_plan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PreviewPlanRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PreviewPlan'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  preview_render: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RevisionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  get_clip_rating: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': null | components['schemas']['ClipRating'];
        };
      };
    };
  };
  rate_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RevisionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  clip_subtitles: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
    };
  };
  timeline_preview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TimelineRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EditDocument'];
        };
      };
    };
  };
  title_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  track_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TrackRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  diagnostics: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  events: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  list_exports: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Export'][];
        };
      };
    };
  };
  fonts: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': string[];
        };
      };
    };
  };
  serve_font: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  health: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
    };
  };
  local_source: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LocalImportRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  upload_source: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  youtube_source: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['YoutubeRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  list_jobs: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'][];
        };
      };
    };
  };
  cancel_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  retry_job: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  list_models: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ModelStatus'][];
        };
      };
    };
  };
  import_quality_pack: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  narration_pack_status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NarrationPackStatus'];
        };
      };
    };
  };
  download_narration_pack: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  quality_pack_status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PackStatus'];
        };
      };
    };
  };
  download_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  import_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  list_projects: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Project'][];
        };
      };
    };
  };
  get_project: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectDetail'];
        };
      };
    };
  };
  delete_project: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  create_clip: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateClipRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Clip'];
        };
      };
    };
  };
  export_project: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  generate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GenerateRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  request_storyboard: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['StoryboardRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StoryboardResponse'];
        };
      };
    };
  };
  session: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SessionRequest'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  get_settings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Settings'];
        };
      };
    };
  };
  put_settings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Settings'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Settings'];
        };
      };
    };
  };
  cleanup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  update_status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UpdateState'];
        };
      };
    };
  };
  check_updates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Job'];
        };
      };
    };
  };
  install_updates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UpdateState'];
        };
      };
    };
  };
  restart_updates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  rollback_updates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UpdateState'];
        };
      };
    };
  };
}

use crate::{
    broll, db, error::*, model_manager, models::*, state::AppState, storyboard, subtitles, tools,
    waveform,
};
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event as SseEvent, KeepAlive},
    },
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{collections::HashMap, sync::atomic::Ordering};
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use tower_http::services::ServeFile;
use utoipa::{OpenApi, ToSchema};
use uuid::Uuid;

#[derive(Deserialize, ToSchema)]
pub struct SessionRequest {
    pub token: String,
}

#[derive(Deserialize, ToSchema)]
pub struct YoutubeRequest {
    pub url: String,
}

#[derive(Deserialize, ToSchema)]
pub struct LocalImportRequest {
    pub path: String,
}

#[derive(Deserialize, ToSchema)]
pub struct StockImportRequest {
    pub page_id: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct GenerateRequest {
    pub clip_count: usize,
    pub duration_ms: i64,
    pub language: String,
    #[serde(default)]
    pub focus: String,
    #[serde(default = "default_interest")]
    pub minimum_score: u32,
    #[serde(default)]
    pub content_profile: Option<String>,
}

fn default_interest() -> u32 {
    70
}

#[derive(Default, Deserialize, ToSchema)]
pub struct TrackRequest {
    #[serde(default)]
    pub revision: Option<i64>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct RefineCaptionsRequest {
    pub revision: i64,
    pub speech_model: String,
    pub language: String,
    #[serde(default)]
    pub vocabulary: String,
}

#[derive(Deserialize, ToSchema)]
pub struct RevisionRequest {
    pub revision: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct CardNarrationRequest {
    pub revision: i64,
    pub language: String,
}

#[derive(Deserialize, ToSchema)]
pub struct AutoEditRequest {
    pub revision: i64,
    pub profile: String,
    pub remove_silence: bool,
    #[serde(default)]
    pub auto_motion: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct TimelineRequest {
    pub document: EditDocument,
    pub segments: Vec<SourceSegment>,
}

#[derive(Deserialize, ToSchema)]
pub struct TeaserRequest {
    pub document: EditDocument,
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct PreviewPlanRequest {
    pub revision: i64,
    pub document: EditDocument,
}

#[derive(Serialize, ToSchema)]
pub struct PreviewPlan {
    pub source_asset_id: String,
    pub document: EditDocument,
    pub graphics: String,
    pub camera_motion: Option<crate::motion::CameraMotionPlan>,
    pub layer_motion: std::collections::BTreeMap<String, crate::motion::MotionCurve>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateClipRequest {
    pub name: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateClipRequest {
    pub revision: i64,
    pub name: String,
    pub document: EditDocument,
}

#[derive(Serialize, ToSchema)]
pub struct Health {
    pub editor_features: Vec<String>,
    pub edit_document_versions: Vec<u32>,
    pub version: String,
    pub platform: String,
    pub native: bool,
    pub tools: HashMap<String, bool>,
    pub models: Vec<ModelStatus>,
}

#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        session,
        list_projects,
        get_project,
        request_storyboard,
        request_waveform,
        request_asset_waveform,
        list_broll_assets,
        upload_broll,
        search_broll_stock,
        import_broll_stock,
        get_auto_broll,
        auto_broll_job,
        delete_broll_asset,
        upload_source,
        youtube_source,
        local_source,
        generate,
        create_clip,
        get_clip,
        update_clip,
        export_clip,
        export_project,
        list_jobs,
        cancel_job,
        retry_job,
        list_models,
        narration_pack_status,
        download_narration_pack,
        card_narration_job,
        get_card_narration_job,
        download_model,
        get_settings,
        put_settings,
        list_exports,
        title_job,
        get_hook_proposals,
        hook_proposals_job,
        track_job,
        caption_job,
        caption_presets,
        save_caption_preset,
        delete_caption_preset,
        get_clip_rating,
        rate_clip,
        update_status,
        check_updates,
        install_updates,
        rollback_updates,
        restart_updates,
        editor_activity,
        delete_project,
        delete_clip,
        upload_image,
        upload_audio,
        list_audio_assets,
        import_model,
        clip_subtitles,
        preview_subtitles,
        preview_plan,
        preview_render,
        timeline_preview,
        teaser_preview,
        get_auto_edit_proposal,
        auto_edit,
        quality_pack_status,
        import_quality_pack,
        serve_asset,
        fonts,
        serve_font,
        events,
        diagnostics,
        cleanup
    ),
    components(schemas(
        Project,
        ProjectDetail,
        Clip,
        EditDocument,
        Word,
        WordTiming,
        SourceSegment,
        VisualLayer,
        AudioLayer,
        VideoAdjustments,
        AudioAsset,
        CropRect,
        Keyframe,
        CaptionStyle,
        TitleStyle,
        Watermark,
        Layout,
        Job,
        Export,
        Settings,
        ModelSpec,
        ModelStatus,
        SessionRequest,
        YoutubeRequest,
        LocalImportRequest,
        StockImportRequest,
        GenerateRequest,
        TrackRequest,
        RefineCaptionsRequest,
        RevisionRequest,
        CardNarrationRequest,
        AutoEditRequest,
        TimelineRequest,
        TeaserRequest,
        PreviewPlanRequest,
        PreviewPlan,
        crate::quality_pack::PackStatus,
        crate::narration_pack::NarrationPackStatus,
        CardNarration,
        crate::caption_presets::CaptionPreset,
        crate::caption_presets::SaveCaptionPreset,
        crate::clip_rating::ClipRating,
        crate::clip_rating::RatingDimension,
        crate::hook_proposals::HookProposal,
        crate::hook_proposals::HookProposalSet,
        CreateClipRequest,
        UpdateClipRequest,
        storyboard::StoryboardRequest,
        storyboard::StoryboardResponse,
        storyboard::StoryboardFrame,
        storyboard::StoryboardFrameStatus,
        waveform::WaveformResponse,
        waveform::WaveformStatus,
        broll::BrollAsset,
        broll::StockVideo,
        Health
    ))
)]
pub struct ApiDoc;

#[utoipa::path(get, path = "/api/v1/updates", responses((status = 200, body = crate::updates::UpdateState)))]
async fn update_status(
    State(state): State<AppState>,
) -> ApiResult<Json<crate::updates::UpdateState>> {
    Ok(Json(crate::updates::status(&state).await?))
}

#[utoipa::path(post, path = "/api/v1/updates/check", responses((status = 200, body = Job)))]
async fn check_updates(State(state): State<AppState>) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.kind == "component_update" && ["queued", "running"].contains(&job.status.as_str())
    }) {
        return Err(ApiError::bad_request(
            "A component update check is already running.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked("component_update", None, None, json!({}))
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/updates/install", responses((status = 200, body = crate::updates::UpdateState)))]
async fn install_updates(
    State(state): State<AppState>,
) -> ApiResult<Json<crate::updates::UpdateState>> {
    Ok(Json(crate::updates::activate(&state).await?))
}

#[utoipa::path(post, path = "/api/v1/updates/rollback", responses((status = 200, body = crate::updates::UpdateState)))]
async fn rollback_updates(
    State(state): State<AppState>,
) -> ApiResult<Json<crate::updates::UpdateState>> {
    Ok(Json(crate::updates::rollback(&state).await?))
}

#[utoipa::path(post, path = "/api/v1/updates/restart", responses((status = 200)))]
async fn restart_updates(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    if !state.restart_required.load(Ordering::SeqCst) || !state.idle().await? {
        return Err(ApiError::bad_request(
            "Save edits and finish jobs before restarting for an update.",
        ));
    }
    state.restart.notify_one();
    Ok(Json(json!({"restarting": true})))
}

#[derive(Deserialize, ToSchema)]
struct Activity {
    client_id: String,
    dirty: bool,
}

#[utoipa::path(post, path = "/api/v1/activity", responses((status = 200)))]
async fn editor_activity(
    State(state): State<AppState>,
    Json(activity): Json<Activity>,
) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    Uuid::parse_str(&activity.client_id)
        .map_err(|_| ApiError::bad_request("Invalid editor identity."))?;
    let mut clients = state.activity.lock().await;
    if activity.dirty {
        clients.insert(activity.client_id, now_ms() + 45_000);
    } else {
        clients.remove(&activity.client_id);
    }
    Ok(Json(json!({"ready":true})))
}

pub fn router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/updates", get(update_status))
        .route("/updates/check", post(check_updates))
        .route("/updates/install", post(install_updates))
        .route("/updates/rollback", post(rollback_updates))
        .route("/updates/restart", post(restart_updates))
        .route("/activity", post(editor_activity))
        .route("/projects", get(list_projects))
        .route("/projects/{id}", get(get_project).delete(delete_project))
        .route("/projects/{id}/storyboard", post(request_storyboard))
        .route("/projects/{id}/waveform", post(request_waveform))
        .route("/assets/{id}/waveform", post(request_asset_waveform))
        .route(
            "/projects/{id}/broll-assets",
            get(list_broll_assets).post(upload_broll),
        )
        .route("/projects/{id}/broll-stock", get(search_broll_stock))
        .route(
            "/projects/{id}/broll-stock/import",
            post(import_broll_stock),
        )
        .route(
            "/projects/{id}/broll-assets/{asset_id}",
            axum::routing::delete(delete_broll_asset),
        )
        .route("/projects/{id}/generate", post(generate))
        .route("/projects/{id}/clips", post(create_clip))
        .route("/projects/{id}/export", post(export_project))
        .route("/imports/upload", post(upload_source))
        .route("/imports/youtube", post(youtube_source))
        .route("/imports/local", post(local_source))
        .route("/assets/upload", post(upload_image))
        .route("/assets/audio", get(list_audio_assets).post(upload_audio))
        .route(
            "/clips/{id}",
            get(get_clip).put(update_clip).delete(delete_clip),
        )
        .route("/clips/{id}/export", post(export_clip))
        .route("/clips/{id}/title", post(title_job))
        .route(
            "/clips/{id}/cards/{kind}/narration",
            get(get_card_narration_job).post(card_narration_job),
        )
        .route(
            "/clips/{id}/hook-proposals",
            get(get_hook_proposals).post(hook_proposals_job),
        )
        .route(
            "/clips/{id}/auto-broll",
            get(get_auto_broll).post(auto_broll_job),
        )
        .route("/clips/{id}/track", post(track_job))
        .route("/clips/{id}/captions", post(caption_job))
        .route(
            "/caption-presets",
            get(caption_presets).post(save_caption_preset),
        )
        .route(
            "/caption-presets/{id}",
            axum::routing::delete(delete_caption_preset),
        )
        .route("/clips/{id}/rating", get(get_clip_rating).post(rate_clip))
        .route("/clips/{id}/subtitles", get(clip_subtitles))
        .route("/clips/{id}/preview", post(preview_subtitles))
        .route("/clips/{id}/preview-plan", post(preview_plan))
        .route("/clips/{id}/preview-render", post(preview_render))
        .route("/clips/{id}/timeline-preview", post(timeline_preview))
        .route("/clips/{id}/teaser-preview", post(teaser_preview))
        .route(
            "/clips/{id}/auto-edit",
            get(get_auto_edit_proposal).post(auto_edit),
        )
        .route("/jobs", get(list_jobs))
        .route("/jobs/{id}/cancel", post(cancel_job))
        .route("/jobs/{id}/retry", post(retry_job))
        .route("/models", get(list_models))
        .route(
            "/models/narration-pack",
            get(narration_pack_status).post(download_narration_pack),
        )
        .route("/models/quality-pack", get(quality_pack_status))
        .route("/models/import-pack", post(import_quality_pack))
        .route("/models/{id}/download", post(download_model))
        .route("/models/{id}/import", post(import_model))
        .route("/settings", get(get_settings).put(put_settings))
        .route("/exports", get(list_exports))
        .route("/events", get(events))
        .route("/assets/{id}", get(serve_asset))
        .route("/fonts", get(fonts))
        .route("/fonts/{name}", get(serve_font))
        .route("/diagnostics", get(diagnostics))
        .route("/storage/cleanup", post(cleanup))
        .route_layer(middleware::from_fn_with_state(state.clone(), authenticate));
    Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/session", post(session))
        .route(
            "/api/v1/openapi.json",
            get(|| async { Json(ApiDoc::openapi()) }),
        )
        .nest("/api/v1", protected)
        .layer(DefaultBodyLimit::disable())
        .with_state(state)
}

fn origin_allowed(state: &AppState, origin: &str) -> bool {
    reqwest::Url::parse(origin).ok().is_some_and(|url| {
        let port = url.port_or_known_default();
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && (port == Some(state.port.load(Ordering::SeqCst))
                || state.development && port == Some(5173))
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none()
    })
}

async fn authenticate(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if request
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| !origin_allowed(&state, value))
        || request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|value| value == "cross-site")
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only local studio origins are allowed."})),
        )
            .into_response();
    }
    if state.development {
        return next.run(request).await;
    }
    let cookie = request
        .headers()
        .get("cookie")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let session = cookie
        .split(';')
        .find_map(|value| value.trim().strip_prefix("uc_session="));
    let valid = match session {
        Some(session) => state
            .sessions
            .lock()
            .await
            .get(session)
            .is_some_and(|expiry| *expiry > now_ms()),
        None => false,
    };
    if !valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Open the studio using its local authorization link."})),
        )
            .into_response();
    }
    next.run(request).await
}

#[utoipa::path(get, path = "/api/v1/health", responses((status = 200, body = Health)))]
async fn health(State(state): State<AppState>) -> ApiResult<Json<Health>> {
    let mut tools = HashMap::new();
    for (family, name) in [
        ("ffmpeg", "ffmpeg"),
        ("ffmpeg", "ffprobe"),
        ("yt-dlp", "yt-dlp"),
        ("deno", "deno"),
        ("whisper", "whisper-cli"),
        ("llama", "llama-cli"),
        ("llama", "llama-completion"),
    ] {
        tools.insert(name.into(), crate::tools::available(&state, family, name));
    }
    let mut editor_features = vec![
        "video_adjustments".into(),
        "timed_hooks".into(),
        "preview_plan".into(),
        "heading_cards".into(),
        "card_narration".into(),
        "camera_motion".into(),
        "text_motion".into(),
        "media_motion".into(),
        "hook_proposals".into(),
    ];
    if state.native_tools.is_none() && crate::tools::available(&state, "ffmpeg", "ffmpeg") {
        if crate::tools::available(&state, "ffmpeg", "ffprobe")
            && crate::tools::available(&state, "llama", "llama-completion")
        {
            editor_features.push("auto_broll".into());
        }
        editor_features.push("storyboard_frames".into());
        editor_features.push("source_waveform".into());
        editor_features.push("asset_waveform".into());
        editor_features.push("audio_mixing".into());
        editor_features.push("teaser_move".into());
    }
    Ok(Json(Health {
        editor_features,
        edit_document_versions: vec![1, 2, 3, 4, 5],
        version: env!("CARGO_PKG_VERSION").into(),
        platform: std::env::consts::ARCH.into(),
        native: state.native_tools.is_some(),
        tools,
        models: model_manager::statuses(&state).await?,
    }))
}

#[utoipa::path(post, path = "/api/v1/session", request_body = SessionRequest, responses((status = 200)))]
async fn session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<SessionRequest>,
) -> ApiResult<Response> {
    if headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|origin| !origin_allowed(&state, origin))
    {
        return Err(ApiError {
            status: StatusCode::FORBIDDEN,
            message: "Session origin is not local.".into(),
        });
    }
    if !state.development {
        let mut token = state.bootstrap.lock().await;
        if token.as_deref() != Some(&request.token) {
            return Err(ApiError {
                status: StatusCode::UNAUTHORIZED,
                message: "This authorization link expired. Reopen the studio.".into(),
            });
        }
        *token = None;
    }
    let session = Uuid::new_v4().to_string();
    let mut sessions = state.sessions.lock().await;
    sessions.retain(|_, expiry| *expiry > now_ms());
    sessions.insert(session.clone(), now_ms() + 86_400_000);
    let temporary = state.root.join("sessions.tmp");
    let bytes = serde_json::to_vec(&*sessions).map_err(anyhow::Error::from)?;
    tokio::fs::write(&temporary, bytes).await?;
    tokio::fs::rename(temporary, state.root.join("sessions.json")).await?;
    drop(sessions);
    let mut response = Json(json!({"ready": true})).into_response();
    response.headers_mut().insert(
        "set-cookie",
        HeaderValue::from_str(&format!(
            "uc_session={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400"
        ))
        .map_err(|error| ApiError::bad_request(error.to_string()))?,
    );
    Ok(response)
}

#[utoipa::path(get, path = "/api/v1/projects", responses((status = 200, body = [Project])))]
async fn list_projects(State(state): State<AppState>) -> ApiResult<Json<Vec<Project>>> {
    let mut projects = db::projects(&state.db).await?;
    for project in &mut projects {
        project.words.clear();
    }
    Ok(Json(projects))
}

#[utoipa::path(get, path = "/api/v1/projects/{id}", responses((status = 200, body = ProjectDetail)))]
async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<ProjectDetail>> {
    Ok(Json(ProjectDetail {
        project: db::project(&state.db, &id).await?,
        clips: db::clips(&state.db, &id).await?,
    }))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/storyboard", request_body = storyboard::StoryboardRequest,
    responses((status = 200, body = storyboard::StoryboardResponse)))]
async fn request_storyboard(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<storyboard::StoryboardRequest>,
) -> ApiResult<Json<storyboard::StoryboardResponse>> {
    Ok(Json(
        storyboard::request_frames(&state, &id, request).await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/waveform",
    responses((status = 200, body = waveform::WaveformResponse)))]
async fn request_waveform(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<waveform::WaveformResponse>> {
    Ok(Json(waveform::request_peaks(&state, &id).await?))
}

#[utoipa::path(post, path = "/api/v1/assets/{id}/waveform",
    responses((status = 200, body = waveform::WaveformResponse)))]
async fn request_asset_waveform(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<waveform::WaveformResponse>> {
    Ok(Json(waveform::request_asset_peaks(&state, &id).await?))
}

#[utoipa::path(get, path = "/api/v1/projects/{id}/broll-assets",
    responses((status = 200, body = Vec<broll::BrollAsset>)))]
async fn list_broll_assets(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<broll::BrollAsset>>> {
    Ok(Json(broll::list(&state, &id).await?))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/broll-assets",
    responses((status = 200, body = Job)))]
async fn upload_broll(
    State(state): State<AppState>,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult<Json<Job>> {
    tools::require_native_job(&state, "broll_import")?;
    let _gate = state.operation_gate.lock().await;
    db::project(&state.db, &id).await?;
    Uuid::parse_str(&id).map_err(|_| ApiError::bad_request("Invalid project ID."))?;
    let directory = format!("broll/{id}");
    tokio::fs::create_dir_all(state.root.join(&directory)).await?;
    let (relative, name) = receive_file(
        &state,
        &mut multipart,
        &directory,
        &["mp4", "mov", "mkv", "webm", "avi", "m4v", "ts"],
    )
    .await?;
    Ok(Json(
        state
            .enqueue_locked(
                "broll_import",
                Some(id),
                None,
                json!({"relative_path": relative, "name": name}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/projects/{id}/broll-stock",
    responses((status = 200, body = Vec<broll::StockVideo>)))]
async fn search_broll_stock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> ApiResult<Json<Vec<broll::StockVideo>>> {
    db::project(&state.db, &id).await?;
    Ok(Json(
        broll::search(&state, query.get("q").map_or("", String::as_str)).await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/broll-stock/import",
    request_body = StockImportRequest, responses((status = 200, body = Job)))]
async fn import_broll_stock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<StockImportRequest>,
) -> ApiResult<Json<Job>> {
    tools::require_native_job(&state, "broll_import")?;
    let _gate = state.operation_gate.lock().await;
    db::project(&state.db, &id).await?;
    if request.page_id <= 0 {
        return Err(ApiError::bad_request("Choose a stock video."));
    }
    Ok(Json(
        state
            .enqueue_locked(
                "broll_import",
                Some(id),
                None,
                json!({"page_id": request.page_id}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/auto-broll",
    responses((status = 200, body = Option<Job>)))]
async fn get_auto_broll(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Option<Job>>> {
    let clip = db::clip(&state.db, &id).await?;
    Ok(Json(
        db::latest_auto_broll_job(&state.db, &clip.project_id, &id).await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/auto-broll",
    request_body = RevisionRequest, responses((status = 200, body = Job), (status = 409)))]
async fn auto_broll_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<RevisionRequest>,
) -> ApiResult<Json<Job>> {
    tools::require_native_job(&state, "auto_broll")?;
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    if !crate::auto_broll::has_transcript_window(&clip.document) {
        return Err(ApiError::bad_request(
            "Transcribe this clip before requesting automatic B-roll.",
        ));
    }
    if clip.document.visual_layers.len() >= 64 {
        return Err(ApiError::bad_request(
            "This clip already has 64 visual layers.",
        ));
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    model_manager::model_path(&state, "qwen3-4b").await?;
    Ok(Json(
        state
            .enqueue_locked(
                "auto_broll",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip, "revision": request.revision}),
            )
            .await?,
    ))
}

#[utoipa::path(delete, path = "/api/v1/projects/{id}/broll-assets/{asset_id}",
    responses((status = 200)))]
async fn delete_broll_asset(
    State(state): State<AppState>,
    Path((id, asset_id)): Path<(String, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    db::project(&state.db, &id).await?;
    if db::active_jobs(&state.db)
        .await?
        .iter()
        .any(|job| job.project_id.as_deref() == Some(&id))
    {
        return Err(ApiError::bad_request(
            "Wait for this project's jobs to finish.",
        ));
    }
    if db::clips(&state.db, &id).await?.iter().any(|clip| {
        clip.document
            .visual_layers
            .iter()
            .any(|layer| layer.asset_id.as_deref() == Some(&asset_id))
    }) {
        return Err(ApiError::bad_request(
            "Remove this B-roll from every clip first.",
        ));
    }
    let thumbnails: Option<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT thumbnail_id, preview_asset_id FROM project_media WHERE project_id = ? AND asset_id = ?",
    )
    .bind(&id)
    .bind(&asset_id)
    .fetch_optional(&state.db)
    .await?;
    let (thumbnail, preview_asset_id) = thumbnails.ok_or_else(ApiError::not_found)?;
    sqlx::query("DELETE FROM project_media WHERE project_id = ? AND asset_id = ?")
        .bind(&id)
        .bind(&asset_id)
        .execute(&state.db)
        .await?;
    let mut candidates = vec![asset_id];
    candidates.extend(thumbnail);
    candidates.extend(preview_asset_id);
    db::remove_unused_assets(&state.db, &state.root, candidates).await?;
    state.emit("projects", None);
    Ok(Json(json!({"deleted": true})))
}

async fn receive_file(
    state: &AppState,
    multipart: &mut Multipart,
    directory: &str,
    allowed: &[&str],
) -> ApiResult<(String, String)> {
    let mut field = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::bad_request(error.to_string()))?
        .ok_or_else(|| ApiError::bad_request("Choose a file to upload."))?;
    let name = field.file_name().unwrap_or("upload").to_string();
    let extension = std::path::Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !allowed.contains(&extension.as_str()) {
        return Err(ApiError::bad_request("This file type is not supported."));
    }
    let relative = format!("{directory}/{}.{}", Uuid::new_v4(), extension);
    let temporary = state.root.join(&relative).with_extension("upload");
    let cleanup = UploadGuard(temporary.clone());
    let mut file = tokio::fs::File::create(&temporary).await?;
    let mut size = 0_u64;
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|error| ApiError::bad_request(error.to_string()))?
    {
        size += chunk.len() as u64;
        let maximum = if allowed == ["zip"] {
            2_500_000_000
        } else if directory == "watermarks" {
            32 * 1024 * 1024
        } else if directory.starts_with("broll/") {
            2 * 1024 * 1024 * 1024
        } else {
            2_000_000_000_000
        };
        if size > maximum {
            return Err(ApiError::bad_request(
                "Uploaded file exceeds the supported size.",
            ));
        }
        file.write_all(&chunk).await?;
    }
    file.sync_all().await?;
    drop(file);
    if size == 0 {
        return Err(ApiError::bad_request("Uploaded file is empty."));
    }
    tokio::fs::rename(&temporary, state.root.join(&relative)).await?;
    drop(cleanup);
    Ok((relative, name))
}

struct UploadGuard(std::path::PathBuf);

impl Drop for UploadGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[utoipa::path(post, path = "/api/v1/imports/upload", responses((status = 200, body = Job)))]
async fn upload_source(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let (relative, name) = receive_file(
        &state,
        &mut multipart,
        "sources",
        &["mp4", "mov", "mkv", "webm", "avi", "m4v", "ts"],
    )
    .await?;
    let id = Uuid::new_v4().to_string();
    Ok(Json(
        state
            .enqueue_locked(
                "import",
                None,
                None,
                json!({"relative_path": relative, "name": name, "project_id": id}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/imports/youtube", request_body = YoutubeRequest, responses((status = 200, body = Job)))]
async fn youtube_source(
    State(state): State<AppState>,
    Json(request): Json<YoutubeRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let url = reqwest::Url::parse(&request.url)
        .map_err(|_| ApiError::bad_request("Paste a valid YouTube URL."))?;
    if !matches!(
        url.host_str(),
        Some("youtube.com") | Some("www.youtube.com") | Some("m.youtube.com") | Some("youtu.be")
    ) || !matches!(url.scheme(), "http" | "https")
    {
        return Err(ApiError::bad_request(
            "This release imports YouTube videos and local files.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked(
                "youtube",
                None,
                None,
                json!({"url": request.url, "project_id": Uuid::new_v4().to_string()}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/imports/local", request_body = LocalImportRequest, responses((status = 200, body = Job)))]
async fn local_source(
    State(state): State<AppState>,
    Json(request): Json<LocalImportRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let path = tokio::fs::canonicalize(&request.path).await?;
    let metadata = tokio::fs::metadata(&path).await?;
    if !metadata.is_file() {
        return Err(ApiError::bad_request("Choose a video file."));
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Imported video")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp4")
        .to_lowercase();
    if !["mp4", "mov", "mkv", "webm", "avi", "m4v", "ts"].contains(&extension.as_str()) {
        return Err(ApiError::bad_request("Choose a supported video file."));
    }
    let relative = format!("sources/{}.{}", Uuid::new_v4(), extension);
    tokio::fs::copy(path, state.root.join(&relative)).await?;
    Ok(Json(state.enqueue_locked("import", None, None, json!({"relative_path": relative, "name": name, "project_id": Uuid::new_v4().to_string()})).await?))
}

#[utoipa::path(post, path = "/api/v1/assets/upload", responses((status = 200)))]
async fn upload_image(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Json<serde_json::Value>> {
    let (relative, name) = receive_file(
        &state,
        &mut multipart,
        "watermarks",
        &["png", "jpg", "jpeg", "webp"],
    )
    .await?;
    let path = state.root.join(&relative);
    let validation = tokio::task::spawn_blocking(move || {
        let reader = image::ImageReader::open(&path)?.with_guessed_format()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        let mut reader = reader;
        reader.limits(limits);
        let image = reader.decode()?;
        Ok::<_, anyhow::Error>((image.width(), image.height()))
    })
    .await
    .map_err(|error| ApiError::bad_request(error.to_string()))?;
    let (width, height) = match validation {
        Ok(dimensions) => dimensions,
        Err(error) => {
            let _ = tokio::fs::remove_file(state.root.join(relative)).await;
            return Err(ApiError::bad_request(format!(
                "Invalid watermark image: {error}"
            )));
        }
    };
    let id = db::register_asset(&state.db, &relative, &name, "image").await?;
    Ok(Json(json!({"asset_id": id,"width":width,"height":height})))
}

#[utoipa::path(get, path = "/api/v1/assets/audio", responses((status = 200, body = Vec<AudioAsset>)))]
async fn list_audio_assets(State(state): State<AppState>) -> ApiResult<Json<Vec<AudioAsset>>> {
    use sqlx::Row;
    let rows = sqlx::query("SELECT id, name, duration_ms FROM assets WHERE kind = 'audio' AND duration_ms IS NOT NULL ORDER BY created_at DESC")
        .fetch_all(&state.db).await?;
    Ok(Json(
        rows.iter()
            .map(|row| AudioAsset {
                asset_id: row.get("id"),
                name: row.get("name"),
                duration_ms: row.get("duration_ms"),
            })
            .collect(),
    ))
}

#[utoipa::path(post, path = "/api/v1/assets/audio", responses((status = 200, body = AudioAsset)))]
async fn upload_audio(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Json<AudioAsset>> {
    let (relative, name) = receive_file(
        &state,
        &mut multipart,
        "audio",
        &["wav", "mp3", "m4a", "aac", "ogg", "flac", "opus"],
    )
    .await?;
    let result = async {
        let _gate = state.operation_gate.lock().await;
        if !db::active_jobs(&state.db).await?.is_empty() {
            return Err(ApiError::bad_request(
                "Wait for processing to finish before importing audio.",
            ));
        }
        let duration_ms = crate::tools::probe_audio(
            &state,
            &state.root.join(&relative),
            &tokio_util::sync::CancellationToken::new(),
        )
        .await?;
        let asset_id = db::register_asset(&state.db, &relative, &name, "audio").await?;
        sqlx::query("UPDATE assets SET duration_ms = ? WHERE id = ?")
            .bind(duration_ms)
            .bind(&asset_id)
            .execute(&state.db)
            .await?;
        Ok::<_, ApiError>(AudioAsset {
            asset_id,
            name,
            duration_ms,
        })
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(state.root.join(&relative)).await;
    }
    Ok(Json(result?))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/generate", request_body = GenerateRequest, responses((status = 200, body = Job)))]
async fn generate(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<GenerateRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    db::project(&state.db, &id).await?;
    let mut settings = db::settings(&state.db).await?;
    let profile = request
        .content_profile
        .clone()
        .unwrap_or_else(|| settings.content_profile.clone());
    if request.clip_count == 0
        || request.clip_count > 1000
        || request.duration_ms < 0
        || request.duration_ms > 3_600_000
        || request.minimum_score > 100
        || request.focus.chars().count() > 400
        || !CONTENT_PROFILES.contains(&profile.as_str())
    {
        return Err(ApiError::bad_request(
            "Choose a valid clip count and duration.",
        ));
    }
    if request.language.len() > 12
        || !request
            .language
            .bytes()
            .all(|byte| byte.is_ascii_alphabetic() || byte == b'-')
    {
        return Err(ApiError::bad_request("Choose a transcription language."));
    }
    if db::active_jobs(&state.db)
        .await?
        .iter()
        .any(|job| job.project_id.as_deref() == Some(&id) && job.kind == "generate")
    {
        return Err(ApiError::bad_request(
            "This project already has a generation job.",
        ));
    }
    settings.content_profile = profile.clone();
    db::save_settings(&state.db, &settings).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "generate",
                Some(id),
                None,
                json!({
                    "clip_count": request.clip_count,
                    "duration_ms": request.duration_ms,
                    "language": request.language,
                    "focus": request.focus,
                    "minimum_score": request.minimum_score,
                    "content_profile": profile,
                    "ai_mode": settings.ai_mode,
                    "speech_model": settings.speech_model,
                    "resolution": settings.resolution,
                    "selection_version": if state.native_tools.is_some() { 2 } else { 3 }
                }),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/clips", request_body = CreateClipRequest, responses((status = 200, body = Clip)))]
async fn create_clip(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<CreateClipRequest>,
) -> ApiResult<Json<Clip>> {
    let _gate = state.operation_gate.lock().await;
    let project = db::project(&state.db, &id).await?;
    let mut document = EditDocument::new(&project, request.start_ms, request.end_ms);
    document.resolution = db::settings(&state.db).await?.resolution;
    document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    let clip = Clip {
        id: Uuid::new_v4().to_string(),
        project_id: id,
        name: request.name.trim().chars().take(150).collect(),
        explanation: "Manually selected moment.".into(),
        score: None,
        revision: 1,
        document,
        created_at: now_ms(),
    };
    db::insert_clip(&state.db, &clip).await?;
    state.emit("projects", None);
    Ok(Json(clip))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}", responses((status = 200, body = Clip)))]
async fn get_clip(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Clip>> {
    Ok(Json(db::clip(&state.db, &id).await?))
}

#[utoipa::path(put, path = "/api/v1/clips/{id}", request_body = UpdateClipRequest, responses((status = 200, body = Clip), (status = 409)))]
async fn update_clip(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<UpdateClipRequest>,
) -> ApiResult<Json<Clip>> {
    let _gate = state.operation_gate.lock().await;
    let mut clip = db::clip(&state.db, &id).await?;
    let project = db::project(&state.db, &clip.project_id).await?;
    request
        .document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    validate_card_narration_assets(&state, &request.document).await?;
    if request.name.trim().is_empty() || request.name.chars().count() > 150 {
        return Err(ApiError::bad_request(
            "Clip names must contain 1 to 150 characters.",
        ));
    }
    clip.name = request.name;
    clip.document = request.document;
    clip.revision = request.revision + 1;
    db::update_clip(&state.db, &clip, request.revision).await?;
    state.emit("projects", None);
    Ok(Json(clip))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/export", responses((status = 200, body = Job)))]
async fn export_clip(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "export",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshots": [clip]}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/projects/{id}/export", responses((status = 200, body = Job)))]
async fn export_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clips = db::clips(&state.db, &id).await?;
    if clips.is_empty() {
        return Err(ApiError::bad_request(
            "Create or generate a clip before exporting.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked("export", Some(id), None, json!({"snapshots": clips}))
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/rating", responses((status = 200, body = Option<crate::clip_rating::ClipRating>)))]
async fn get_clip_rating(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Option<crate::clip_rating::ClipRating>>> {
    db::clip(&state.db, &id).await?;
    Ok(Json(crate::clip_rating::get(&state.db, &id).await?))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/rating", request_body = RevisionRequest, responses((status = 200, body = Job)))]
async fn rate_clip(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<RevisionRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    crate::clip_rating::transcript(&clip)
        .map_err(|error| ApiError::bad_request(error.to_string()))?;
    model_manager::model_path(&state, "qwen3-4b").await?;
    if db::active_jobs(&state.db)
        .await?
        .iter()
        .any(|job| job.kind == "assess" && job.clip_id.as_deref() == Some(&id))
    {
        return Err(ApiError::bad_request("This clip already has a rating job."));
    }
    let language = db::settings(&state.db).await?.language;
    Ok(Json(
        state
            .enqueue_locked(
                "assess",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip, "language": language, "revision": request.revision}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/title", responses((status = 200, body = Job)))]
async fn title_job(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    ensure_no_clip_edit_job(&state, &id).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "title",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"revision": clip.revision}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/hook-proposals", responses((status = 200, body = Option<crate::hook_proposals::HookProposalSet>)))]
async fn get_hook_proposals(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Option<crate::hook_proposals::HookProposalSet>>> {
    db::clip(&state.db, &id).await?;
    Ok(Json(crate::hook_proposals::latest(&state.db, &id).await?))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/hook-proposals", request_body = RevisionRequest, responses((status = 200, body = Job)))]
async fn hook_proposals_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<RevisionRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    if !clip
        .document
        .words
        .iter()
        .any(|word| !word.text.trim().is_empty())
    {
        return Err(ApiError::bad_request(
            "Transcribe this clip before requesting hook proposals.",
        ));
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    let project = db::project(&state.db, &clip.project_id).await?;
    let language = crate::pipeline::output_language(&project);
    Ok(Json(
        state
            .enqueue_locked(
                "hook_proposals",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip, "revision": request.revision, "language": language}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/track", request_body = TrackRequest, responses((status = 200, body = Job)))]
async fn track_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: axum::body::Bytes,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    let request: TrackRequest = if body.is_empty() {
        TrackRequest::default()
    } else {
        serde_json::from_slice(&body)
            .map_err(|_| ApiError::bad_request("Choose a valid tracking mode."))?
    };
    let mode = request.mode.as_deref().unwrap_or("follow");
    if !["follow", "split", "facecam"].contains(&mode)
        || request
            .revision
            .is_some_and(|revision| revision != clip.revision)
        || (mode == "facecam" && clip.document.layout != Layout::Gaming)
    {
        return Err(ApiError::bad_request(
            "Save the current clip and choose a supported framing mode.",
        ));
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "track",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"revision": clip.revision, "mode": mode, "frozen_clip": clip}),
            )
            .await?,
    ))
}

async fn ensure_no_clip_edit_job(state: &AppState, clip_id: &str) -> ApiResult<()> {
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.clip_id.as_deref() == Some(clip_id)
            && [
                "title",
                "hook_proposals",
                "track",
                "captions",
                "auto_edit",
                "auto_broll",
                "card_narration",
            ]
            .contains(&job.kind.as_str())
    }) {
        return Err(ApiError::bad_request(
            "This clip already has an editing job. Wait for it to finish.",
        ));
    }
    Ok(())
}

#[utoipa::path(get, path = "/api/v1/caption-presets", responses((status = 200, body = [crate::caption_presets::CaptionPreset])))]
async fn caption_presets(
    State(state): State<AppState>,
) -> ApiResult<Json<Vec<crate::caption_presets::CaptionPreset>>> {
    Ok(Json(crate::caption_presets::list(&state.db).await?))
}

#[utoipa::path(post, path = "/api/v1/caption-presets", request_body = crate::caption_presets::SaveCaptionPreset, responses((status = 200, body = crate::caption_presets::CaptionPreset)))]
async fn save_caption_preset(
    State(state): State<AppState>,
    Json(request): Json<crate::caption_presets::SaveCaptionPreset>,
) -> ApiResult<Json<crate::caption_presets::CaptionPreset>> {
    let _gate = state.operation_gate.lock().await;
    let preset = crate::caption_presets::save(&state.db, request).await?;
    state.emit("caption-presets", None);
    Ok(Json(preset))
}

#[utoipa::path(delete, path = "/api/v1/caption-presets/{id}", responses((status = 200)))]
async fn delete_caption_preset(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    crate::caption_presets::remove(&state.db, &id).await?;
    state.emit("caption-presets", None);
    Ok(Json(json!({"deleted": true})))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/captions", request_body = RefineCaptionsRequest, responses((status = 200, body = Job), (status = 409)))]
async fn caption_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<RefineCaptionsRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    if !["whisper-small", "whisper-medium"].contains(&request.speech_model.as_str())
        || request.vocabulary.chars().count() > 400
        || request.language.is_empty()
        || request.language.len() > 12
        || !request
            .language
            .bytes()
            .all(|byte| byte.is_ascii_alphabetic() || byte == b'-')
    {
        return Err(ApiError::bad_request(
            "Choose a speech model, language, and vocabulary of at most 400 characters.",
        ));
    }
    model_manager::model_path(&state, &request.speech_model).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "captions",
                Some(clip.project_id.clone()),
                Some(id),
                json!({
                    "revision": request.revision,
                    "speech_model": request.speech_model,
                    "language": request.language,
                    "vocabulary": request.vocabulary
                }),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/jobs", responses((status = 200, body = [Job])))]
async fn list_jobs(State(state): State<AppState>) -> ApiResult<Json<Vec<Job>>> {
    let mut jobs = db::jobs(&state.db).await?;
    for active in db::active_jobs(&state.db).await? {
        if !jobs.iter().any(|job| job.id == active.id) {
            jobs.push(active);
        }
    }
    jobs.sort_by_key(|job| std::cmp::Reverse(job.created_at));
    Ok(Json(jobs))
}

#[utoipa::path(post, path = "/api/v1/jobs/{id}/cancel", responses((status = 200, body = Job)))]
async fn cancel_job(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let mut job = db::job(&state.db, &id).await?;
    if let Some(token) = state.cancellations.lock().await.get(&id) {
        token.cancel();
        job.status = "cancelling".into();
    } else if job.status == "queued" {
        job.status = "cancelled".into();
    }
    job.updated_at = now_ms();
    db::save_job(&state.db, &job).await?;
    state.emit("job", Some(job.clone()));
    Ok(Json(job))
}

#[utoipa::path(post, path = "/api/v1/jobs/{id}/retry", responses((status = 200, body = Job)))]
async fn retry_job(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let mut job = db::job(&state.db, &id).await?;
    crate::tools::require_native_job(&state, &job.kind)?;
    if !["failed", "cancelled"].contains(&job.status.as_str())
        || state.cancellations.lock().await.contains_key(&id)
    {
        return Err(ApiError::bad_request(
            "Wait until this job stops before retrying.",
        ));
    }
    if state.restart_required.load(Ordering::SeqCst) {
        return Err(ApiError::bad_request(
            "Restart to finish the toolchain update before retrying.",
        ));
    }
    if let Some(project_id) = &job.project_id {
        db::project(&state.db, project_id).await?;
    }
    if [
        "title",
        "track",
        "captions",
        "hook_proposals",
        "auto_broll",
        "card_narration",
    ]
    .contains(&job.kind.as_str())
    {
        let clip_id = job.clip_id.as_deref().ok_or_else(ApiError::not_found)?;
        ensure_no_clip_edit_job(&state, clip_id).await?;
        let clip = db::clip(&state.db, clip_id).await?;
        if ["hook_proposals", "card_narration", "auto_broll"].contains(&job.kind.as_str()) {
            if clip.revision != job.payload["revision"].as_i64().unwrap_or(-1) {
                return Err(ApiError::bad_request(if job.kind == "auto_broll" {
                    "This clip changed. Find B-roll again for the current edit."
                } else {
                    "This clip changed. Request new hook proposals for the current edit."
                }));
            }
        } else if job.kind == "track" && job.payload["frozen_clip"].is_object() {
            if clip.revision != job.payload["revision"].as_i64().unwrap_or(-1)
                && job.payload["tracking_committed_revision"].as_i64() != Some(clip.revision)
            {
                return Err(ApiError::bad_request(
                    "This clip changed. Start a new tracking job for the current edit.",
                ));
            }
        } else {
            job.payload["revision"] = json!(clip.revision);
        }
    }
    job.status = "queued".into();
    job.error = None;
    job.updated_at = now_ms();
    db::save_job(&state.db, &job).await?;
    state.notify.notify_one();
    state.emit("job", Some(job.clone()));
    Ok(Json(job))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/cards/{kind}/narration",
    responses((status = 200, body = Option<Job>)))]
async fn get_card_narration_job(
    State(state): State<AppState>,
    Path((id, kind)): Path<(String, String)>,
) -> ApiResult<Json<Option<Job>>> {
    if !["intro", "outro"].contains(&kind.as_str()) {
        return Err(ApiError::bad_request("Choose the opening or closing card."));
    }
    let clip = db::clip(&state.db, &id).await?;
    Ok(Json(
        db::latest_card_narration_job(&state.db, &clip.project_id, &id, &kind).await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/cards/{kind}/narration",
    request_body = CardNarrationRequest, responses((status = 200, body = Job), (status = 409)))]
async fn card_narration_job(
    State(state): State<AppState>,
    Path((id, kind)): Path<(String, String)>,
    Json(request): Json<CardNarrationRequest>,
) -> ApiResult<Json<Job>> {
    crate::tools::require_native_job(&state, "card_narration")?;
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    let card = match kind.as_str() {
        "intro" => clip.document.intro_card.as_ref(),
        "outro" => clip.document.outro_card.as_ref(),
        _ => return Err(ApiError::bad_request("Choose the opening or closing card.")),
    }
    .ok_or_else(|| ApiError::bad_request("Add and save the card before generating narration."))?;
    if card.text.chars().count() > 280 || !["id", "en"].contains(&request.language.as_str()) {
        return Err(ApiError::bad_request(
            "Narration needs 1 to 280 characters and Indonesian or English.",
        ));
    }
    if !crate::narration_pack::status(&state).await.ready {
        return Err(ApiError::bad_request(
            "Install the narration pack in Settings first.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked(
                "card_narration",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip, "revision": request.revision,
                    "card_kind": kind, "language": request.language}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/models", responses((status = 200, body = [ModelStatus])))]
async fn list_models(State(state): State<AppState>) -> ApiResult<Json<Vec<ModelStatus>>> {
    Ok(Json(model_manager::statuses(&state).await?))
}

#[utoipa::path(get, path = "/api/v1/models/narration-pack",
    responses((status = 200, body = crate::narration_pack::NarrationPackStatus)))]
async fn narration_pack_status(
    State(state): State<AppState>,
) -> Json<crate::narration_pack::NarrationPackStatus> {
    Json(crate::narration_pack::status(&state).await)
}

#[utoipa::path(post, path = "/api/v1/models/narration-pack",
    responses((status = 200, body = Job)))]
async fn download_narration_pack(State(state): State<AppState>) -> ApiResult<Json<Job>> {
    state.require_writable_models()?;
    crate::tools::require_native_job(&state, "narration_pack")?;
    let _gate = state.operation_gate.lock().await;
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.kind == "narration_pack" && ["queued", "running"].contains(&job.status.as_str())
    }) {
        return Err(ApiError::bad_request(
            "The narration pack is already downloading.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked(
                "narration_pack",
                None,
                None,
                json!({"revision": crate::narration_pack::revision()}),
            )
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/models/{id}/download", responses((status = 200, body = Job)))]
async fn download_model(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Job>> {
    state.require_writable_models()?;
    let _gate = state.operation_gate.lock().await;
    if !model_specs().iter().any(|spec| spec.id == id) {
        return Err(ApiError::not_found());
    }
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.kind == "model"
            && job.payload["model_id"] == id
            && ["queued", "running"].contains(&job.status.as_str())
    }) {
        return Err(ApiError::bad_request("This model is already downloading."));
    }
    Ok(Json(
        state
            .enqueue_locked("model", None, None, json!({"model_id": id}))
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/models/{id}/import", responses((status = 200)))]
async fn import_model(
    State(state): State<AppState>,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult<Json<serde_json::Value>> {
    state.require_writable_models()?;
    crate::tools::require_native_job(&state, "model")?;
    let _gate = state.operation_gate.lock().await;
    if !db::active_jobs(&state.db).await?.is_empty() {
        return Err(ApiError::bad_request(
            "Finish processing before replacing a local model.",
        ));
    }
    let spec = model_specs()
        .into_iter()
        .find(|spec| spec.id == id)
        .ok_or_else(ApiError::not_found)?;
    let (relative, _) = receive_file(&state, &mut multipart, "temporary", &["bin", "gguf"]).await?;
    let path = state.root.join(relative);
    model_manager::verify(&path, &spec, &tokio_util::sync::CancellationToken::new()).await?;
    tokio::fs::create_dir_all(state.models_root()).await?;
    let final_path = state.models_root().join(&spec.filename);
    if final_path.exists() {
        tokio::fs::remove_file(&final_path).await?;
    }
    tokio::fs::rename(path, &final_path).await?;
    model_manager::mark_verified(&final_path, &spec).await?;
    Ok(Json(json!({"ready": true})))
}

#[utoipa::path(get, path = "/api/v1/settings", responses((status = 200, body = Settings)))]
async fn get_settings(State(state): State<AppState>) -> ApiResult<Json<Settings>> {
    Ok(Json(db::settings(&state.db).await?))
}

#[utoipa::path(put, path = "/api/v1/settings", request_body = Settings, responses((status = 200, body = Settings)))]
async fn put_settings(
    State(state): State<AppState>,
    Json(settings): Json<Settings>,
) -> ApiResult<Json<Settings>> {
    let _gate = state.operation_gate.lock().await;
    if !["id", "en"].contains(&settings.language.as_str())
        || !["whisper-small", "whisper-medium"].contains(&settings.speech_model.as_str())
        || !["economy", "standard"].contains(&settings.ai_mode.as_str())
        || !CONTENT_PROFILES.contains(&settings.content_profile.as_str())
        || ![720, 1080, 1440, 2160].contains(&settings.resolution)
        || settings.clip_count == 0
        || settings.clip_count > 1000
        || settings.clip_duration_ms < 0
        || settings.clip_duration_ms > 3_600_000
    {
        return Err(ApiError::bad_request(
            "Some preferences are outside the supported range.",
        ));
    }
    for feed in [&settings.update_feed, &settings.component_feed] {
        if !feed.is_empty() {
            let url = reqwest::Url::parse(feed)
                .map_err(|_| ApiError::bad_request("Update feeds must be valid HTTPS URLs."))?;
            if url.scheme() != "https"
                && !(state.development
                    && url.scheme() == "http"
                    && url.host_str() == Some("127.0.0.1"))
            {
                return Err(ApiError::bad_request("Production updates require HTTPS."));
            }
        }
    }
    db::save_settings(&state.db, &settings).await?;
    Ok(Json(settings))
}

#[utoipa::path(get, path = "/api/v1/exports", responses((status = 200, body = [Export])))]
async fn list_exports(State(state): State<AppState>) -> ApiResult<Json<Vec<Export>>> {
    Ok(Json(db::exports(&state.db).await?))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/subtitles", responses((status = 200, body = String)))]
async fn clip_subtitles(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let clip = db::clip(&state.db, &id).await?;
    if query.get("format").map(String::as_str) == Some("vtt") {
        return Ok((
            [("content-type", "text/vtt; charset=utf-8")],
            subtitles::vtt_timeline(
                &clip.document,
                query.get("timeline").is_some_and(|value| value == "output"),
            ),
        )
            .into_response());
    }
    let content = if query.get("format").map(String::as_str) == Some("srt") {
        subtitles::srt(&clip.document)
    } else {
        subtitles::ass(&clip.document)
    };
    Ok(([("content-type", "text/plain; charset=utf-8")], content).into_response())
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/preview", responses((status = 200, body = String)))]
async fn preview_subtitles(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(document): Json<EditDocument>,
) -> ApiResult<Response> {
    let clip = db::clip(&state.db, &id).await?;
    let project = db::project(&state.db, &clip.project_id).await?;
    document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    Ok((
        [("content-type", "text/plain; charset=utf-8")],
        subtitles::ass(&document),
    )
        .into_response())
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/preview-plan", request_body = PreviewPlanRequest,
    responses((status = 200, body = PreviewPlan), (status = 409)))]
async fn preview_plan(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<PreviewPlanRequest>,
) -> ApiResult<Json<PreviewPlan>> {
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    let project = db::project(&state.db, &clip.project_id).await?;
    request
        .document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    validate_card_narration_assets(&state, &request.document).await?;
    for layer in &request.document.visual_layers {
        if let Some(asset) = &layer.asset_id {
            let (_, _, kind) = db::asset(&state.db, &state.root, asset).await?;
            if kind != "video" {
                return Err(ApiError::bad_request(
                    "A video layer requires a managed video asset.",
                ));
            }
        }
    }
    for layer in &request.document.audio_layers {
        if let Some(asset) = &layer.asset_id {
            let (_, _, kind) = db::asset(&state.db, &state.root, asset).await?;
            if !["audio", "video"].contains(&kind.as_str()) {
                return Err(ApiError::bad_request(
                    "An audio layer requires a managed audio or video asset.",
                ));
            }
        }
    }
    if let Some(asset) = &request.document.watermark.asset_id {
        let (_, _, kind) = db::asset(&state.db, &state.root, asset).await?;
        if kind != "image" {
            return Err(ApiError::bad_request(
                "A watermark requires a managed image asset.",
            ));
        }
    }
    let graphics = subtitles::ass(&request.document);
    let camera_motion = (!request.document.camera_motion.is_empty())
        .then(|| crate::motion::camera_plan(&request.document, project.width, project.height));
    let layer_motion = request
        .document
        .visual_layers
        .iter()
        .filter(|layer| !layer.motion.is_empty())
        .map(|layer| (layer.id.clone(), crate::motion::layer_curve(layer)))
        .collect();
    Ok(Json(PreviewPlan {
        source_asset_id: project.preview_asset_id.unwrap_or(project.asset_id),
        document: request.document,
        graphics,
        camera_motion,
        layer_motion,
    }))
}

async fn validate_card_narration_assets(
    state: &AppState,
    document: &EditDocument,
) -> ApiResult<()> {
    for card in [&document.intro_card, &document.outro_card]
        .into_iter()
        .flatten()
    {
        if let Some(narration) = &card.narration {
            let (_, _, kind) = db::asset(&state.db, &state.root, &narration.asset_id).await?;
            if kind != "audio" {
                return Err(ApiError::bad_request(
                    "Card narration requires a managed audio asset.",
                ));
            }
        }
    }
    Ok(())
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/preview-render", request_body = RevisionRequest,
    responses((status = 200, body = Job), (status = 409)))]
async fn preview_render(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<RevisionRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    if clip.document.duration_ms() > 1_800_000 {
        return Err(ApiError::bad_request(
            "Preview rendering supports clips up to 30 minutes.",
        ));
    }
    Ok(Json(
        state
            .enqueue_locked(
                "preview",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/clips/{id}/auto-edit",
    responses((status = 200, body = Option<Job>)))]
async fn get_auto_edit_proposal(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Option<Job>>> {
    let clip = db::clip(&state.db, &id).await?;
    Ok(Json(
        db::latest_auto_edit_job(&state.db, &clip.project_id, &id).await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/auto-edit", request_body = AutoEditRequest,
    responses((status = 200, body = Job), (status = 409)))]
async fn auto_edit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<AutoEditRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if clip.revision != request.revision {
        return Err(ApiError::conflict());
    }
    ensure_no_clip_edit_job(&state, &id).await?;
    if !["editorial", "reaction"].contains(&request.profile.as_str()) {
        return Err(ApiError::bad_request(
            "Choose an editorial or reaction profile.",
        ));
    }
    if request.remove_silence && !crate::quality_pack::status(&state).await.ready {
        return Err(ApiError::bad_request(
            "Install the local quality pack before removing silence.",
        ));
    }
    if request.auto_motion {
        if ![Layout::Portrait, Layout::Square, Layout::Landscape].contains(&clip.document.layout) {
            return Err(ApiError::bad_request(
                "Automatic camera motion requires portrait, square, or landscape framing.",
            ));
        }
        if !clip.document.camera_motion.is_empty() {
            return Err(ApiError::bad_request(
                "Review or remove existing camera motion before requesting automatic motion.",
            ));
        }
    }
    model_manager::model_path(&state, "qwen3-4b").await?;
    Ok(Json(
        state
            .enqueue_locked(
                "auto_edit",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"snapshot": clip, "profile": request.profile,
            "remove_silence": request.remove_silence,
            "auto_motion": request.auto_motion}),
            )
            .await?,
    ))
}

#[utoipa::path(get, path = "/api/v1/models/quality-pack",
    responses((status = 200, body = crate::quality_pack::PackStatus)))]
async fn quality_pack_status(
    State(state): State<AppState>,
) -> Json<crate::quality_pack::PackStatus> {
    Json(crate::quality_pack::status(&state).await)
}

#[utoipa::path(post, path = "/api/v1/models/import-pack", responses((status = 200)))]
async fn import_quality_pack(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Json<crate::quality_pack::PackStatus>> {
    state.require_writable_models()?;
    crate::tools::require_native_job(&state, "model")?;
    let _gate = state.operation_gate.lock().await;
    if !db::active_jobs(&state.db).await?.is_empty() {
        return Err(ApiError::bad_request(
            "Finish processing before installing the quality pack.",
        ));
    }
    let (relative, _) = receive_file(&state, &mut multipart, "temporary", &["zip"]).await?;
    let path = state.root.join(relative);
    let result = crate::quality_pack::import(&state, path.clone()).await;
    tokio::fs::remove_file(path).await?;
    result?;
    Ok(Json(crate::quality_pack::status(&state).await))
}

#[utoipa::path(get, path = "/api/v1/assets/{id}", responses((status = 200)))]
async fn serve_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> ApiResult<Response> {
    let gate = state.operation_gate.lock().await;
    let (path, name, kind) = db::asset(&state.db, &state.root, &id).await?;
    if kind == "preview" {
        state
            .activity
            .lock()
            .await
            .insert(format!("preview:{id}"), now_ms() + 120_000);
    }
    drop(gate);
    let download = request
        .uri()
        .query()
        .is_some_and(|query| query.contains("download=1"));
    let response = ServeFile::new(path)
        .oneshot(request)
        .await
        .unwrap_or_else(|never| match never {});
    let mut response = response.map(Body::new);
    if download {
        let name = name.replace(['"', '\r', '\n'], "_");
        if let Ok(value) = HeaderValue::from_str(&format!("attachment; filename=\"{name}\"")) {
            response.headers_mut().insert("content-disposition", value);
        }
    }
    response.headers_mut().insert(
        "cross-origin-resource-policy",
        HeaderValue::from_static("same-origin"),
    );
    Ok(response)
}

#[utoipa::path(get, path = "/api/v1/fonts", responses((status = 200, body = Vec<String>)))]
async fn fonts(State(state): State<AppState>) -> ApiResult<Json<Vec<String>>> {
    let mut names = Vec::new();
    let mut directory = tokio::fs::read_dir(state.tools_root().join("fonts")).await?;
    while let Some(entry) = directory.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".ttf") || name.ends_with(".otf") || name.ends_with(".woff") {
            names.push(name);
        }
    }
    Ok(Json(names))
}

#[utoipa::path(get, path = "/api/v1/fonts/{name}", responses((status = 200)))]
async fn serve_font(
    State(state): State<AppState>,
    Path(name): Path<String>,
    request: Request,
) -> ApiResult<Response> {
    if name.contains(['/', '\\'])
        || !(name.ends_with(".ttf") || name.ends_with(".otf") || name.ends_with(".woff"))
    {
        return Err(ApiError::not_found());
    }
    let response = ServeFile::new(state.tools_root().join("fonts").join(name))
        .oneshot(request)
        .await
        .unwrap_or_else(|never| match never {});
    Ok(response.map(Body::new))
}

#[utoipa::path(get, path = "/api/v1/events", responses((status = 200)))]
async fn events(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<SseEvent, std::convert::Infallible>>> {
    let mut receiver = state.events.subscribe();
    let stream = async_stream::stream! {
        yield Ok(SseEvent::default().event("snapshot").data(state.sequence.load(Ordering::SeqCst).to_string()));
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if let Ok(data) = serde_json::to_string(&event) {
                        yield Ok(SseEvent::default().event("change").id(event.sequence.to_string()).data(data));
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    yield Ok(SseEvent::default().event("snapshot").data("refresh"));
                }
                Err(_) => break,
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[utoipa::path(get, path = "/api/v1/diagnostics", responses((status = 200)))]
async fn diagnostics(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    Ok(Json(
        json!({"version": env!("CARGO_PKG_VERSION"), "platform": std::env::consts::ARCH,
        "jobs": db::jobs(&state.db).await?, "models": model_manager::statuses(&state).await?}),
    ))
}

#[utoipa::path(post, path = "/api/v1/storage/cleanup", responses((status = 200)))]
async fn cleanup(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    if db::active_jobs(&state.db)
        .await?
        .iter()
        .any(|job| ["queued", "running", "cancelling"].contains(&job.status.as_str()))
    {
        return Err(ApiError::bad_request(
            "Finish active jobs before clearing temporary processing files.",
        ));
    }
    Ok(Json(
        serde_json::to_value(crate::storage::cleanup(&state).await?)
            .map_err(anyhow::Error::from)?,
    ))
}

#[utoipa::path(delete, path = "/api/v1/projects/{id}", responses((status = 200)))]
async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.project_id.as_deref() == Some(&id)
            && ["queued", "running", "cancelling"].contains(&job.status.as_str())
    }) {
        return Err(ApiError::bad_request(
            "Stop this project's jobs before deleting it.",
        ));
    }
    let project = db::project(&state.db, &id).await?;
    let mut assets = vec![project.asset_id];
    assets.extend(project.preview_asset_id);
    assets.extend(project.thumbnail_id);
    let storyboard_assets: Vec<(String,)> =
        sqlx::query_as("SELECT id FROM assets WHERE relative_path LIKE ?")
            .bind(format!("thumbnails/storyboard/{id}/%"))
            .fetch_all(&state.db)
            .await?;
    assets.extend(storyboard_assets.into_iter().map(|(asset_id,)| asset_id));
    let broll_assets: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT asset_id, thumbnail_id, preview_asset_id FROM project_media WHERE project_id = ?",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await?;
    for (asset_id, thumbnail_id, preview_asset_id) in broll_assets {
        assets.push(asset_id);
        assets.extend(thumbnail_id);
        assets.extend(preview_asset_id);
    }
    for clip in db::clips(&state.db, &id).await? {
        assets.extend(clip.document.watermark.asset_id);
        for card in [&clip.document.intro_card, &clip.document.outro_card]
            .into_iter()
            .flatten()
        {
            if let Some(narration) = &card.narration {
                assets.push(narration.asset_id.clone());
            }
        }
    }
    for export in db::exports(&state.db)
        .await?
        .into_iter()
        .filter(|export| export.project_id == id)
    {
        assets.extend([export.asset_id, export.srt_asset_id, export.ass_asset_id]);
    }
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    db::remove_unused_assets(&state.db, &state.root, assets).await?;
    state.emit("projects", None);
    Ok(Json(json!({"deleted": true})))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/timeline-preview", request_body = TimelineRequest,
    responses((status = 200, body = EditDocument)))]
async fn timeline_preview(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<TimelineRequest>,
) -> ApiResult<Json<EditDocument>> {
    let clip = db::clip(&state.db, &id).await?;
    let project = db::project(&state.db, &clip.project_id).await?;
    request
        .document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    let mut envelope = request.document.segment_envelope(request.segments.clone());
    envelope.visual_layers.clear();
    envelope.audio_layers.clear();
    envelope
        .validate_timeline(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    let mut result = request.document.replace_segments(request.segments);
    result.hydrate_added_words(&request.document, &project.words);
    result
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    Ok(Json(result))
}

#[utoipa::path(post, path = "/api/v1/clips/{id}/teaser-preview", request_body = TeaserRequest,
    responses((status = 200, body = EditDocument)))]
async fn teaser_preview(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<TeaserRequest>,
) -> ApiResult<Json<EditDocument>> {
    let clip = db::clip(&state.db, &id).await?;
    let project = db::project(&state.db, &clip.project_id).await?;
    request
        .document
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    let segments = request
        .document
        .teaser_segments(request.start_ms, request.end_ms)
        .map_err(ApiError::bad_request)?;
    let result = request.document.replace_segments(segments);
    result
        .validate(project.duration_ms)
        .map_err(ApiError::bad_request)?;
    Ok(Json(result))
}

#[utoipa::path(delete, path = "/api/v1/clips/{id}", responses((status = 200)))]
async fn delete_clip(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.project_id.as_deref() == Some(&clip.project_id)
            && ["queued", "running", "cancelling"].contains(&job.status.as_str())
    }) {
        return Err(ApiError::bad_request(
            "Stop this clip's jobs before deleting it.",
        ));
    }
    let mut assets: Vec<String> = clip.document.watermark.asset_id.into_iter().collect();
    for card in [&clip.document.intro_card, &clip.document.outro_card]
        .into_iter()
        .flatten()
    {
        if let Some(narration) = &card.narration {
            assets.push(narration.asset_id.clone());
        }
    }
    for export in db::exports(&state.db)
        .await?
        .into_iter()
        .filter(|export| export.clip_id == id)
    {
        assets.extend([export.asset_id, export.srt_asset_id, export.ass_asset_id]);
    }
    sqlx::query("DELETE FROM clips WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    db::remove_unused_assets(&state.db, &state.root, assets).await?;
    state.emit("projects", None);
    Ok(Json(json!({"deleted": true})))
}

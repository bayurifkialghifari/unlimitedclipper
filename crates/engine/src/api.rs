use crate::{db, error::*, model_manager, models::*, state::AppState, subtitles};
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
pub struct GenerateRequest {
    pub clip_count: usize,
    pub duration_ms: i64,
    pub language: String,
    #[serde(default)]
    pub focus: String,
    #[serde(default = "default_interest")]
    pub minimum_score: u32,
}

fn default_interest() -> u32 {
    85
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
        download_model,
        get_settings,
        put_settings,
        list_exports,
        title_job,
        track_job,
        caption_job,
        caption_presets,
        update_status,
        check_updates,
        install_updates,
        rollback_updates,
        restart_updates,
        editor_activity,
        delete_project,
        delete_clip,
        upload_image,
        import_model,
        clip_subtitles,
        preview_subtitles,
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
        GenerateRequest,
        RefineCaptionsRequest,
        crate::caption_presets::CaptionPreset,
        CreateClipRequest,
        UpdateClipRequest,
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
        .route("/projects/{id}/generate", post(generate))
        .route("/projects/{id}/clips", post(create_clip))
        .route("/projects/{id}/export", post(export_project))
        .route("/imports/upload", post(upload_source))
        .route("/imports/youtube", post(youtube_source))
        .route("/imports/local", post(local_source))
        .route("/assets/upload", post(upload_image))
        .route(
            "/clips/{id}",
            get(get_clip).put(update_clip).delete(delete_clip),
        )
        .route("/clips/{id}/export", post(export_clip))
        .route("/clips/{id}/title", post(title_job))
        .route("/clips/{id}/track", post(track_job))
        .route("/clips/{id}/captions", post(caption_job))
        .route("/caption-presets", get(caption_presets))
        .route("/clips/{id}/subtitles", get(clip_subtitles))
        .route("/clips/{id}/preview", post(preview_subtitles))
        .route("/jobs", get(list_jobs))
        .route("/jobs/{id}/cancel", post(cancel_job))
        .route("/jobs/{id}/retry", post(retry_job))
        .route("/models", get(list_models))
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
    Ok(Json(Health {
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
        let maximum = if directory == "watermarks" {
            32 * 1024 * 1024
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

#[utoipa::path(post, path = "/api/v1/projects/{id}/generate", request_body = GenerateRequest, responses((status = 200, body = Job)))]
async fn generate(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(request): Json<GenerateRequest>,
) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    db::project(&state.db, &id).await?;
    if request.clip_count == 0
        || request.clip_count > 1000
        || request.duration_ms < 0
        || request.duration_ms > 3_600_000
        || request.minimum_score > 100
        || request.focus.chars().count() > 400
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
                    "selection_version": 2
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

#[utoipa::path(post, path = "/api/v1/clips/{id}/track", responses((status = 200, body = Job)))]
async fn track_job(State(state): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Job>> {
    let _gate = state.operation_gate.lock().await;
    let clip = db::clip(&state.db, &id).await?;
    ensure_no_clip_edit_job(&state, &id).await?;
    Ok(Json(
        state
            .enqueue_locked(
                "track",
                Some(clip.project_id.clone()),
                Some(id),
                json!({"revision": clip.revision}),
            )
            .await?,
    ))
}

async fn ensure_no_clip_edit_job(state: &AppState, clip_id: &str) -> ApiResult<()> {
    if db::active_jobs(&state.db).await?.iter().any(|job| {
        job.clip_id.as_deref() == Some(clip_id)
            && ["title", "track", "captions"].contains(&job.kind.as_str())
    }) {
        return Err(ApiError::bad_request(
            "This clip already has an editing job. Wait for it to finish.",
        ));
    }
    Ok(())
}

#[utoipa::path(get, path = "/api/v1/caption-presets", responses((status = 200, body = [crate::caption_presets::CaptionPreset])))]
async fn caption_presets() -> Json<Vec<crate::caption_presets::CaptionPreset>> {
    Json(crate::caption_presets::presets())
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
    if ["title", "track", "captions"].contains(&job.kind.as_str()) {
        let clip_id = job.clip_id.as_deref().ok_or_else(ApiError::not_found)?;
        ensure_no_clip_edit_job(&state, clip_id).await?;
        job.payload["revision"] = json!(db::clip(&state.db, clip_id).await?.revision);
    }
    job.status = "queued".into();
    job.error = None;
    job.updated_at = now_ms();
    db::save_job(&state.db, &job).await?;
    state.notify.notify_one();
    state.emit("job", Some(job.clone()));
    Ok(Json(job))
}

#[utoipa::path(get, path = "/api/v1/models", responses((status = 200, body = [ModelStatus])))]
async fn list_models(State(state): State<AppState>) -> ApiResult<Json<Vec<ModelStatus>>> {
    Ok(Json(model_manager::statuses(&state).await?))
}

#[utoipa::path(post, path = "/api/v1/models/{id}/download", responses((status = 200, body = Job)))]
async fn download_model(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Job>> {
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
    let final_path = state.root.join("models").join(&spec.filename);
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
            subtitles::vtt(&clip.document),
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

#[utoipa::path(get, path = "/api/v1/assets/{id}", responses((status = 200)))]
async fn serve_asset(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> ApiResult<Response> {
    let (path, name, _) = db::asset(&state.db, &state.root, &id).await?;
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
    let path = state.root.join("temporary");
    let canonical = tokio::fs::canonicalize(&path).await?;
    let root = tokio::fs::canonicalize(&state.root).await?;
    if !canonical.starts_with(root) {
        return Err(ApiError::bad_request("Invalid temporary directory."));
    }
    tokio::fs::remove_dir_all(&canonical).await?;
    tokio::fs::create_dir_all(path).await?;
    Ok(Json(json!({"cleared": true})))
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
    for clip in db::clips(&state.db, &id).await? {
        assets.extend(clip.document.watermark.asset_id);
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

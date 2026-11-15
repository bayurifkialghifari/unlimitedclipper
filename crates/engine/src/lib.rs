pub mod alignment;
pub mod api;
pub mod caption_metrics;
pub mod caption_presets;
pub mod clip_rating;
pub mod db;
mod discovery;
pub mod editorial;
pub mod error;
mod frame_tracking;
mod inference;
pub mod model_manager;
pub mod models;
pub mod native;
mod onnx;
pub mod pipeline;
pub mod quality_pack;
pub mod render;
pub mod speaker;
pub mod speech;
pub mod state;
pub mod storage;
pub mod subtitles;
pub mod timeline;
pub mod tools;
pub mod tracking;
pub mod updates;
pub mod worker;

pub struct EngineConfig {
    pub data_dir: std::path::PathBuf,
    pub tools_dir: std::path::PathBuf,
    pub studio_dir: std::path::PathBuf,
    pub port: u16,
}

pub struct Engine {
    pub state: state::AppState,
    pub port: u16,
    token: String,
}

impl Engine {
    pub fn studio_url(&self) -> String {
        format!("http://127.0.0.1:{}/#session={}", self.port, self.token)
    }
}

pub async fn start() -> anyhow::Result<Engine> {
    start_configured(None, None).await
}

pub async fn start_configured(
    tools_override: Option<std::path::PathBuf>,
    studio_override: Option<std::path::PathBuf>,
) -> anyhow::Result<Engine> {
    let root = std::env::var_os("UC_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            directories::ProjectDirs::from("app", "UnlimitedClipper", "Studio")
                .expect("Local application directory exists")
                .data_local_dir()
                .to_path_buf()
        });
    let tools = tools_override
        .or_else(|| std::env::var_os("UC_TOOLS_DIR").map(std::path::PathBuf::from))
        .unwrap_or_else(|| {
            let architecture = if cfg!(target_arch = "aarch64") {
                "arm64"
            } else {
                "x64"
            };
            std::path::PathBuf::from(format!(".tools/windows-{architecture}"))
        });
    let port = std::env::var("UC_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(43179);
    let studio = studio_override
        .or_else(|| std::env::var_os("UC_STUDIO_DIR").map(std::path::PathBuf::from))
        .unwrap_or_else(|| std::path::PathBuf::from("apps/studio/dist"));
    start_with_config(EngineConfig {
        data_dir: root,
        tools_dir: tools,
        studio_dir: studio,
        port,
    })
    .await
}

pub async fn start_with_config(config: EngineConfig) -> anyhow::Result<Engine> {
    start_host(config, None).await
}

pub async fn start_with_native_tools(
    config: EngineConfig,
    tools: std::sync::Arc<dyn native::NativeTools>,
) -> anyhow::Result<Engine> {
    start_host(config, Some(tools)).await
}

async fn start_host(
    config: EngineConfig,
    native_tools: Option<std::sync::Arc<dyn native::NativeTools>>,
) -> anyhow::Result<Engine> {
    let mut state = state::AppState::new(config.data_dir, config.tools_dir).await?;
    state.native_tools = native_tools;
    updates::restore(&state).await?;
    let token = state.bootstrap.lock().await.clone().unwrap_or_default();
    let listener =
        tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, config.port)).await?;
    let port = listener.local_addr()?.port();
    state.port.store(port, std::sync::atomic::Ordering::SeqCst);
    let studio = config.studio_dir;
    let router = api::router(state.clone()).fallback_service(
        tower_http::services::ServeDir::new(&studio).fallback(
            tower_http::services::ServeFile::new(studio.join("index.html")),
        ),
    );
    let router = router.layer(axum::middleware::from_fn(
        |request: axum::extract::Request, next: axum::middleware::Next| async move {
            let mut response = next.run(request).await;
            response.headers_mut().insert(
                "cross-origin-opener-policy",
                axum::http::HeaderValue::from_static("same-origin"),
            );
            response.headers_mut().insert(
                "cross-origin-embedder-policy",
                axum::http::HeaderValue::from_static("require-corp"),
            );
            response
        },
    ));
    let worker_state = state.clone();
    tokio::spawn(async move {
        if let Err(error) = worker::run(worker_state).await {
            tracing::error!(%error, "Job scheduler stopped");
        }
    });
    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            tracing::error!(%error, "Local server stopped");
        }
    });
    Ok(Engine { state, port, token })
}

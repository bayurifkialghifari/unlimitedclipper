pub mod api;
pub mod db;
pub mod error;
pub mod model_manager;
pub mod models;
pub mod pipeline;
pub mod render;
pub mod state;
pub mod subtitles;
pub mod tools;
pub mod tracking;
pub mod updates;
pub mod worker;

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
    let state = state::AppState::new(root, tools).await?;
    updates::restore(&state).await?;
    let token = state.bootstrap.lock().await.clone().unwrap_or_default();
    let port = std::env::var("UC_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(43179);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let port = listener.local_addr()?.port();
    state.port.store(port, std::sync::atomic::Ordering::SeqCst);
    let studio = studio_override
        .or_else(|| std::env::var_os("UC_STUDIO_DIR").map(std::path::PathBuf::from))
        .unwrap_or_else(|| std::path::PathBuf::from("apps/studio/dist"));
    let router = api::router(state.clone()).fallback_service(
        tower_http::services::ServeDir::new(&studio).not_found_service(
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

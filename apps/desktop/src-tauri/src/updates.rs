use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use unlimitedclipper_engine::{db, models::now_ms, state::AppState};

#[derive(Default)]
pub struct DesktopState {
    pub engine: tokio::sync::Mutex<Option<AppState>>,
    update: tokio::sync::Mutex<Option<(Update, Vec<u8>)>>,
}

#[derive(serde::Serialize)]
pub struct UpdateStatus {
    version: String,
    ready: bool,
}

#[tauri::command]
pub async fn check_application_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
) -> Result<UpdateStatus, String> {
    let engine = state
        .engine
        .lock()
        .await
        .clone()
        .ok_or("The local engine is starting.")?;
    let settings = db::settings(&engine.db)
        .await
        .map_err(|error| error.to_string())?;
    if settings.update_feed.is_empty() {
        return Ok(UpdateStatus {
            version: env!("CARGO_PKG_VERSION").into(),
            ready: false,
        });
    }
    let key = if engine.development {
        std::env::var("UC_APP_PUBLIC_KEY").ok()
    } else {
        None
    }
    .or_else(|| option_env!("UC_APP_PUBLIC_KEY").map(str::to_owned))
    .ok_or("This build has no trusted application update signing key.")?;
    let feed = settings
        .update_feed
        .parse()
        .map_err(|error| format!("Invalid update feed: {error}"))?;
    let updater = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![feed])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(UpdateStatus {
            version: env!("CARGO_PKG_VERSION").into(),
            ready: false,
        });
    };
    let bytes = update
        .download(
            |downloaded, total| {
                let _ = app.emit(
                    "application-update-progress",
                    serde_json::json!({"downloaded":downloaded,"total":total}),
                );
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;
    let status = UpdateStatus {
        version: update.version.clone(),
        ready: true,
    };
    *state.update.lock().await = Some((update, bytes));
    Ok(status)
}

#[tauri::command]
pub async fn install_application_update(
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    let engine = state
        .engine
        .lock()
        .await
        .clone()
        .ok_or("The local engine is starting.")?;
    let _gate = engine.operation_gate.lock().await;
    if !engine.idle().await.map_err(|error| error.to_string())? {
        return Err("Finish processing and save edits before installing updates.".into());
    }
    let backup = engine
        .root
        .join("backups")
        .join(format!("before-update-{}.sqlite", now_ms()));
    sqlx::query("VACUUM INTO ?")
        .bind(backup.to_string_lossy().as_ref())
        .execute(&engine.db)
        .await
        .map_err(|error| error.to_string())?;
    let staged = state.update.lock().await;
    let (update, bytes) = staged
        .as_ref()
        .ok_or("No verified application update is ready.")?;
    update.install(bytes).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_browser(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let engine = state
        .engine
        .lock()
        .await
        .clone()
        .ok_or("The local engine is starting.")?;
    let token = uuid::Uuid::new_v4().to_string();
    *engine.bootstrap.lock().await = Some(token.clone());
    let port = engine.port.load(std::sync::atomic::Ordering::SeqCst);
    app.opener()
        .open_url(
            format!("http://127.0.0.1:{port}/#session={token}"),
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

pub fn activate_engine(app: &tauri::AppHandle, state: AppState) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        *app.state::<DesktopState>().engine.lock().await = Some(state);
    });
}

#[tauri::command]
pub async fn open_release_page(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "https://github.com/bayurifkialghifari/unlimitedclipper/releases",
            None::<&str>,
        )
        .map_err(|error| error.to_string())
}

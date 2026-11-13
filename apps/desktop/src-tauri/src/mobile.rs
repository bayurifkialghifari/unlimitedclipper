use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::Component, sync::Arc};
use tauri::Manager;
use unlimitedclipper_engine::{EngineConfig, db, models::Job, state::AppState};

#[derive(Default)]
struct MobileState(tokio::sync::RwLock<Option<AppState>>);

#[derive(Deserialize)]
struct ImportedDocument {
    path: Option<std::path::PathBuf>,
    name: Option<String>,
}

#[tauri::command]
async fn android_import_video(app: tauri::AppHandle) -> Result<Option<Job>, String> {
    let state = app
        .state::<MobileState>()
        .0
        .read()
        .await
        .clone()
        .ok_or("Engine is starting.")?;
    let media = app.state::<tauri_plugin_native_media::Media>();
    let selected = media
        .0
        .run_mobile_plugin_async::<ImportedDocument>(
            "importVideo",
            json!({"path": state.root.join("sources")}),
        )
        .await
        .map_err(|error| error.to_string())?;
    let Some(path) = selected.path else {
        return Ok(None);
    };
    let canonical = tokio::fs::canonicalize(&path)
        .await
        .map_err(|error| error.to_string())?;
    let sources = tokio::fs::canonicalize(state.root.join("sources"))
        .await
        .map_err(|error| error.to_string())?;
    if !canonical.starts_with(&sources) {
        return Err("Selected video is outside managed source storage.".into());
    }
    let relative = format!(
        "sources/{}",
        canonical
            .file_name()
            .ok_or("Missing video filename.")?
            .to_string_lossy()
    );
    let result = state
        .enqueue(
            "import",
            None,
            None,
            json!({
                "relative_path": relative,
                "name": selected.name.unwrap_or_else(|| "Imported video".into()),
                "project_id": uuid::Uuid::new_v4().to_string()
            }),
        )
        .await
        .map_err(|error| error.to_string());
    if result.is_err() {
        let _ = tokio::fs::remove_file(canonical).await;
    }
    result.map(Some)
}

#[tauri::command]
async fn android_save_asset(app: tauri::AppHandle, asset_id: String) -> Result<Value, String> {
    let state = app
        .state::<MobileState>()
        .0
        .read()
        .await
        .clone()
        .ok_or("Engine is starting.")?;
    let (path, name, _) = db::asset(&state.db, &state.root, &asset_id)
        .await
        .map_err(|error| error.message)?;
    let mime = match path.extension().and_then(|value| value.to_str()) {
        Some("mp4") => "video/mp4",
        Some("srt" | "ass") => "text/plain",
        _ => return Err("Choose a registered video or subtitle export.".into()),
    };
    app.state::<tauri_plugin_native_media::Media>()
        .0
        .run_mobile_plugin_async(
            "saveDocument",
            json!({"path": path, "name": name, "mime": mime}),
        )
        .await
        .map_err(|error| error.to_string())
}

fn extract_studio(
    app: &tauri::AppHandle,
    root: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let resolver = app.asset_resolver();
    for (key, _) in resolver.iter() {
        let relative = key.trim_start_matches('/');
        let path = std::path::Path::new(relative);
        if !path
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err("Invalid embedded studio asset path.".into());
        }
        let asset = resolver
            .get(key.to_string())
            .ok_or("Embedded studio asset is unavailable.")?;
        let destination = root.join(path);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(destination, asset.bytes)?;
    }
    if !root.join("index.html").is_file() {
        return Err("The Android build contains no studio entry point.".into());
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_native_media::init())
        .manage(MobileState::default())
        .invoke_handler(tauri::generate_handler![
            android_import_video,
            android_save_asset
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let data = handle.path().app_data_dir()?;
            let studio = handle.path().app_cache_dir()?.join("studio");
            extract_studio(&handle, &studio)?;
            let media = handle
                .state::<tauri_plugin_native_media::Media>()
                .inner()
                .clone();
            tauri::async_runtime::spawn(async move {
                let result = unlimitedclipper_engine::start_with_native_tools(
                    EngineConfig {
                        data_dir: data,
                        tools_dir: studio.clone(),
                        studio_dir: studio,
                        port: 43179,
                    },
                    Arc::new(media),
                )
                .await;
                match result {
                    Ok(engine) => {
                        let url = engine.studio_url();
                        *handle.state::<MobileState>().0.write().await = Some(engine.state);
                        if let Some(window) = handle.get_webview_window("studio")
                            && let Err(error) =
                                window.navigate(url.parse().expect("Loopback studio URL is valid"))
                        {
                            eprintln!("Android studio navigation failed: {error}");
                        }
                    }
                    Err(error) => {
                        use tauri_plugin_dialog::DialogExt;
                        handle
                            .dialog()
                            .message(error.to_string())
                            .title("UnlimitedClipper startup failed")
                            .show(|_| {});
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Android application failed");
}

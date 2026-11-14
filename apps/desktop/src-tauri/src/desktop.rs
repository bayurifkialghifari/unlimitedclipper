use crate::updates;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("studio") {
                let _ = window.set_focus();
            }
        }))
        .manage(updates::DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            updates::check_application_update,
            updates::install_application_update,
            updates::open_browser,
            updates::open_release_page
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let resources = handle.path().resource_dir().ok();
                let tools = resources
                    .as_ref()
                    .map(|root| root.join("tools"))
                    .filter(|path| path.is_dir());
                let studio = resources
                    .map(|root| root.join("studio"))
                    .filter(|path| path.is_dir());
                match unlimitedclipper_engine::start_configured(tools, studio).await {
                    Ok(engine) => {
                        updates::activate_engine(&handle, engine.state.clone());
                        let restart_handle = handle.clone();
                        let restart_state = engine.state.clone();
                        tauri::async_runtime::spawn(async move {
                            restart_state.restart.notified().await;
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                            restart_handle.restart();
                        });
                        let window = tauri::WebviewWindowBuilder::new(
                            &handle,
                            "studio",
                            tauri::WebviewUrl::External(
                                engine.studio_url().parse().expect("Local URL is valid"),
                            ),
                        )
                        .title("UnlimitedClipper Studio")
                        .inner_size(1440.0, 940.0)
                        .min_inner_size(720.0, 640.0)
                        .build();
                        if let Err(error) = window {
                            eprintln!("Window creation failed: {error}");
                        }
                    }
                    Err(error) => {
                        use tauri_plugin_dialog::DialogExt;
                        handle
                            .dialog()
                            .message(error.to_string())
                            .title("UnlimitedClipper startup failed")
                            .blocking_show();
                        handle.exit(1);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Desktop application failed");
}

use anyhow::bail;
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;
use tauri::{Manager, Wry, ipc::Channel, plugin::PluginHandle};
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;
use unlimitedclipper_engine::native::{NativeExecution, NativeProgress, NativeTools};

#[derive(Clone)]
pub struct Media(pub Arc<PluginHandle<Wry>>);

#[derive(Deserialize)]
struct ExecutionResult {
    output: String,
}

impl NativeTools for Media {
    fn supports(&self, name: &str) -> bool {
        matches!(name, "ffmpeg" | "ffprobe")
    }

    fn execute(
        &self,
        name: String,
        arguments: Vec<String>,
        progress: Option<UnboundedSender<NativeProgress>>,
        cancellation: CancellationToken,
    ) -> NativeExecution {
        let handle = self.0.clone();
        Box::pin(async move {
            let operation_id = uuid::Uuid::new_v4().to_string();
            let channel = Channel::<Value>::new(move |message| {
                if let tauri::ipc::InvokeResponseBody::Json(data) = message
                    && let Ok(value) = serde_json::from_str::<Value>(&data)
                    && let (Some(sender), Some(elapsed_ms)) =
                        (&progress, value["elapsed_ms"].as_i64())
                {
                    let _ = sender.send(NativeProgress { elapsed_ms });
                }
                Ok(())
            });
            handle
                .run_mobile_plugin_async::<Value>("prepare", json!({"id": operation_id}))
                .await?;
            let execution = handle.run_mobile_plugin_async::<ExecutionResult>(
                "execute",
                json!({"id": operation_id, "name": name, "arguments": arguments, "progress": channel}),
            );
            tokio::pin!(execution);
            let result = tokio::select! {
                result = &mut execution => result,
                _ = cancellation.cancelled() => {
                    let cancellation_result = handle.run_mobile_plugin_async::<Value>("cancel", json!({"id": operation_id})).await;
                    // Keep the scheduler occupied until the native completion callback arrives.
                    let result = execution.await;
                    cancellation_result?;
                    result
                }
            };
            if cancellation.is_cancelled() {
                bail!("Job cancelled.");
            }
            Ok(result?.output.into_bytes())
        })
    }
}

pub fn init() -> tauri::plugin::TauriPlugin<Wry> {
    tauri::plugin::Builder::new("native-media")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("app.unlimitedclipper.media", "MediaPlugin")?;
            app.manage(Media(Arc::new(handle)));
            Ok(())
        })
        .build()
}

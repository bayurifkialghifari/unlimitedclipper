use std::sync::Arc;
use tokio::sync::{Notify, mpsc::UnboundedSender};
use tokio_util::sync::CancellationToken;
use unlimitedclipper_engine::{
    db,
    native::{NativeExecution, NativeProgress, NativeTools},
    state::AppState,
    tools,
};

struct ControlledMedia {
    stopping: Arc<Notify>,
    stopped: Arc<Notify>,
}

impl NativeTools for ControlledMedia {
    fn supports(&self, name: &str) -> bool {
        matches!(name, "ffmpeg" | "ffprobe")
    }

    fn execute(
        &self,
        _name: String,
        _arguments: Vec<String>,
        _progress: Option<UnboundedSender<NativeProgress>>,
        cancellation: CancellationToken,
    ) -> NativeExecution {
        let stopping = self.stopping.clone();
        let stopped = self.stopped.clone();
        Box::pin(async move {
            cancellation.cancelled().await;
            stopping.notify_one();
            stopped.notified().await;
            anyhow::bail!("Native execution stopped after cancellation.");
        })
    }
}

async fn native_state(root: &std::path::Path) -> AppState {
    let mut state = AppState::new(root.join("library"), root.join("resources"))
        .await
        .unwrap();
    state.native_tools = Some(Arc::new(ControlledMedia {
        stopping: Arc::new(Notify::new()),
        stopped: Arc::new(Notify::new()),
    }));
    state
}

#[tokio::test]
async fn unsupported_native_jobs_are_rejected_before_persistence() {
    let workspace = tempfile::tempdir().unwrap();
    let state = native_state(workspace.path()).await;
    for kind in [
        "generate",
        "captions",
        "title",
        "youtube",
        "track",
        "model",
        "component_update",
    ] {
        let failure = state
            .enqueue(kind, None, None, serde_json::json!({}))
            .await
            .unwrap_err();
        assert!(failure.to_string().contains("Android build"));
    }
    assert!(db::active_jobs(&state.db).await.unwrap().is_empty());
    let job = state
        .enqueue("import", None, None, serde_json::json!({}))
        .await
        .unwrap();
    assert_eq!(job.status, "queued");
    assert!(tools::available(&state, "ffmpeg", "ffprobe"));
    assert!(!tools::available(&state, "whisper", "whisper-cli"));
}

#[tokio::test]
async fn cancellation_waits_for_native_completion() {
    let workspace = tempfile::tempdir().unwrap();
    let mut state = native_state(workspace.path()).await;
    let stopping = Arc::new(Notify::new());
    let stopped = Arc::new(Notify::new());
    state.native_tools = Some(Arc::new(ControlledMedia {
        stopping: stopping.clone(),
        stopped: stopped.clone(),
    }));
    let cancellation = CancellationToken::new();
    let execution_token = cancellation.clone();
    let execution = tokio::spawn(async move {
        tools::capture_managed(&state, "ffmpeg", "ffmpeg", &[], &execution_token).await
    });
    cancellation.cancel();
    tokio::time::timeout(std::time::Duration::from_secs(5), stopping.notified())
        .await
        .unwrap();
    assert!(!execution.is_finished());
    stopped.notify_one();
    assert!(execution.await.unwrap().is_err());
}

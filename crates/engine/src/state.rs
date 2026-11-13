use crate::{db, models::*};
use anyhow::Result;
use sqlx::SqlitePool;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering},
    },
};
use tokio::sync::{Mutex, Notify, broadcast};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub root: PathBuf,
    pub tools: PathBuf,
    pub native_tools: Option<Arc<dyn crate::native::NativeTools>>,
    pub active_tools: Arc<std::sync::RwLock<Option<PathBuf>>>,
    pub activity: Arc<Mutex<HashMap<String, i64>>>,
    pub operation_gate: Arc<Mutex<()>>,
    pub restart_required: Arc<AtomicBool>,
    pub restart: Arc<Notify>,
    pub client: reqwest::Client,
    pub events: broadcast::Sender<Event>,
    pub sequence: Arc<AtomicU64>,
    pub notify: Arc<Notify>,
    pub cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub sessions: Arc<Mutex<HashMap<String, i64>>>,
    pub bootstrap: Arc<Mutex<Option<String>>>,
    pub development: bool,
    pub port: Arc<AtomicU16>,
    pub instance_lock: Arc<std::fs::File>,
}

impl AppState {
    pub async fn new(root: PathBuf, tools: PathBuf) -> Result<Self> {
        for directory in [
            "sources",
            "thumbnails",
            "exports",
            "models",
            "temporary",
            "watermarks",
            "backups",
        ] {
            tokio::fs::create_dir_all(root.join(directory)).await?;
        }
        let instance_lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(root.join("engine.lock"))?;
        instance_lock.try_lock().map_err(|error| {
            anyhow::anyhow!(
                "Another engine owns this data directory. Use its open studio window. {error}"
            )
        })?;
        for directory in ["temporary", "sources", "watermarks"] {
            let mut files = tokio::fs::read_dir(root.join(directory)).await?;
            while let Some(entry) = files.next_entry().await? {
                if entry.file_type().await?.is_file()
                    && entry
                        .path()
                        .extension()
                        .is_some_and(|extension| extension == "upload")
                {
                    tokio::fs::remove_file(entry.path()).await?;
                }
            }
        }
        let db = db::connect(&root).await?;
        let mut sessions: HashMap<String, i64> = tokio::fs::read(root.join("sessions.json"))
            .await
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        sessions.retain(|_, expiry| *expiry > now_ms());
        let (events, _) = broadcast::channel(256);
        Ok(Self {
            db,
            root,
            tools,
            native_tools: None,
            active_tools: Arc::new(std::sync::RwLock::new(None)),
            activity: Arc::new(Mutex::new(HashMap::new())),
            operation_gate: Arc::new(Mutex::new(())),
            restart_required: Arc::new(AtomicBool::new(false)),
            restart: Arc::new(Notify::new()),
            client: reqwest::Client::builder()
                .user_agent("UnlimitedClipper/0.1.0")
                .connect_timeout(std::time::Duration::from_secs(15))
                .read_timeout(std::time::Duration::from_secs(30))
                .build()?,
            events,
            sequence: Arc::new(AtomicU64::new(0)),
            notify: Arc::new(Notify::new()),
            cancellations: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(sessions)),
            bootstrap: Arc::new(Mutex::new(Some(uuid::Uuid::new_v4().to_string()))),
            development: cfg!(debug_assertions) && std::env::var("UC_DEV").is_ok(),
            port: Arc::new(AtomicU16::new(43179)),
            instance_lock: Arc::new(instance_lock),
        })
    }

    pub fn tools_root(&self) -> PathBuf {
        self.active_tools
            .read()
            .expect("Toolchain lock is available")
            .clone()
            .unwrap_or_else(|| self.tools.clone())
    }

    pub async fn idle(&self) -> Result<bool> {
        let jobs = db::active_jobs(&self.db).await?;
        let mut activity = self.activity.lock().await;
        activity.retain(|_, expiry| *expiry > now_ms());
        Ok(activity.is_empty() && jobs.is_empty())
    }

    pub fn emit(&self, kind: &str, job: Option<Job>) {
        let sequence = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = self.events.send(Event {
            sequence,
            kind: kind.into(),
            job,
        });
    }

    pub async fn progress(
        &self,
        job: &mut Job,
        stage: &str,
        progress: f64,
        message: &str,
    ) -> Result<()> {
        let _gate = self.operation_gate.lock().await;
        if self
            .cancellations
            .lock()
            .await
            .get(&job.id)
            .is_some_and(|token| token.is_cancelled())
        {
            job.status = "cancelling".into();
        }
        job.stage = stage.into();
        job.progress = job.progress.max(progress.clamp(0.0, 1.0));
        job.message = message.into();
        job.updated_at = now_ms();
        db::save_job(&self.db, job).await?;
        self.emit("job", Some(job.clone()));
        Ok(())
    }

    pub async fn enqueue(
        &self,
        kind: &str,
        project_id: Option<String>,
        clip_id: Option<String>,
        payload: serde_json::Value,
    ) -> Result<Job> {
        let _gate = self.operation_gate.lock().await;
        self.enqueue_locked(kind, project_id, clip_id, payload)
            .await
    }

    pub(crate) async fn enqueue_locked(
        &self,
        kind: &str,
        project_id: Option<String>,
        clip_id: Option<String>,
        payload: serde_json::Value,
    ) -> Result<Job> {
        crate::tools::require_native_job(self, kind)?;
        anyhow::ensure!(
            !self.restart_required.load(Ordering::SeqCst),
            "Restart the application to finish its toolchain update before starting another job."
        );
        let now = now_ms();
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            project_id,
            clip_id,
            kind: kind.into(),
            status: "queued".into(),
            stage: "queued".into(),
            progress: 0.0,
            message: "Waiting for the current job to finish.".into(),
            error: None,
            payload,
            created_at: now,
            updated_at: now,
        };
        db::save_job(&self.db, &job).await?;
        self.emit("job", Some(job.clone()));
        self.notify.notify_one();
        Ok(job)
    }
}

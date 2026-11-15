use crate::{
    db,
    error::{ApiError, ApiResult},
    models::{Job, now_ms},
    state::AppState,
    tools,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio_util::sync::CancellationToken;
use utoipa::ToSchema;

const FRAMES_PER_REQUEST: usize = 32;
const FRAMES_PER_PROJECT: usize = 128;

#[derive(Deserialize, ToSchema)]
pub struct StoryboardRequest {
    pub source_times_ms: Vec<i64>,
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum StoryboardFrameStatus {
    Ready,
    Pending,
    Failed,
    Unavailable,
}

#[derive(Serialize, ToSchema)]
pub struct StoryboardFrame {
    pub source_time_ms: i64,
    pub status: StoryboardFrameStatus,
    pub asset_id: Option<String>,
    pub job_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct StoryboardResponse {
    pub frames: Vec<StoryboardFrame>,
}

fn job_contains(job: &Job, time_ms: i64) -> bool {
    job.payload["source_times_ms"]
        .as_array()
        .is_some_and(|times| times.iter().any(|time| time.as_i64() == Some(time_ms)))
}

async fn cached_frame(state: &AppState, project_id: &str, time_ms: i64) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT asset_id FROM storyboard_frames WHERE project_id = ? AND source_time_ms = ?",
    )
    .bind(project_id)
    .bind(time_ms)
    .fetch_optional(&state.db)
    .await?;
    let Some((asset_id,)) = row else {
        return Ok(None);
    };
    if let Ok((path, _, kind)) = db::asset(&state.db, &state.root, &asset_id).await
        && kind == "image"
        && path.is_file()
    {
        sqlx::query(
            "UPDATE storyboard_frames SET accessed_at = ? WHERE project_id = ? AND source_time_ms = ?",
        )
        .bind(now_ms())
        .bind(project_id)
        .bind(time_ms)
        .execute(&state.db)
        .await?;
        return Ok(Some(asset_id));
    }
    sqlx::query("DELETE FROM storyboard_frames WHERE project_id = ? AND source_time_ms = ?")
        .bind(project_id)
        .bind(time_ms)
        .execute(&state.db)
        .await?;
    db::remove_unused_assets(&state.db, &state.root, vec![asset_id]).await?;
    Ok(None)
}

pub async fn request_frames(
    state: &AppState,
    project_id: &str,
    request: StoryboardRequest,
) -> ApiResult<StoryboardResponse> {
    if request.source_times_ms.is_empty() || request.source_times_ms.len() > FRAMES_PER_REQUEST {
        return Err(ApiError::bad_request(
            "Request between 1 and 32 source frames.",
        ));
    }
    let _gate = state.operation_gate.lock().await;
    let project = db::project(&state.db, project_id).await?;
    let mut times = request.source_times_ms;
    if times
        .iter()
        .any(|time| *time < 0 || *time >= project.duration_ms)
    {
        return Err(ApiError::bad_request(
            "A source frame is outside the video duration.",
        ));
    }
    times.sort_unstable();
    times.dedup();
    let available = project.preview_asset_id.is_some()
        && state.native_tools.is_none()
        && tools::available(state, "ffmpeg", "ffmpeg");
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE project_id = ? AND json_extract(data, '$.kind') = 'storyboard' AND status != 'completed' ORDER BY created_at DESC LIMIT 200",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    let jobs: Vec<Job> = rows
        .into_iter()
        .map(|(data,)| serde_json::from_str(&data))
        .collect::<std::result::Result<_, _>>()
        .map_err(anyhow::Error::from)?;
    let mut frames = Vec::with_capacity(times.len());
    let mut missing = Vec::new();
    for time_ms in times {
        if let Some(asset_id) = cached_frame(state, project_id, time_ms).await? {
            frames.push(StoryboardFrame {
                source_time_ms: time_ms,
                status: StoryboardFrameStatus::Ready,
                asset_id: Some(asset_id),
                job_id: None,
                error: None,
            });
            continue;
        }
        if !available {
            frames.push(StoryboardFrame {
                source_time_ms: time_ms,
                status: StoryboardFrameStatus::Unavailable,
                asset_id: None,
                job_id: None,
                error: None,
            });
            continue;
        }
        if let Some(job) = jobs.iter().find(|job| job_contains(job, time_ms)) {
            let failed = ["failed", "cancelled"].contains(&job.status.as_str());
            frames.push(StoryboardFrame {
                source_time_ms: time_ms,
                status: if failed {
                    StoryboardFrameStatus::Failed
                } else {
                    StoryboardFrameStatus::Pending
                },
                asset_id: None,
                job_id: Some(job.id.clone()),
                error: if failed { job.error.clone() } else { None },
            });
            continue;
        }
        missing.push(time_ms);
        frames.push(StoryboardFrame {
            source_time_ms: time_ms,
            status: StoryboardFrameStatus::Pending,
            asset_id: None,
            job_id: None,
            error: None,
        });
    }
    if !missing.is_empty() {
        let job = state
            .enqueue_locked(
                "storyboard",
                Some(project_id.to_string()),
                None,
                serde_json::json!({"source_times_ms": missing}),
            )
            .await?;
        for frame in &mut frames {
            if frame.job_id.is_none() && matches!(frame.status, StoryboardFrameStatus::Pending) {
                frame.job_id = Some(job.id.clone());
            }
        }
    }
    Ok(StoryboardResponse { frames })
}

async fn prune(state: &AppState, project_id: &str) -> Result<()> {
    let rows = sqlx::query(
        "SELECT source_time_ms, asset_id FROM storyboard_frames WHERE project_id = ? ORDER BY accessed_at DESC, source_time_ms DESC LIMIT -1 OFFSET ?",
    )
    .bind(project_id)
    .bind(FRAMES_PER_PROJECT as i64)
    .fetch_all(&state.db)
    .await?;
    let mut assets = Vec::new();
    for row in rows {
        let time_ms: i64 = row.get("source_time_ms");
        let asset_id: String = row.get("asset_id");
        sqlx::query("DELETE FROM storyboard_frames WHERE project_id = ? AND source_time_ms = ?")
            .bind(project_id)
            .bind(time_ms)
            .execute(&state.db)
            .await?;
        assets.push(asset_id);
    }
    if !assets.is_empty() {
        db::remove_unused_assets(&state.db, &state.root, assets).await?;
    }
    Ok(())
}

async fn capture_frames(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project_id = job
        .project_id
        .clone()
        .context("Missing storyboard project")?;
    let project = db::project(&state.db, &project_id).await?;
    let preview_id = project
        .preview_asset_id
        .as_deref()
        .context("The source preview is unavailable")?;
    let (source, _, kind) = db::asset(&state.db, &state.root, preview_id).await?;
    ensure!(kind == "video", "The source preview is not video.");
    let times: Vec<i64> = serde_json::from_value(job.payload["source_times_ms"].clone())?;
    ensure!(!times.is_empty() && times.len() <= FRAMES_PER_REQUEST);
    let directory = state
        .root
        .join("thumbnails")
        .join("storyboard")
        .join(&project_id);
    tokio::fs::create_dir_all(&directory).await?;
    for (index, time_ms) in times.iter().copied().enumerate() {
        ensure!((0..project.duration_ms).contains(&time_ms));
        ensure!(!cancellation.is_cancelled(), "Job cancelled.");
        if cached_frame(state, &project_id, time_ms).await?.is_none() {
            let output = directory.join(format!("{time_ms}.jpg"));
            let temporary = directory.join(format!("{time_ms}.part.jpg"));
            if temporary.exists() {
                tokio::fs::remove_file(&temporary).await?;
            }
            if !output.exists() {
                let result = tools::capture_managed(
                    state,
                    "ffmpeg",
                    "ffmpeg",
                    &[
                        "-hide_banner".into(),
                        "-loglevel".into(),
                        "error".into(),
                        "-y".into(),
                        "-ss".into(),
                        format!("{:.3}", time_ms as f64 / 1000.0),
                        "-i".into(),
                        source.to_string_lossy().into_owned(),
                        "-an".into(),
                        "-frames:v".into(),
                        "1".into(),
                        "-vf".into(),
                        "scale=256:144:force_original_aspect_ratio=decrease,pad=256:144:(ow-iw)/2:(oh-ih)/2".into(),
                        "-q:v".into(),
                        "5".into(),
                        temporary.to_string_lossy().into_owned(),
                    ],
                    cancellation,
                )
                .await;
                if result.is_err() {
                    let _ = tokio::fs::remove_file(&temporary).await;
                }
                result?;
                ensure!(tokio::fs::metadata(&temporary).await?.len() > 0);
                tokio::fs::rename(&temporary, &output).await?;
            }
            let relative = format!("thumbnails/storyboard/{project_id}/{time_ms}.jpg");
            let asset_id =
                db::register_asset(&state.db, &relative, "scene-frame.jpg", "image").await?;
            sqlx::query(
                "INSERT INTO storyboard_frames(project_id, source_time_ms, asset_id, accessed_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, source_time_ms) DO UPDATE SET asset_id = excluded.asset_id, accessed_at = excluded.accessed_at",
            )
            .bind(&project_id)
            .bind(time_ms)
            .bind(asset_id)
            .bind(now_ms())
            .execute(&state.db)
            .await?;
        }
        state
            .progress(
                job,
                "storyboard",
                (index + 1) as f64 / times.len() as f64,
                "Preparing timeline frames.",
            )
            .await?;
    }
    Ok(())
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project_id = job
        .project_id
        .clone()
        .context("Missing storyboard project")?;
    let result = capture_frames(state, job, cancellation).await;
    let cleanup = prune(state, &project_id).await;
    result?;
    cleanup
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Project;

    #[tokio::test]
    async fn requests_dedupe_source_frames_and_keep_failed_jobs_for_explicit_retry() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("data");
        let tools_root = directory.path().join("tools");
        let ffmpeg = tools_root.join("ffmpeg");
        tokio::fs::create_dir_all(&ffmpeg).await.unwrap();
        let executable = ffmpeg.join(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        });
        tokio::fs::write(executable, b"fixture").await.unwrap();
        let state = AppState::new(root, tools_root).await.unwrap();
        let source = state.root.join("sources/preview.mp4");
        tokio::fs::write(&source, b"fixture").await.unwrap();
        let asset_id = db::register_asset(&state.db, "sources/preview.mp4", "preview", "video")
            .await
            .unwrap();
        let project = Project {
            id: "storyboard-project".into(),
            name: "Fixture".into(),
            source_kind: "file".into(),
            source_url: None,
            asset_id: asset_id.clone(),
            preview_asset_id: Some(asset_id),
            thumbnail_id: None,
            duration_ms: 5000,
            width: 640,
            height: 360,
            has_audio: false,
            language: None,
            transcript_configuration: None,
            created_at: now_ms(),
            words: Vec::new(),
        };
        db::save_project(&state.db, &project).await.unwrap();

        let first = request_frames(
            &state,
            &project.id,
            StoryboardRequest {
                source_times_ms: vec![1000, 2000, 1000],
            },
        )
        .await
        .unwrap();
        assert_eq!(first.frames.len(), 2);
        assert_eq!(first.frames[0].status, StoryboardFrameStatus::Pending);
        assert_eq!(first.frames[0].job_id, first.frames[1].job_id);
        let second = request_frames(
            &state,
            &project.id,
            StoryboardRequest {
                source_times_ms: vec![2000, 1000],
            },
        )
        .await
        .unwrap();
        assert_eq!(db::active_jobs(&state.db).await.unwrap().len(), 1);
        assert_eq!(second.frames[0].job_id, first.frames[0].job_id);

        let mut job = db::job(&state.db, first.frames[0].job_id.as_deref().unwrap())
            .await
            .unwrap();
        job.status = "failed".into();
        job.error = Some("Fixture failure".into());
        db::save_job(&state.db, &job).await.unwrap();
        let failed = request_frames(
            &state,
            &project.id,
            StoryboardRequest {
                source_times_ms: vec![1000],
            },
        )
        .await
        .unwrap();
        assert_eq!(failed.frames[0].status, StoryboardFrameStatus::Failed);
        assert_eq!(failed.frames[0].error.as_deref(), Some("Fixture failure"));
        assert_eq!(db::jobs(&state.db).await.unwrap().len(), 1);
        assert!(
            request_frames(
                &state,
                &project.id,
                StoryboardRequest {
                    source_times_ms: vec![5000],
                },
            )
            .await
            .is_err()
        );
    }
}

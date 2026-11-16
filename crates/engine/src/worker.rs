use crate::{db, model_manager, models::*, pipeline, state::AppState};
use anyhow::Result;
use tokio_util::sync::CancellationToken;

pub async fn run(state: AppState) -> Result<()> {
    for mut job in db::active_jobs(&state.db).await? {
        if job.status == "running" || job.status == "cancelling" {
            job.status = "failed".into();
            job.error = Some(
                "The application stopped during this job. Retry to resume its completed stages."
                    .into(),
            );
            job.updated_at = now_ms();
            db::save_job(&state.db, &job).await?;
        }
    }
    loop {
        let gate = state.operation_gate.lock().await;
        let Some(mut job) = db::next_job(&state.db).await? else {
            drop(gate);
            state.notify.notified().await;
            continue;
        };
        let cancellation = CancellationToken::new();
        state
            .cancellations
            .lock()
            .await
            .insert(job.id.clone(), cancellation.clone());
        job.status = "running".into();
        job.stage = "starting".into();
        job.updated_at = now_ms();
        db::save_job(&state.db, &job).await?;
        state.emit("job", Some(job.clone()));
        drop(gate);
        let result = match job.kind.as_str() {
            "assess" => crate::clip_rating::assess(&state, &mut job, &cancellation).await,
            "import" => pipeline::import_file(&state, &mut job, &cancellation).await,
            "youtube" => pipeline::import_youtube(&state, &mut job, &cancellation).await,
            "model" => model_manager::download(&state, &mut job, &cancellation).await,
            "narration_pack" => {
                crate::narration_pack::download(&state, &mut job, &cancellation).await
            }
            "card_narration" => crate::narration::generate(&state, &mut job, &cancellation).await,
            "generate" => pipeline::generate(&state, &mut job, &cancellation).await,
            "title" => pipeline::title(&state, &mut job, &cancellation).await,
            "hook_proposals" => {
                crate::hook_proposals::generate(&state, &mut job, &cancellation).await
            }
            "captions" => pipeline::refine_captions(&state, &mut job, &cancellation).await,
            "track" => crate::tracking::track(&state, &mut job, &cancellation).await,
            "component_update" => crate::updates::download(&state, &mut job, &cancellation).await,
            "export" => pipeline::render_batch(&state, &mut job, &cancellation).await,
            "preview" => crate::render::preview_job(&state, &mut job, &cancellation).await,
            "storyboard" => crate::storyboard::generate(&state, &mut job, &cancellation).await,
            "waveform" => crate::waveform::generate(&state, &mut job, &cancellation).await,
            "asset_waveform" => {
                crate::waveform::generate_asset(&state, &mut job, &cancellation).await
            }
            "broll_import" => crate::broll::import(&state, &mut job, &cancellation).await,
            "auto_broll" => crate::auto_broll::generate(&state, &mut job, &cancellation).await,
            "auto_edit" => crate::editorial::auto_edit(&state, &mut job, &cancellation).await,
            _ => Err(anyhow::anyhow!("Unknown job type.")),
        };
        let _gate = state.operation_gate.lock().await;
        if cancellation.is_cancelled() {
            job.status = "cancelled".into();
            job.message = "The job stopped. Completed stages were preserved.".into();
            job.error = None;
        } else if let Err(error) = result {
            job.status = "failed".into();
            job.message = "Processing stopped. Review the error and retry.".into();
            job.error = Some(error.to_string());
        } else {
            job.status = "completed".into();
            job.progress = 1.0;
            job.message = "Completed on this computer.".into();
            job.error = None;
        }
        job.updated_at = now_ms();
        db::save_job(&state.db, &job).await?;
        state.cancellations.lock().await.remove(&job.id);
        state.emit("job", Some(job));
        state.emit("projects", None);
    }
}

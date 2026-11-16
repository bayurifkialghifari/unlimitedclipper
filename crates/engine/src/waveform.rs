use crate::{db, error::ApiResult, models::Job, state::AppState, tools};
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use sqlx::Row;
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;
use utoipa::ToSchema;

const SAMPLE_RATE: i64 = 200;
const MAX_DURATION_MS: i64 = 24 * 60 * 60 * 1000;
const MAX_BUCKETS: i64 = 12_000;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum WaveformStatus {
    Ready,
    Pending,
    Failed,
    Unavailable,
}

#[derive(Serialize, ToSchema)]
pub struct WaveformResponse {
    pub status: WaveformStatus,
    pub bucket_ms: Option<i64>,
    pub peaks: Vec<u8>,
    pub job_id: Option<String>,
    pub error: Option<String>,
}

fn response(
    status: WaveformStatus,
    job_id: Option<String>,
    error: Option<String>,
) -> WaveformResponse {
    WaveformResponse {
        status,
        bucket_ms: None,
        peaks: Vec::new(),
        job_id,
        error,
    }
}

pub async fn request_peaks(state: &AppState, project_id: &str) -> ApiResult<WaveformResponse> {
    let _gate = state.operation_gate.lock().await;
    let project = db::project(&state.db, project_id).await?;
    if !project.has_audio
        || project.duration_ms > MAX_DURATION_MS
        || state.native_tools.is_some()
        || !tools::available(state, "ffmpeg", "ffmpeg")
    {
        return Ok(response(WaveformStatus::Unavailable, None, None));
    }
    let cached = sqlx::query("SELECT bucket_ms, peaks FROM source_waveforms WHERE project_id = ?")
        .bind(project_id)
        .fetch_optional(&state.db)
        .await?;
    if let Some(row) = cached {
        return Ok(WaveformResponse {
            status: WaveformStatus::Ready,
            bucket_ms: Some(row.get("bucket_ms")),
            peaks: row.get("peaks"),
            job_id: None,
            error: None,
        });
    }
    let latest: Option<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE project_id = ? AND json_extract(data, '$.kind') = 'waveform' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await?;
    if let Some((data,)) = latest {
        let job: Job = serde_json::from_str(&data).map_err(anyhow::Error::from)?;
        if job.status != "completed" {
            let failed = ["failed", "cancelled"].contains(&job.status.as_str());
            return Ok(response(
                if failed {
                    WaveformStatus::Failed
                } else {
                    WaveformStatus::Pending
                },
                Some(job.id),
                if failed { job.error } else { None },
            ));
        }
    }
    let job = state
        .enqueue_locked(
            "waveform",
            Some(project_id.to_owned()),
            None,
            serde_json::json!({}),
        )
        .await?;
    Ok(response(WaveformStatus::Pending, Some(job.id), None))
}

async fn asset_audio_source(state: &AppState, asset_id: &str) -> ApiResult<Option<(PathBuf, i64)>> {
    let (path, _, kind) = db::asset(&state.db, &state.root, asset_id).await?;
    if kind == "audio" {
        let duration: Option<(Option<i64>,)> =
            sqlx::query_as("SELECT duration_ms FROM assets WHERE id = ?")
                .bind(asset_id)
                .fetch_optional(&state.db)
                .await?;
        return Ok(duration.and_then(|row| row.0).map(|value| (path, value)));
    }
    if kind == "video" {
        let project = db::projects(&state.db)
            .await?
            .into_iter()
            .find(|project| project.asset_id == asset_id && project.has_audio);
        if let Some(project) = project {
            let source_id = project.preview_asset_id.as_deref().unwrap_or(asset_id);
            let (source, _, _) = db::asset(&state.db, &state.root, source_id).await?;
            return Ok(Some((source, project.duration_ms)));
        }
    }
    Ok(None)
}

pub async fn request_asset_peaks(state: &AppState, asset_id: &str) -> ApiResult<WaveformResponse> {
    let _gate = state.operation_gate.lock().await;
    if state.native_tools.is_some() || !tools::available(state, "ffmpeg", "ffmpeg") {
        return Ok(response(WaveformStatus::Unavailable, None, None));
    }
    let Some((_, duration_ms)) = asset_audio_source(state, asset_id).await? else {
        return Ok(response(WaveformStatus::Unavailable, None, None));
    };
    if !(1..=MAX_DURATION_MS).contains(&duration_ms) {
        return Ok(response(WaveformStatus::Unavailable, None, None));
    }
    let cached = sqlx::query("SELECT bucket_ms, peaks FROM asset_waveforms WHERE asset_id = ?")
        .bind(asset_id)
        .fetch_optional(&state.db)
        .await?;
    if let Some(row) = cached {
        return Ok(WaveformResponse {
            status: WaveformStatus::Ready,
            bucket_ms: Some(row.get("bucket_ms")),
            peaks: row.get("peaks"),
            job_id: None,
            error: None,
        });
    }
    let latest: Option<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE json_extract(data, '$.kind') = 'asset_waveform' AND json_extract(data, '$.payload.asset_id') = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(asset_id)
    .fetch_optional(&state.db)
    .await?;
    if let Some((data,)) = latest {
        let job: Job = serde_json::from_str(&data).map_err(anyhow::Error::from)?;
        if job.status != "completed" {
            let failed = ["failed", "cancelled"].contains(&job.status.as_str());
            return Ok(response(
                if failed {
                    WaveformStatus::Failed
                } else {
                    WaveformStatus::Pending
                },
                Some(job.id),
                if failed { job.error } else { None },
            ));
        }
    }
    let job = state
        .enqueue_locked(
            "asset_waveform",
            None,
            None,
            serde_json::json!({"asset_id": asset_id}),
        )
        .await?;
    Ok(response(WaveformStatus::Pending, Some(job.id), None))
}

fn bucket_size(duration_ms: i64) -> i64 {
    ((duration_ms + MAX_BUCKETS * 100 - 1) / (MAX_BUCKETS * 100)).max(1) * 100
}

fn measure_peaks(pcm: &[u8], bucket_ms: i64) -> Result<Vec<u8>> {
    ensure!(
        pcm.len().is_multiple_of(2),
        "Audio decoder returned an incomplete sample."
    );
    let samples_per_bucket = (bucket_ms * SAMPLE_RATE / 1000) as usize;
    let mut peaks = Vec::with_capacity(pcm.len() / (samples_per_bucket * 2) + 1);
    for bucket in pcm.chunks(samples_per_bucket * 2) {
        let (samples, remainder) = bucket.as_chunks::<2>();
        ensure!(
            remainder.is_empty(),
            "Audio decoder returned an incomplete sample."
        );
        let count = samples.len();
        let sum = samples
            .iter()
            .map(|sample| {
                let value = i16::from_le_bytes([sample[0], sample[1]]) as f64 / 32768.0;
                value * value
            })
            .sum::<f64>();
        let normalized = ((sum / count as f64).sqrt() * 4.0).min(1.0);
        peaks.push((normalized * 255.0).round() as u8);
    }
    Ok(peaks)
}

async fn decode_peaks(
    state: &AppState,
    source: &Path,
    duration_ms: i64,
    cancellation: &CancellationToken,
) -> Result<(i64, Vec<u8>)> {
    let pcm = tools::capture_managed(
        state,
        "ffmpeg",
        "ffmpeg",
        &[
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-vn".into(),
            "-ac".into(),
            "1".into(),
            "-ar".into(),
            SAMPLE_RATE.to_string(),
            "-t".into(),
            format!("{:.3}", duration_ms as f64 / 1000.0),
            "-f".into(),
            "s16le".into(),
            "-acodec".into(),
            "pcm_s16le".into(),
            "pipe:1".into(),
        ],
        cancellation,
    )
    .await?;
    ensure!(!pcm.is_empty(), "The source audio could not be decoded.");
    ensure!(
        pcm.len() <= 40 * 1024 * 1024,
        "The decoded audio exceeded its limit."
    );
    ensure!(!cancellation.is_cancelled(), "Job cancelled.");
    let bucket_ms = bucket_size(duration_ms);
    let peaks = measure_peaks(&pcm, bucket_ms)?;
    ensure!(peaks.len() <= MAX_BUCKETS as usize + 1);
    Ok((bucket_ms, peaks))
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project_id = job
        .project_id
        .as_deref()
        .context("Missing waveform project")?;
    let project = db::project(&state.db, project_id).await?;
    ensure!(project.has_audio, "This source has no audio.");
    ensure!(
        (1..=MAX_DURATION_MS).contains(&project.duration_ms),
        "This source is too long for a timeline waveform."
    );
    let source_id = project
        .preview_asset_id
        .as_deref()
        .unwrap_or(&project.asset_id);
    let (source, _, kind) = db::asset(&state.db, &state.root, source_id).await?;
    ensure!(kind == "video", "The source preview is not video.");
    let (bucket_ms, peaks) =
        decode_peaks(state, &source, project.duration_ms, cancellation).await?;
    sqlx::query(
        "INSERT INTO source_waveforms(project_id, bucket_ms, peaks) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET bucket_ms = excluded.bucket_ms, peaks = excluded.peaks",
    )
    .bind(project_id)
    .bind(bucket_ms)
    .bind(peaks)
    .execute(&state.db)
    .await?;
    state
        .progress(job, "waveform", 1.0, "Prepared source audio waveform.")
        .await?;
    Ok(())
}

pub async fn generate_asset(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let asset_id = job.payload["asset_id"]
        .as_str()
        .context("Missing waveform asset")?;
    let (source, duration_ms) = asset_audio_source(state, asset_id)
        .await?
        .context("This asset has no available audio")?;
    ensure!((1..=MAX_DURATION_MS).contains(&duration_ms));
    let (bucket_ms, peaks) = decode_peaks(state, &source, duration_ms, cancellation).await?;
    sqlx::query(
        "INSERT INTO asset_waveforms(asset_id, bucket_ms, peaks) VALUES (?, ?, ?) ON CONFLICT(asset_id) DO UPDATE SET bucket_ms = excluded.bucket_ms, peaks = excluded.peaks",
    )
    .bind(asset_id)
    .bind(bucket_ms)
    .bind(peaks)
    .execute(&state.db)
    .await?;
    state
        .progress(job, "waveform", 1.0, "Prepared layer audio waveform.")
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waveform_uses_real_sample_energy_and_keeps_the_tail() {
        let mut pcm = vec![0; 40];
        for _ in 0..20 {
            pcm.extend_from_slice(&8192_i16.to_le_bytes());
        }
        pcm.extend_from_slice(&4096_i16.to_le_bytes());
        let peaks = measure_peaks(&pcm, 100).unwrap();
        assert_eq!(peaks.len(), 3);
        assert_eq!(peaks[0], 0);
        assert!(peaks[1] > peaks[2]);
        assert!(peaks[2] > 0);
        assert_eq!(bucket_size(30_000), 100);
        assert!(bucket_size(MAX_DURATION_MS) >= 7_200);
    }
}

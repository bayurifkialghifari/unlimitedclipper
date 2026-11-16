use crate::{
    error::{ApiError, ApiResult},
    models::*,
};
use anyhow::{Context, Result};
use serde::{Serialize, de::DeserializeOwned};
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{
    path::{Path, PathBuf},
    str::FromStr,
};
use uuid::Uuid;

pub async fn connect(root: &Path) -> Result<SqlitePool> {
    tokio::fs::create_dir_all(root).await?;
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite://{}",
        root.join("studio.sqlite").display()
    ))?
    .create_if_missing(true)
    .foreign_keys(true)
    .journal_mode(SqliteJournalMode::Wal)
    .busy_timeout(std::time::Duration::from_secs(10));
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

fn decode<T: DeserializeOwned>(data: String) -> Result<T> {
    serde_json::from_str(&data).context("Stored document could not be read")
}

fn encode<T: Serialize>(data: &T) -> Result<String> {
    Ok(serde_json::to_string(data)?)
}

pub async fn projects(pool: &SqlitePool) -> Result<Vec<Project>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT data FROM projects ORDER BY created_at DESC")
        .fetch_all(pool)
        .await?;
    rows.into_iter().map(|row| decode(row.0)).collect()
}

pub async fn project(pool: &SqlitePool, id: &str) -> ApiResult<Project> {
    let row: Option<(String,)> = sqlx::query_as("SELECT data FROM projects WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    decode(row.ok_or_else(ApiError::not_found)?.0).map_err(Into::into)
}

pub async fn save_project(pool: &SqlitePool, project: &Project) -> Result<()> {
    sqlx::query("INSERT INTO projects(id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
        .bind(&project.id).bind(encode(project)?).bind(project.created_at).execute(pool).await?;
    Ok(())
}

pub async fn clips(pool: &SqlitePool, project_id: &str) -> Result<Vec<Clip>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT data FROM clips WHERE project_id = ? ORDER BY created_at, id")
            .bind(project_id)
            .fetch_all(pool)
            .await?;
    rows.into_iter().map(|row| decode(row.0)).collect()
}

pub async fn clip(pool: &SqlitePool, id: &str) -> ApiResult<Clip> {
    let row: Option<(String,)> = sqlx::query_as("SELECT data FROM clips WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    decode(row.ok_or_else(ApiError::not_found)?.0).map_err(Into::into)
}

pub async fn insert_clip(pool: &SqlitePool, clip: &Clip) -> Result<()> {
    sqlx::query(
        "INSERT INTO clips(id, project_id, revision, data, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&clip.id)
    .bind(&clip.project_id)
    .bind(clip.revision)
    .bind(encode(clip)?)
    .bind(clip.created_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_clip(pool: &SqlitePool, clip: &Clip, expected_revision: i64) -> ApiResult<()> {
    let result =
        sqlx::query("UPDATE clips SET revision = ?, data = ? WHERE id = ? AND revision = ?")
            .bind(clip.revision)
            .bind(encode(clip)?)
            .bind(&clip.id)
            .bind(expected_revision)
            .execute(pool)
            .await?;
    if result.rows_affected() != 1 {
        return Err(ApiError::conflict());
    }
    Ok(())
}

pub async fn commit_tracking(
    pool: &SqlitePool,
    clip: &Clip,
    expected_revision: i64,
    job: &mut Job,
) -> ApiResult<()> {
    let mut checkpoint = job.clone();
    checkpoint.payload["tracking_committed_revision"] = serde_json::json!(clip.revision);
    let mut transaction = pool.begin().await?;
    let result =
        sqlx::query("UPDATE clips SET revision = ?, data = ? WHERE id = ? AND revision = ?")
            .bind(clip.revision)
            .bind(encode(clip)?)
            .bind(&clip.id)
            .bind(expected_revision)
            .execute(&mut *transaction)
            .await?;
    if result.rows_affected() != 1 {
        return Err(ApiError::conflict());
    }
    let result = sqlx::query("UPDATE jobs SET status = ?, data = ? WHERE id = ?")
        .bind(&checkpoint.status)
        .bind(encode(&checkpoint)?)
        .bind(&checkpoint.id)
        .execute(&mut *transaction)
        .await?;
    if result.rows_affected() != 1 {
        return Err(ApiError::not_found());
    }
    // A committed marker must prove that this job won the optimistic edit transaction.
    transaction.commit().await?;
    *job = checkpoint;
    Ok(())
}

pub async fn jobs(pool: &SqlitePool) -> Result<Vec<Job>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT data FROM jobs ORDER BY created_at DESC LIMIT 200")
            .fetch_all(pool)
            .await?;
    rows.into_iter().map(|row| decode(row.0)).collect()
}

pub async fn latest_auto_edit_job(
    pool: &SqlitePool,
    project_id: &str,
    clip_id: &str,
) -> Result<Option<Job>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE project_id = ? AND json_extract(data, '$.clip_id') = ? AND json_extract(data, '$.kind') = 'auto_edit' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(clip_id)
    .fetch_optional(pool)
    .await?;
    row.map(|(data,)| decode(data)).transpose()
}

pub async fn latest_card_narration_job(
    pool: &SqlitePool,
    project_id: &str,
    clip_id: &str,
    kind: &str,
) -> Result<Option<Job>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE project_id = ? AND json_extract(data, '$.clip_id') = ? AND json_extract(data, '$.kind') = 'card_narration' AND json_extract(data, '$.payload.card_kind') = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(clip_id)
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    row.map(|(data,)| decode(data)).transpose()
}

pub async fn active_jobs(pool: &SqlitePool) -> Result<Vec<Job>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT data FROM jobs WHERE status IN ('queued', 'running', 'cancelling') ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(|row| decode(row.0)).collect()
}

pub async fn job(pool: &SqlitePool, id: &str) -> ApiResult<Job> {
    let row: Option<(String,)> = sqlx::query_as("SELECT data FROM jobs WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    decode(row.ok_or_else(ApiError::not_found)?.0).map_err(Into::into)
}

pub async fn save_job(pool: &SqlitePool, job: &Job) -> Result<()> {
    sqlx::query("INSERT INTO jobs(id, project_id, status, data, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data")
        .bind(&job.id).bind(&job.project_id).bind(&job.status).bind(encode(job)?).bind(job.created_at)
        .execute(pool).await?;
    Ok(())
}

pub async fn next_job(pool: &SqlitePool) -> Result<Option<Job>> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT data FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1")
            .fetch_optional(pool)
            .await?;
    row.map(|row| decode(row.0)).transpose()
}

pub async fn register_asset(
    pool: &SqlitePool,
    relative_path: &str,
    name: &str,
    kind: &str,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO assets(id, relative_path, name, kind, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(relative_path) DO NOTHING")
        .bind(&id).bind(relative_path).bind(name).bind(kind).bind(now_ms()).execute(pool).await?;
    let row: (String,) = sqlx::query_as("SELECT id FROM assets WHERE relative_path = ?")
        .bind(relative_path)
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

pub async fn asset(
    pool: &SqlitePool,
    root: &Path,
    id: &str,
) -> ApiResult<(PathBuf, String, String)> {
    let row = sqlx::query("SELECT relative_path, name, kind FROM assets WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let relative: String = row.get(0);
    let path = root.join(relative);
    let canonical = tokio::fs::canonicalize(&path).await?;
    let canonical_root = tokio::fs::canonicalize(root).await?;
    if !canonical.starts_with(canonical_root) {
        return Err(ApiError::bad_request(
            "Asset path is outside managed storage.",
        ));
    }
    Ok((path, row.get(1), row.get(2)))
}

pub async fn exports(pool: &SqlitePool) -> Result<Vec<Export>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT data FROM exports ORDER BY created_at DESC")
        .fetch_all(pool)
        .await?;
    rows.into_iter().map(|row| decode(row.0)).collect()
}

pub async fn save_export(pool: &SqlitePool, export: &Export) -> Result<()> {
    sqlx::query(
        "INSERT INTO exports(id, project_id, clip_id, data, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&export.id)
    .bind(&export.project_id)
    .bind(&export.clip_id)
    .bind(encode(export)?)
    .bind(export.created_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn settings(pool: &SqlitePool) -> Result<Settings> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT data FROM settings WHERE key = 'preferences'")
            .fetch_optional(pool)
            .await?;
    row.map(|row| decode(row.0))
        .transpose()
        .map(|value| value.unwrap_or_default())
}

pub async fn save_settings(pool: &SqlitePool, settings: &Settings) -> Result<()> {
    sqlx::query("INSERT INTO settings(key, data) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data")
        .bind(encode(settings)?).execute(pool).await?;
    Ok(())
}

pub async fn remove_unused_assets(
    pool: &SqlitePool,
    root: &Path,
    candidates: Vec<String>,
) -> Result<()> {
    let mut referenced = std::collections::HashSet::new();
    for project in projects(pool).await? {
        referenced.insert(project.asset_id);
        referenced.extend(project.preview_asset_id);
        referenced.extend(project.thumbnail_id);
        for clip in clips(pool, &project.id).await? {
            referenced.extend(clip.document.watermark.asset_id);
            for card in [&clip.document.intro_card, &clip.document.outro_card]
                .into_iter()
                .flatten()
            {
                if let Some(narration) = &card.narration {
                    referenced.insert(narration.asset_id.clone());
                }
            }
            referenced.extend(
                clip.document
                    .visual_layers
                    .into_iter()
                    .filter_map(|layer| layer.asset_id),
            );
            referenced.extend(
                clip.document
                    .audio_layers
                    .into_iter()
                    .filter_map(|layer| layer.asset_id),
            );
        }
    }
    for export in exports(pool).await? {
        referenced.extend([export.asset_id, export.ass_asset_id, export.srt_asset_id]);
    }
    let frames: Vec<(String,)> = sqlx::query_as("SELECT asset_id FROM storyboard_frames")
        .fetch_all(pool)
        .await?;
    referenced.extend(frames.into_iter().map(|(asset_id,)| asset_id));
    let project_media: Vec<(String, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT asset_id, thumbnail_id, preview_asset_id FROM project_media")
            .fetch_all(pool)
            .await?;
    for (asset_id, thumbnail_id, preview_asset_id) in project_media {
        referenced.insert(asset_id);
        referenced.extend(thumbnail_id);
        referenced.extend(preview_asset_id);
    }
    let canonical_root = tokio::fs::canonicalize(root).await?;
    let checkpoint_data: Vec<(String,)> =
        sqlx::query_as("SELECT data FROM jobs WHERE status != 'completed'")
            .fetch_all(pool)
            .await?;
    for (data,) in checkpoint_data {
        collect_asset_ids(&serde_json::from_str(&data)?, &mut referenced);
    }
    for id in candidates {
        if referenced.contains(&id) {
            continue;
        }
        let row: Option<(String,)> =
            sqlx::query_as("SELECT relative_path FROM assets WHERE id = ?")
                .bind(&id)
                .fetch_optional(pool)
                .await?;
        if let Some((relative,)) = row {
            let path = root.join(relative);
            if path.exists() {
                let canonical = tokio::fs::canonicalize(&path).await?;
                anyhow::ensure!(
                    canonical.starts_with(&canonical_root) && canonical.is_file(),
                    "Asset cleanup escaped managed storage."
                );
                tokio::fs::remove_file(canonical).await?;
            }
            sqlx::query("DELETE FROM assets WHERE id = ?")
                .bind(id)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

fn collect_asset_ids(
    value: &serde_json::Value,
    referenced: &mut std::collections::HashSet<String>,
) {
    match value {
        serde_json::Value::Object(object) => {
            for (key, value) in object {
                if key == "asset_id" || key.ends_with("_asset_id") {
                    if let Some(id) = value.as_str() {
                        referenced.insert(id.to_string());
                    }
                } else {
                    collect_asset_ids(value, referenced);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                collect_asset_ids(value, referenced);
            }
        }
        _ => {}
    }
}

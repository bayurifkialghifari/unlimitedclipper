use crate::{model_manager, models::*, state::AppState};
use anyhow::{Context, Result, ensure};
use futures_util::StreamExt;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use utoipa::ToSchema;

#[derive(Deserialize)]
struct PackManifest {
    id: String,
    name: String,
    revision: String,
    license: String,
    source: String,
    files: Vec<PackFile>,
}

#[derive(Deserialize)]
struct PackFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, serde::Serialize, ToSchema)]
pub struct NarrationPackStatus {
    pub id: String,
    pub name: String,
    pub ready: bool,
    pub size_bytes: u64,
    pub downloaded_bytes: u64,
    pub license: String,
    pub source: String,
}

fn manifest() -> PackManifest {
    serde_json::from_str(include_str!("../../../resources/narration-pack.json"))
        .expect("The embedded narration manifest is valid")
}

fn specification(manifest: &PackManifest, file: &PackFile) -> ModelSpec {
    ModelSpec {
        id: format!("{}:{}", manifest.id, file.path),
        name: manifest.name.clone(),
        kind: "narration".into(),
        filename: file.path.clone(),
        url: format!(
            "{}/resolve/{}/{}",
            manifest.source, manifest.revision, file.path
        ),
        size: file.size,
        sha256: file.sha256.clone(),
        license: manifest.license.clone(),
    }
}

fn pack_directory(state: &AppState) -> std::path::PathBuf {
    state.models_root().join("supertonic-3")
}

async fn modified_ns(path: &std::path::Path) -> String {
    tokio::fs::metadata(path)
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_nanos().to_string())
        .unwrap_or_default()
}

async fn file_ready(path: &std::path::Path, spec: &ModelSpec) -> bool {
    let size = tokio::fs::metadata(path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    if size != spec.size {
        return false;
    }
    let marker: serde_json::Value = serde_json::from_slice(
        &tokio::fs::read(path.with_extension("verified"))
            .await
            .unwrap_or_default(),
    )
    .unwrap_or_default();
    marker["sha256"] == spec.sha256 && marker["modified_ns"] == modified_ns(path).await
}

pub async fn status(state: &AppState) -> NarrationPackStatus {
    let manifest = manifest();
    let directory = pack_directory(state);
    let mut downloaded_bytes = 0;
    let mut ready = true;
    let mut size_bytes = 0;
    for file in &manifest.files {
        let spec = specification(&manifest, file);
        let path = directory.join(&file.path);
        size_bytes += file.size;
        if file_ready(&path, &spec).await {
            downloaded_bytes += file.size;
        } else {
            ready = false;
            downloaded_bytes += tokio::fs::metadata(path.with_extension("part"))
                .await
                .map(|metadata| metadata.len().min(file.size))
                .unwrap_or_default();
        }
    }
    NarrationPackStatus {
        id: manifest.id,
        name: manifest.name,
        ready,
        size_bytes,
        downloaded_bytes,
        license: manifest.license,
        source: manifest.source,
    }
}

pub async fn ready_path(state: &AppState) -> Result<std::path::PathBuf> {
    ensure!(
        status(state).await.ready,
        "Install the local narration pack in Settings before generating speech."
    );
    Ok(pack_directory(state))
}

async fn download_file(
    state: &AppState,
    job: &mut Job,
    spec: &ModelSpec,
    destination: &std::path::Path,
    cancellation: &CancellationToken,
    completed: u64,
    total: u64,
) -> Result<()> {
    if destination.is_file()
        && model_manager::verify(destination, spec, cancellation)
            .await
            .is_ok()
    {
        model_manager::mark_verified(destination, spec).await?;
        job.payload["downloaded_bytes"] = serde_json::json!(completed + spec.size);
        return Ok(());
    }
    let partial = destination.with_extension("part");
    let mut offset = tokio::fs::metadata(&partial)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    if offset > spec.size {
        tokio::fs::remove_file(&partial).await?;
        offset = 0;
    }
    if offset < spec.size {
        let mut request = state.client.get(&spec.url);
        if offset > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
        }
        let response = tokio::select! {
            response = request.send() => response?.error_for_status()?,
            _ = cancellation.cancelled() => anyhow::bail!("Narration download cancelled."),
        };
        let append = offset > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if append {
            let range = response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            ensure!(
                range.starts_with(&format!("bytes {offset}-")),
                "Narration download returned the wrong byte range."
            );
        } else {
            offset = 0;
        }
        let mut output = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&partial)
            .await?;
        let mut stream = response.bytes_stream();
        let mut reported = offset;
        while let Some(chunk) = tokio::select! {
            chunk = stream.next() => chunk,
            _ = cancellation.cancelled() => anyhow::bail!("Narration download cancelled."),
        } {
            let chunk = chunk?;
            output.write_all(&chunk).await?;
            offset += chunk.len() as u64;
            ensure!(
                offset <= spec.size,
                "Narration download exceeded its expected size."
            );
            if offset - reported >= 2 * 1024 * 1024 {
                reported = offset;
                job.payload["downloaded_bytes"] = serde_json::json!(completed + offset);
                state
                    .progress(
                        job,
                        "download",
                        (completed + offset) as f64 / total as f64,
                        &format!("Downloading {}.", spec.filename),
                    )
                    .await?;
            }
        }
        output.sync_all().await?;
    }
    if let Err(error) = model_manager::verify(&partial, spec, cancellation).await {
        if !cancellation.is_cancelled() {
            tokio::fs::remove_file(&partial).await?;
        }
        return Err(error);
    }
    if destination.exists() {
        tokio::fs::remove_file(destination).await?;
    }
    tokio::fs::rename(&partial, destination).await?;
    model_manager::mark_verified(destination, spec).await?;
    Ok(())
}

pub async fn download(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    state.require_writable_models()?;
    let manifest = manifest();
    ensure!(
        job.payload["revision"] == manifest.revision,
        "The narration manifest changed. Start a new download."
    );
    let total = manifest.files.iter().map(|file| file.size).sum::<u64>();
    let mut complete = 0_u64;
    let directory = pack_directory(state);
    for file in &manifest.files {
        let destination = directory.join(&file.path);
        tokio::fs::create_dir_all(destination.parent().context("Missing pack directory")?).await?;
        let spec = specification(&manifest, file);
        download_file(
            state,
            job,
            &spec,
            &destination,
            cancellation,
            complete,
            total,
        )
        .await?;
        complete += file.size;
        job.payload["downloaded_bytes"] = serde_json::json!(complete);
        state
            .progress(
                job,
                "download",
                complete as f64 / total as f64,
                &format!(
                    "Verified {} of {} narration files.",
                    file.path,
                    manifest.files.len()
                ),
            )
            .await?;
    }
    ensure!(
        status(state).await.ready,
        "Narration pack verification did not complete."
    );
    Ok(())
}

pub fn revision() -> String {
    manifest().revision
}

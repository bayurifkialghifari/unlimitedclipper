use crate::{models::*, state::AppState};
use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

pub async fn statuses(state: &AppState) -> Result<Vec<ModelStatus>> {
    let mut result = Vec::new();
    for spec in model_specs() {
        let path = state.root.join("models").join(&spec.filename);
        let size = tokio::fs::metadata(&path)
            .await
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        let marker: serde_json::Value = serde_json::from_slice(
            &tokio::fs::read(path.with_extension("verified"))
                .await
                .unwrap_or_default(),
        )
        .unwrap_or_default();
        let ready = size == spec.size
            && marker["sha256"] == spec.sha256
            && marker["modified_ns"] == modified_ns(&path).await?;
        let partial = tokio::fs::metadata(path.with_extension("part"))
            .await
            .map(|metadata| metadata.len())
            .unwrap_or_default();
        result.push(ModelStatus {
            spec,
            ready,
            downloaded_bytes: if ready { size } else { partial },
        });
    }
    Ok(result)
}

async fn modified_ns(path: &std::path::Path) -> Result<String> {
    let time = tokio::fs::metadata(path)
        .await
        .and_then(|metadata| metadata.modified());
    Ok(time
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|time| time.as_nanos().to_string())
        .unwrap_or_default())
}

pub async fn mark_verified(path: &std::path::Path, spec: &ModelSpec) -> Result<()> {
    let marker = serde_json::json!({"sha256":spec.sha256,"size":spec.size,"modified_ns":modified_ns(path).await?});
    tokio::fs::write(
        path.with_extension("verified"),
        serde_json::to_vec(&marker)?,
    )
    .await?;
    Ok(())
}

pub async fn model_path(state: &AppState, id: &str) -> Result<std::path::PathBuf> {
    let model = statuses(state)
        .await?
        .into_iter()
        .find(|model| model.spec.id == id)
        .context("Unknown local model")?;
    if !model.ready {
        bail!(
            "Install {} in Settings before starting this operation.",
            model.spec.name
        );
    }
    Ok(state.root.join("models").join(model.spec.filename))
}

pub async fn verify(
    path: &std::path::Path,
    spec: &ModelSpec,
    cancellation: &CancellationToken,
) -> Result<()> {
    if tokio::fs::metadata(path).await?.len() != spec.size {
        bail!("Model size did not match the published manifest.");
    }
    let mut file = tokio::fs::File::open(path).await?;
    let mut buffer = vec![0; 1024 * 1024];
    let mut hash = Sha256::new();
    loop {
        if cancellation.is_cancelled() {
            bail!("Job cancelled.");
        }
        let count = file.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if hex::encode(hash.finalize()) != spec.sha256 {
        bail!("Model checksum failed. Retry the download or choose the correct model file.");
    }
    Ok(())
}

pub async fn download(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let id = job.payload["model_id"]
        .as_str()
        .context("Missing model selection")?;
    let spec = model_specs()
        .into_iter()
        .find(|spec| spec.id == id)
        .context("Unknown local model")?;
    let final_path = state.root.join("models").join(&spec.filename);
    if final_path.is_file() {
        state
            .progress(
                job,
                "verify",
                0.0,
                "Verifying the installed model checksum.",
            )
            .await?;
    }
    if final_path.is_file() && verify(&final_path, &spec, cancellation).await.is_ok() {
        mark_verified(&final_path, &spec).await?;
        return Ok(());
    }
    let partial = final_path.with_extension("part");
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
            _ = cancellation.cancelled() => bail!("Job cancelled."),
        };
        let append = offset > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if append {
            let expected = format!("bytes {offset}-");
            let content_range = response
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            anyhow::ensure!(
                content_range.starts_with(&expected),
                "Download server returned the wrong byte range."
            );
        } else {
            offset = 0;
        }
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&partial)
            .await?;
        let mut stream = response.bytes_stream();
        let mut reported = offset;
        loop {
            let chunk = tokio::select! {
                chunk = stream.next() => chunk,
                _ = cancellation.cancelled() => bail!("Job cancelled."),
            };
            let Some(chunk) = chunk else { break };
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            offset += chunk.len() as u64;
            anyhow::ensure!(
                offset <= spec.size,
                "Model download exceeded its expected size."
            );
            if offset - reported >= 2 * 1024 * 1024 {
                reported = offset;
                state
                    .progress(
                        job,
                        "download",
                        offset as f64 / spec.size as f64 * 0.95,
                        &format!(
                            "Downloading {}: {} / {} MB",
                            spec.name,
                            offset / 1_000_000,
                            spec.size / 1_000_000
                        ),
                    )
                    .await?;
            }
        }
        file.sync_all().await?;
    }
    state
        .progress(job, "verify", 0.96, "Verifying the model checksum.")
        .await?;
    if let Err(error) = verify(&partial, &spec, cancellation).await {
        if !cancellation.is_cancelled() {
            let _ = tokio::fs::remove_file(&partial).await;
        }
        return Err(error);
    }
    if final_path.exists() {
        tokio::fs::remove_file(&final_path).await?;
    }
    tokio::fs::rename(&partial, &final_path).await?;
    mark_verified(&final_path, &spec).await?;
    Ok(())
}

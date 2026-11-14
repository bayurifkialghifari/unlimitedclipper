use crate::state::AppState;
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;
use utoipa::ToSchema;

#[derive(Clone, Deserialize)]
pub struct PackFile {
    pub filename: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Deserialize)]
pub struct PackManifest {
    pub version: u32,
    pub files: Vec<PackFile>,
}

#[derive(Serialize, ToSchema)]
pub struct PackStatus {
    pub ready: bool,
    pub size_bytes: u64,
    pub languages: Vec<String>,
}

pub fn manifest() -> PackManifest {
    serde_json::from_str(include_str!("../../../resources/quality-models.json"))
        .expect("Embedded quality pack manifest is valid")
}

pub fn directory(state: &AppState) -> PathBuf {
    state.models_root().join("quality-v1")
}

async fn fingerprints(root: &Path) -> Result<serde_json::Value> {
    let mut records = serde_json::Map::new();
    for file in manifest().files {
        let metadata = tokio::fs::metadata(root.join(&file.filename)).await?;
        ensure!(metadata.len() == file.size, "Quality model size changed.");
        let modified = metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos();
        records.insert(
            file.filename,
            serde_json::json!({"size": file.size,
            "modified": modified.to_string(), "sha256": file.sha256}),
        );
    }
    Ok(serde_json::Value::Object(records))
}

pub async fn status(state: &AppState) -> PackStatus {
    let specification = manifest();
    let root = directory(state);
    let saved = tokio::fs::read(root.join("verified.json"))
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    let actual = fingerprints(&root).await.ok();
    PackStatus {
        ready: !specification.files.is_empty() && saved.is_some() && saved == actual,
        size_bytes: specification.files.iter().map(|file| file.size).sum(),
        languages: vec!["id".into(), "en".into()],
    }
}

pub async fn import(state: &AppState, archive: PathBuf) -> Result<()> {
    state.require_writable_models()?;
    let specification = manifest();
    ensure!(
        specification.version == 1 && !specification.files.is_empty(),
        "This application build has no verified quality pack manifest."
    );
    let parent = state.models_root();
    tokio::fs::create_dir_all(&parent).await?;
    let staging = parent.join(format!("quality-import-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir(&staging).await?;
    let output = staging.clone();
    let extracted = tokio::task::spawn_blocking(move || -> Result<()> {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&archive)?)?;
        ensure!(
            zip.len() <= specification.files.len() + 1,
            "Unexpected quality pack entries."
        );
        let mut seen = std::collections::HashSet::new();
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index)?;
            let name = entry.name().to_string();
            ensure!(
                seen.insert(name.clone()),
                "Quality pack has duplicate entries."
            );
            if name == "manifest.json" {
                ensure!(
                    entry.size() < 100_000,
                    "Quality pack manifest is too large."
                );
                continue;
            }
            let expected = specification
                .files
                .iter()
                .find(|file| file.filename == name)
                .ok_or_else(|| anyhow::anyhow!("Unexpected quality pack entry."))?;
            ensure!(
                !name.contains(['/', char::from(92)])
                    && !entry.is_dir()
                    && entry
                        .unix_mode()
                        .is_none_or(|mode| mode & 0o170000 != 0o120000)
                    && entry.size() == expected.size,
                "Invalid quality pack path or size."
            );
            let mut destination = std::fs::File::create(output.join(name))?;
            std::io::copy(&mut entry, &mut destination)?;
        }
        Ok(())
    })
    .await?;
    let result = async {
        extracted?;
        for file in manifest().files {
            let mut source = tokio::fs::File::open(staging.join(file.filename)).await?;
            let mut buffer = vec![0; 1024 * 1024];
            let mut hash = Sha256::new();
            loop {
                let length = source.read(&mut buffer).await?;
                if length == 0 {
                    break;
                }
                hash.update(&buffer[..length]);
            }
            ensure!(
                hex::encode(hash.finalize()) == file.sha256,
                "Quality pack checksum mismatch."
            );
        }
        tokio::fs::write(
            staging.join("verified.json"),
            serde_json::to_vec(&fingerprints(&staging).await?)?,
        )
        .await?;
        let active = directory(state);
        let previous = parent.join("quality-previous");
        if previous.exists() {
            tokio::fs::remove_dir_all(&previous).await?;
        }
        if active.exists() {
            tokio::fs::rename(&active, &previous).await?;
        }
        if let Err(error) = tokio::fs::rename(&staging, &active).await {
            if previous.exists() {
                tokio::fs::rename(&previous, &active).await?;
            }
            return Err(error.into());
        }
        if previous.exists() {
            tokio::fs::remove_dir_all(previous).await?;
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    if staging.exists() {
        tokio::fs::remove_dir_all(&staging).await?;
    }
    result
}

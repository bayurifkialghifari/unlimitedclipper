use crate::{db, models::*, state::AppState, tools};
use anyhow::{Context, Result};
use base64::Engine as _;
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct Envelope {
    manifest: String,
    signature: String,
}

#[derive(Deserialize)]
struct Manifest {
    version: String,
    platforms: HashMap<String, Artifact>,
}

#[derive(Deserialize)]
struct Artifact {
    url: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, Serialize, Deserialize, Default, utoipa::ToSchema)]
pub struct UpdateState {
    pub version: String,
    pub directory: String,
    pub ready: bool,
    pub previous_directory: Option<String>,
    #[serde(default)]
    pub previous_version: Option<String>,
    #[serde(default)]
    pub restart_required: bool,
}

fn trusted_key(state: &AppState) -> Result<PublicKey> {
    let key = if state.development {
        std::env::var("UC_COMPONENT_PUBLIC_KEY").ok()
    } else { None }.or_else(|| option_env!("UC_COMPONENT_PUBLIC_KEY").map(str::to_owned))
        .context("This build has no trusted component signing key. Configure the release signing key before enabling its feed.")?;
    if let Ok(key) = PublicKey::from_base64(key.trim()) {
        return Ok(key);
    }
    let decoded = base64::engine::general_purpose::STANDARD.decode(key.trim())?;
    Ok(PublicKey::decode(std::str::from_utf8(&decoded)?)?)
}

pub async fn status(state: &AppState) -> Result<UpdateState> {
    let bytes = tokio::fs::read(state.root.join("component-update.json"))
        .await
        .unwrap_or_default();
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

async fn persist(state: &AppState, update: &UpdateState) -> Result<()> {
    let path = state.root.join("component-update.json");
    let temporary = path.with_extension("tmp");
    tokio::fs::write(&temporary, serde_json::to_vec(update)?).await?;
    tokio::fs::rename(temporary, path).await?;
    state.emit("updates", None);
    Ok(())
}

async fn bounded(state: &AppState, url: &str, maximum: usize) -> Result<Vec<u8>> {
    let mut stream = state
        .client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        anyhow::ensure!(
            bytes.len() + chunk.len() <= maximum,
            "Update metadata exceeds its size limit."
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub async fn download(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let settings = db::settings(&state.db).await?;
    anyhow::ensure!(
        !settings.component_feed.is_empty(),
        "Configure a signed component update feed in Settings."
    );
    let key = trusted_key(state)?;
    let envelope: Envelope =
        serde_json::from_slice(&bounded(state, &settings.component_feed, 2 * 1024 * 1024).await?)?;
    let signature = Signature::decode(&envelope.signature)?;
    key.verify(envelope.manifest.as_bytes(), &signature, false)?;
    let manifest: Manifest = serde_json::from_str(&envelope.manifest)?;
    let version = semver::Version::parse(&manifest.version)?;
    let current = status(state).await?;
    if semver::Version::parse(&current.version).is_ok_and(|current| current >= version) {
        return Ok(());
    }
    let architecture = if cfg!(target_arch = "aarch64") {
        "windows-arm64"
    } else {
        "windows-x64"
    };
    let artifact = manifest
        .platforms
        .get(architecture)
        .context("This update does not support the current architecture.")?;
    let url = reqwest::Url::parse(&artifact.url)?;
    anyhow::ensure!(
        url.scheme() == "https"
            || state.development && url.scheme() == "http" && url.host_str() == Some("127.0.0.1"),
        "Update downloads require HTTPS."
    );
    anyhow::ensure!(
        artifact.size > 0 && artifact.size <= 2_000_000_000,
        "Invalid component package size."
    );
    tokio::fs::create_dir_all(state.root.join("components")).await?;
    let relative = format!("components/{}-{}", manifest.version, job.id);
    let directory = state.root.join(&relative);
    let archive = state.root.join("temporary").join(format!("{}.zip", job.id));
    let mut stream = state
        .client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes_stream();
    let mut file = tokio::fs::File::create(&archive).await?;
    let mut size = 0_u64;
    let mut reported = 0_u64;
    let mut hash = Sha256::new();
    while let Some(chunk) = tokio::select! { chunk = stream.next() => chunk, _ = cancellation.cancelled() => anyhow::bail!("Job cancelled.") }
    {
        let chunk = chunk?;
        size += chunk.len() as u64;
        anyhow::ensure!(
            size <= artifact.size,
            "Component package exceeds its expected size."
        );
        hash.update(&chunk);
        file.write_all(&chunk).await?;
        if size - reported >= 2 * 1024 * 1024 {
            reported = size;
            state
                .progress(
                    job,
                    "download",
                    size as f64 / artifact.size as f64 * 0.8,
                    "Downloading the signed media toolchain update.",
                )
                .await?;
        }
    }
    file.sync_all().await?;
    drop(file);
    anyhow::ensure!(
        size == artifact.size && hex::encode(hash.finalize()) == artifact.sha256,
        "Component checksum verification failed."
    );
    let extraction_directory = directory.clone();
    let extraction_cancellation = cancellation.clone();
    tokio::task::spawn_blocking(move || -> Result<()> {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?)?;
        anyhow::ensure!(
            zip.len() <= 20_000,
            "Component archive contains too many files."
        );
        let mut expanded = 0_u64;
        for index in 0..zip.len() {
            anyhow::ensure!(!extraction_cancellation.is_cancelled(), "Job cancelled.");
            let mut entry = zip.by_index(index)?;
            let name = entry
                .enclosed_name()
                .context("Component archive contains an unsafe path.")?;
            anyhow::ensure!(
                entry
                    .unix_mode()
                    .is_none_or(|mode| mode & 0o170000 != 0o120000),
                "Component archives cannot contain symbolic links."
            );
            expanded += entry.size();
            anyhow::ensure!(
                expanded <= 4_000_000_000,
                "Expanded component package is too large."
            );
            let path = extraction_directory.join(name);
            if entry.is_dir() {
                std::fs::create_dir_all(path)?;
            } else {
                std::fs::create_dir_all(path.parent().context("Invalid archive path")?)?;
                std::io::copy(&mut entry, &mut std::fs::File::create(path)?)?;
            }
        }
        Ok(())
    })
    .await??;
    health_check(state, &directory, cancellation).await?;
    persist(
        state,
        &UpdateState {
            version: manifest.version,
            directory: relative,
            ready: true,
            previous_directory: current.previous_directory,
            previous_version: current.previous_version,
            restart_required: false,
        },
    )
    .await?;
    Ok(())
}

pub async fn activate(state: &AppState) -> Result<UpdateState> {
    let _gate = state.operation_gate.lock().await;
    anyhow::ensure!(
        state.idle().await?,
        "Finish processing and save editor changes before installing updates."
    );
    let mut update = status(state).await?;
    anyhow::ensure!(update.ready, "No verified component update is ready.");
    let directory = tokio::fs::canonicalize(state.root.join(&update.directory)).await?;
    let root = tokio::fs::canonicalize(state.root.join("components")).await?;
    anyhow::ensure!(
        directory.starts_with(root),
        "Invalid component activation path."
    );
    let active = state.root.join("active-component.json");
    let previous = tokio::fs::read_to_string(&active).await.ok();
    let previous = previous.and_then(|value| serde_json::from_str::<UpdateState>(&value).ok());
    update.previous_directory = previous.as_ref().map(|value| value.directory.clone());
    update.previous_version = previous.map(|value| value.version);
    update.ready = false;
    update.restart_required = true;
    let temporary = active.with_extension("tmp");
    tokio::fs::write(&temporary, serde_json::to_vec(&update)?).await?;
    tokio::fs::rename(temporary, active).await?;
    health_check(state, &directory, &CancellationToken::new()).await?;
    state
        .restart_required
        .store(true, std::sync::atomic::Ordering::SeqCst);
    persist(state, &update).await?;
    Ok(update)
}

pub async fn restore(state: &AppState) -> Result<()> {
    if let Ok(bytes) = tokio::fs::read(state.root.join("active-component.json")).await {
        let mut update: UpdateState = serde_json::from_slice(&bytes)?;
        let directory = tokio::fs::canonicalize(state.root.join(&update.directory)).await?;
        let root = tokio::fs::canonicalize(state.root.join("components")).await?;
        anyhow::ensure!(
            directory.starts_with(root),
            "Active toolchain escaped managed storage."
        );
        *state
            .active_tools
            .write()
            .expect("Toolchain lock is available") = Some(directory);
        update.restart_required = false;
        let temporary = state.root.join("active-component.tmp");
        tokio::fs::write(&temporary, serde_json::to_vec(&update)?).await?;
        tokio::fs::rename(temporary, state.root.join("active-component.json")).await?;
        let staged = status(state).await?;
        if !staged.ready {
            persist(state, &update).await?;
        }
    } else {
        let mut update = status(state).await?;
        if update.restart_required {
            update.restart_required = false;
            persist(state, &update).await?;
        }
    }
    Ok(())
}

pub async fn rollback(state: &AppState) -> Result<UpdateState> {
    let _gate = state.operation_gate.lock().await;
    anyhow::ensure!(
        state.idle().await?,
        "Finish processing and save edits before restoring the previous toolchain."
    );
    let current: UpdateState = serde_json::from_slice(
        &tokio::fs::read(state.root.join("active-component.json"))
            .await
            .context("There is no activated toolchain to restore.")?,
    )?;
    let previous = if let Some(relative) = &current.previous_directory {
        let directory = tokio::fs::canonicalize(state.root.join(relative)).await?;
        let root = tokio::fs::canonicalize(state.root.join("components")).await?;
        anyhow::ensure!(
            directory.starts_with(root),
            "Previous toolchain escaped managed storage."
        );
        health_check(state, &directory, &CancellationToken::new()).await?;
        Some(directory)
    } else {
        None
    };
    let active = state.root.join("active-component.json");
    let update = UpdateState {
        version: current.previous_version.unwrap_or_default(),
        directory: current.previous_directory.unwrap_or_default(),
        restart_required: true,
        ..UpdateState::default()
    };
    if previous.is_some() {
        let temporary = active.with_extension("tmp");
        tokio::fs::write(&temporary, serde_json::to_vec(&update)?).await?;
        tokio::fs::rename(temporary, active).await?;
    } else if active.exists() {
        tokio::fs::remove_file(active).await?;
    }
    state
        .restart_required
        .store(true, std::sync::atomic::Ordering::SeqCst);
    persist(state, &update).await?;
    Ok(update)
}

async fn health_check(
    state: &AppState,
    directory: &std::path::Path,
    cancellation: &CancellationToken,
) -> Result<()> {
    let mut candidate = state.clone();
    candidate.tools = directory.to_path_buf();
    candidate.active_tools = std::sync::Arc::new(std::sync::RwLock::new(None));
    for (family, binary, argument) in [
        ("ffmpeg", "ffmpeg", "-version"),
        ("ffmpeg", "ffprobe", "-version"),
        ("yt-dlp", "yt-dlp", "--version"),
        ("deno", "deno", "--version"),
        ("whisper", "whisper-cli", "--help"),
        ("llama", "llama-completion", "--version"),
    ] {
        let executable = tools::executable(&candidate, family, binary)?;
        verify_architecture(&executable).await?;
        tools::capture(&executable, &[argument.into()], cancellation).await?;
    }
    anyhow::ensure!(
        candidate.tools.join("yunet.onnx").is_file()
            && candidate
                .tools
                .join("onnxruntime/onnxruntime.dll")
                .is_file(),
        "Updated face detector is missing."
    );
    verify_architecture(&candidate.tools.join("onnxruntime/onnxruntime.dll")).await?;

    Ok(())
}

async fn verify_architecture(path: &std::path::Path) -> Result<()> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut header = [0_u8; 64];
    file.read_exact(&mut header).await?;
    anyhow::ensure!(&header[..2] == b"MZ", "Component is not a Windows binary.");
    let offset = u32::from_le_bytes(header[60..64].try_into()?);
    file.seek(std::io::SeekFrom::Start(offset as u64)).await?;
    let mut signature = [0_u8; 6];
    file.read_exact(&mut signature).await?;
    let expected = if cfg!(target_arch = "aarch64") {
        0xaa64
    } else {
        0x8664
    };
    anyhow::ensure!(
        signature[..4] == [80, 69, 0, 0]
            && u16::from_le_bytes([signature[4], signature[5]]) == expected,
        "Component binary does not match the current architecture."
    );
    Ok(())
}

use crate::{models::Job, state::AppState};
use anyhow::{Context, Result, bail};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
};
use tokio_util::sync::CancellationToken;

pub fn executable(state: &AppState, family: &str, name: &str) -> Result<PathBuf> {
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let candidate = state
        .tools_root()
        .join(family)
        .join(format!("{name}{suffix}"));
    if candidate.is_file() {
        return Ok(candidate);
    }
    let legacy = state.tools_root().join(format!("{name}{suffix}"));
    if legacy.is_file() {
        return Ok(legacy);
    }
    bail!("{name} is missing. Run the toolchain setup or repair the application installation.")
}

pub fn available(state: &AppState, family: &str, name: &str) -> bool {
    match &state.native_tools {
        Some(tools) => tools.supports(name),
        None => executable(state, family, name).is_ok(),
    }
}

pub fn require_native_job(state: &AppState, kind: &str) -> Result<()> {
    let Some(tools) = &state.native_tools else {
        return Ok(());
    };
    let required: &[&str] = match kind {
        "import" | "export" | "preview" => &["ffmpeg", "ffprobe"],
        "generate" => &["ffmpeg", "whisper-cli", "llama-completion"],
        "captions" => &["ffmpeg", "whisper-cli"],
        "title" | "assess" => &["llama-completion"],
        "youtube" => &["yt-dlp", "deno", "ffmpeg", "ffprobe"],
        "track" | "model" | "component_update" | "auto_edit" => {
            bail!("This operation is unavailable in the current Android build.");
        }
        _ => &[],
    };
    for name in required {
        anyhow::ensure!(
            tools.supports(name),
            "{name} is unavailable in this Android build."
        );
    }
    Ok(())
}

pub async fn capture_managed(
    state: &AppState,
    family: &str,
    name: &str,
    args: &[String],
    cancellation: &CancellationToken,
) -> Result<Vec<u8>> {
    if let Some(tools) = &state.native_tools {
        anyhow::ensure!(
            tools.supports(name),
            "{name} is unavailable in this native build."
        );
        let arguments = if name == "ffmpeg" {
            crate::native::media_arguments(args)
        } else {
            args.to_vec()
        };
        return tools
            .execute(name.into(), arguments, None, cancellation.clone())
            .await;
    }
    capture(&executable(state, family, name)?, args, cancellation).await
}

pub async fn capture(
    executable: &Path,
    args: &[String],
    cancellation: &CancellationToken,
) -> Result<Vec<u8>> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .with_context(|| format!("Could not start {}", executable.display()))?;
    #[cfg(windows)]
    let _job_object = attach_job(&child)?;
    let stdout = child
        .stdout
        .take()
        .context("Process stdout is unavailable")?;
    let stderr = child
        .stderr
        .take()
        .context("Process stderr is unavailable")?;
    let stdout_reader = tokio::spawn(async move {
        let mut output = Vec::new();
        stdout
            .take(128 * 1024 * 1024)
            .read_to_end(&mut output)
            .await?;
        Ok::<_, std::io::Error>(output)
    });
    let stderr_reader = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut tail = String::new();
        while let Some(line) = reader.next_line().await? {
            tail.push_str(&line);
            tail.push('\n');
            if tail.len() > 8192 {
                let boundary = tail
                    .char_indices()
                    .find(|(index, _)| *index >= tail.len() - 8192)
                    .map(|(index, _)| index)
                    .unwrap_or(0);
                tail.drain(..boundary);
            }
        }
        Ok::<_, std::io::Error>(tail)
    });
    let status = tokio::select! {
        status = child.wait() => status?,
        _ = cancellation.cancelled() => {
            child.kill().await?;
            let _ = child.wait().await;
            bail!("Job cancelled.");
        }
    };
    let stdout = stdout_reader.await??;
    let stderr = stderr_reader.await??;
    if !status.success() {
        bail!(
            "{} failed: {}",
            executable.file_name().unwrap_or_default().to_string_lossy(),
            stderr.trim()
        );
    }
    Ok(stdout)
}

pub async fn ffmpeg_progress(
    state: &AppState,
    job: &mut Job,
    args: &[String],
    duration_ms: i64,
    cancellation: &CancellationToken,
) -> Result<()> {
    if state.native_tools.is_some() {
        return native_ffmpeg_progress(state, job, args, duration_ms, cancellation).await;
    }
    let binary = executable(state, "ffmpeg", "ffmpeg")?;
    let mut command = Command::new(&binary);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn()?;
    #[cfg(windows)]
    let _job_object = attach_job(&child)?;
    let mut lines = BufReader::new(child.stdout.take().context("Missing render progress")?).lines();
    let stderr = child.stderr.take().context("Missing render error stream")?;
    let stderr_reader = tokio::spawn(async move {
        let mut data = Vec::new();
        stderr.take(1024 * 1024).read_to_end(&mut data).await?;
        Ok::<_, std::io::Error>(String::from_utf8_lossy(&data).into_owned())
    });
    let mut last_progress = 0.0;
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => {
                child.kill().await?;
                let _ = child.wait().await;
                bail!("Job cancelled.");
            }
            line = lines.next_line() => {
                match line? {
                    Some(line) => {
                        if let Some(value) = line.strip_prefix("out_time_us=") {
                            let elapsed_ms = value.parse::<f64>().unwrap_or_default() / 1000.0;
                            let progress = (elapsed_ms / duration_ms.max(1) as f64).clamp(0.0, 0.99);
                            if progress - last_progress >= 0.01 {
                                last_progress = progress;
                                if job.kind == "export" {
                                    let count = job.payload["snapshots"].as_array().map_or(1, Vec::len).max(1) as f64;
                                    let index = job.payload["render_index"].as_u64().unwrap_or(0) as f64;
                                    let batch_progress = 0.03 + (index + progress) / count * 0.95;
                                    state.progress(job, "render", batch_progress, "Rendering the saved clip revision.").await?;
                                } else {
                                    state.progress(job, "proxy", 0.5 + progress * 0.45, "Preparing a browser-compatible video preview.").await?;
                                }
                            }
                        }
                    }
                    None => break,
                }
            }
        }
    }
    let status = child.wait().await?;
    let stderr = stderr_reader.await??;
    if !status.success() {
        bail!("Render failed: {}", stderr.trim());
    }
    Ok(())
}

pub async fn downloader_progress(
    state: &AppState,
    job: &mut Job,
    binary: &Path,
    args: &[String],
    cancellation: &CancellationToken,
) -> Result<Vec<u8>> {
    let mut command = Command::new(binary);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn()?;
    #[cfg(windows)]
    let _job_object = attach_job(&child)?;
    let (sender, mut receiver) = tokio::sync::mpsc::channel(32);
    let stdout = child.stdout.take().context("Missing download output")?;
    let stderr = child
        .stderr
        .take()
        .context("Missing download diagnostics")?;
    let output_sender = sender.clone();
    let output_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Some(line) = lines.next_line().await? {
            if output_sender.send((true, line)).await.is_err() {
                break;
            }
        }
        Ok::<_, std::io::Error>(())
    });
    let error_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Some(line) = lines.next_line().await? {
            if sender.send((false, line)).await.is_err() {
                break;
            }
        }
        Ok::<_, std::io::Error>(())
    });
    let mut output = Vec::new();
    let mut errors = std::collections::VecDeque::new();
    let mut reported = 0.0;
    loop {
        tokio::select! {
            _ = cancellation.cancelled() => {
                child.kill().await?;
                let _ = child.wait().await;
                receiver.close();
                let _ = output_task.await;
                let _ = error_task.await;
                bail!("Job cancelled.");
            }
            line = receiver.recv() => {
                let Some((stdout, line)) = line else { break };
                if let Some(progress) = line.strip_prefix("UC_PROGRESS:") {
                    let values: Vec<_> = progress.split(':').collect();
                    let downloaded = values.first().and_then(|value| value.parse::<f64>().ok());
                    let total = values.get(2).and_then(|value| value.parse::<f64>().ok())
                        .or_else(|| values.get(1).and_then(|value| value.parse::<f64>().ok()));
                    if let (Some(downloaded), Some(total)) = (downloaded, total) {
                        let progress = 0.05 + (downloaded / total.max(1.0)).clamp(0.0, 1.0) * 0.45;
                        if progress - reported >= 0.01 {
                            reported = progress;
                            state.progress(job, "download", progress, "Downloading the source with yt-dlp.").await?;
                        }
                    }
                } else if stdout {
                    anyhow::ensure!(output.len() + line.len() < 1024 * 1024, "Downloader output exceeded its limit.");
                    output.extend_from_slice(line.as_bytes());
                    output.push(10);
                } else {
                    errors.push_back(line);
                    if errors.len() > 32 { errors.pop_front(); }
                }
            }
        }
    }
    output_task.await??;
    error_task.await??;
    let status = child.wait().await?;
    anyhow::ensure!(
        status.success(),
        "Download failed: {}",
        errors.into_iter().collect::<Vec<_>>().join(" ")
    );
    Ok(output)
}

async fn native_ffmpeg_progress(
    state: &AppState,
    job: &mut Job,
    args: &[String],
    duration_ms: i64,
    cancellation: &CancellationToken,
) -> Result<()> {
    let tools = state
        .native_tools
        .as_ref()
        .context("Native media is unavailable")?;
    anyhow::ensure!(tools.supports("ffmpeg"), "Native FFmpeg is unavailable.");
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let mut execution = tools.execute(
        "ffmpeg".into(),
        crate::native::media_arguments(args),
        Some(sender),
        cancellation.clone(),
    );
    let mut last_progress = 0.0;
    let mut receiving = true;
    loop {
        tokio::select! {
            result = &mut execution => return result.map(|_| ()),
            update = receiver.recv(), if receiving => {
                let Some(update) = update else {
                    receiving = false;
                    continue;
                };
                let progress = (update.elapsed_ms as f64 / duration_ms.max(1) as f64).clamp(0.0, 0.99);
                if progress - last_progress < 0.01 {
                    continue;
                }
                last_progress = progress;
                let progress_result = if job.kind == "export" {
                    let count = job.payload["snapshots"].as_array().map_or(1, Vec::len).max(1) as f64;
                    let index = job.payload["render_index"].as_u64().unwrap_or(0) as f64;
                    state.progress(job, "render", 0.03 + (index + progress) / count * 0.95, "Rendering the saved clip revision.").await
                } else {
                    state.progress(job, "proxy", 0.5 + progress * 0.45, "Preparing a browser-compatible video preview.").await
                };
                if let Err(error) = progress_result {
                    cancellation.cancel();
                    let _ = execution.await;
                    return Err(error);
                }
            }
        }
    }
}

#[cfg(windows)]
struct ProcessJob(usize);

#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as *mut _);
        }
    }
}

#[cfg(windows)]
fn attach_job(child: &tokio::process::Child) -> Result<ProcessJob> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::{JobObjects::*, Threading::*},
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            bail!("Could not create process supervision.");
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of_val(&info) as u32,
        ) == 0
        {
            CloseHandle(job);
            bail!("Could not configure process supervision.");
        }
        let process = OpenProcess(
            PROCESS_SET_QUOTA | PROCESS_TERMINATE,
            0,
            child.id().context("Process has already stopped")?,
        );
        let attached = !process.is_null() && AssignProcessToJobObject(job, process) != 0;
        if !process.is_null() {
            CloseHandle(process);
        }
        if !attached {
            CloseHandle(job);
            bail!("Could not supervise the processing subprocess.");
        }
        Ok(ProcessJob(job as usize))
    }
}

#[derive(Debug, Clone)]
pub struct Probe {
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub has_audio: bool,
}

pub async fn probe_audio(
    state: &AppState,
    path: &Path,
    cancellation: &CancellationToken,
) -> Result<i64> {
    let output = capture_managed(
        state,
        "ffmpeg",
        "ffprobe",
        &[
            "-v".into(),
            "error".into(),
            "-show_streams".into(),
            "-show_format".into(),
            "-of".into(),
            "json".into(),
            path.to_string_lossy().into_owned(),
        ],
        cancellation,
    )
    .await?;
    let data: serde_json::Value = serde_json::from_slice(&output)?;
    let audio = data["streams"]
        .as_array()
        .and_then(|streams| {
            streams
                .iter()
                .find(|stream| stream["codec_type"] == "audio")
        })
        .context("Choose a file containing audio")?;
    let seconds = data["format"]["duration"]
        .as_str()
        .or_else(|| audio["duration"].as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .context("Audio duration is unavailable")?;
    anyhow::ensure!(
        seconds.is_finite() && seconds > 0.0 && seconds <= 86400.0,
        "Audio duration must be positive and at most 24 hours."
    );
    Ok((seconds * 1000.0).round() as i64)
}

pub async fn probe(
    state: &AppState,
    path: &Path,
    cancellation: &CancellationToken,
) -> Result<Probe> {
    let output = capture_managed(
        state,
        "ffmpeg",
        "ffprobe",
        &[
            "-v".into(),
            "error".into(),
            "-show_streams".into(),
            "-show_format".into(),
            "-of".into(),
            "json".into(),
            path.to_string_lossy().into_owned(),
        ],
        cancellation,
    )
    .await?;
    let data: serde_json::Value = serde_json::from_slice(&output)?;
    let streams = data["streams"]
        .as_array()
        .context("Media has no readable streams")?;
    let video = streams
        .iter()
        .find(|stream| stream["codec_type"] == "video")
        .context("Choose a file containing video")?;
    let mut width = video["width"].as_u64().unwrap_or_default() as u32;
    let mut height = video["height"].as_u64().unwrap_or_default() as u32;
    let rotation = video["side_data_list"]
        .as_array()
        .and_then(|items| items.iter().find_map(|item| item["rotation"].as_i64()))
        .unwrap_or(0);
    if rotation.rem_euclid(180) == 90 {
        std::mem::swap(&mut width, &mut height);
    }
    let duration = data["format"]["duration"]
        .as_str()
        .or_else(|| video["duration"].as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .context("Video duration is unavailable")?;
    if width == 0 || height == 0 || !duration.is_finite() || duration <= 0.0 {
        bail!("Video metadata is invalid.");
    }
    Ok(Probe {
        duration_ms: (duration * 1000.0).round() as i64,
        width,
        height,
        has_audio: streams.iter().any(|stream| stream["codec_type"] == "audio"),
    })
}

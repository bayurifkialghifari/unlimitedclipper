use crate::{db, model_manager, models::*, render, state::AppState, tools};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub async fn import_file(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let relative = job.payload["relative_path"]
        .as_str()
        .context("Missing uploaded source")?
        .to_string();
    let name = job.payload["name"]
        .as_str()
        .unwrap_or("Imported video")
        .to_string();
    let path = state.root.join(&relative);
    state
        .progress(job, "probe", 0.2, "Checking the source video.")
        .await?;
    let probe = tools::probe(state, &path, cancellation).await?;
    let id = job.payload["project_id"]
        .as_str()
        .context("Missing project identity")?
        .to_string();
    if db::project(&state.db, &id).await.is_ok() {
        job.project_id = Some(id);
        return Ok(());
    }
    let asset_id = db::register_asset(&state.db, &relative, &name, "video").await?;
    let proxy_relative = format!("sources/{id}-preview.mp4");
    let proxy = state.root.join(&proxy_relative);
    if !proxy.is_file() {
        state
            .progress(
                job,
                "proxy",
                0.3,
                "Preparing a browser-compatible video preview.",
            )
            .await?;
        let temporary = proxy.with_extension("part.mp4");
        tools::ffmpeg_progress(
            state,
            job,
            &[
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-y".into(),
                "-i".into(),
                path.to_string_lossy().into_owned(),
                "-map".into(),
                "0:v:0".into(),
                "-map".into(),
                "0:a:0?".into(),
                "-vf".into(),
                "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1".into(),
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "ultrafast".into(),
                "-crf".into(),
                "25".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-c:a".into(),
                "aac".into(),
                "-movflags".into(),
                "+faststart".into(),
                "-progress".into(),
                "pipe:1".into(),
                "-nostats".into(),
                temporary.to_string_lossy().into_owned(),
            ],
            probe.duration_ms,
            cancellation,
        )
        .await?;
        tools::probe(state, &temporary, cancellation).await?;
        tokio::fs::rename(temporary, &proxy).await?;
    }
    let preview_asset_id =
        Some(db::register_asset(&state.db, &proxy_relative, "preview.mp4", "video").await?);
    let thumbnail_path = format!("thumbnails/{id}.jpg");
    let thumbnail = state.root.join(&thumbnail_path);
    let thumbnail_result = tools::capture(
        &tools::executable(state, "ffmpeg", "ffmpeg")?,
        &[
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-ss".into(),
            "0".into(),
            "-i".into(),
            path.to_string_lossy().into_owned(),
            "-frames:v".into(),
            "1".into(),
            "-vf".into(),
            "scale=480:-2".into(),
            thumbnail.to_string_lossy().into_owned(),
        ],
        cancellation,
    )
    .await;
    let thumbnail_id = if thumbnail_result.is_ok() {
        Some(db::register_asset(&state.db, &thumbnail_path, "thumbnail.jpg", "image").await?)
    } else {
        None
    };
    if cancellation.is_cancelled() {
        bail!("Job cancelled.");
    }
    let project = Project {
        id: id.clone(),
        name,
        source_kind: job.payload["source_kind"].as_str().unwrap_or("file").into(),
        source_url: job.payload["source_url"].as_str().map(str::to_owned),
        asset_id,
        thumbnail_id,
        duration_ms: probe.duration_ms,
        width: probe.width,
        height: probe.height,
        has_audio: probe.has_audio,
        language: None,
        transcript_configuration: None,
        preview_asset_id,
        created_at: now_ms(),
        words: Vec::new(),
    };
    db::save_project(&state.db, &project).await?;
    job.project_id = Some(id);
    state
        .progress(job, "import", 0.95, "The source is ready to edit.")
        .await?;
    Ok(())
}

pub async fn import_youtube(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    if job.payload["relative_path"].is_string() {
        return import_file(state, job, cancellation).await;
    }
    let url = job.payload["url"]
        .as_str()
        .context("Missing YouTube URL")?
        .to_string();
    let id = job.payload["project_id"]
        .as_str()
        .context("Missing project identity")?
        .to_string();
    let source_prefix = state.root.join("sources").join(&id);
    let downloader = tools::executable(state, "yt-dlp", "yt-dlp")?;
    let deno = tools::executable(state, "deno", "deno")?;
    let ffmpeg = tools::executable(state, "ffmpeg", "ffmpeg")?;
    state
        .progress(job, "download", 0.05, "Downloading the source with yt-dlp.")
        .await?;
    let output = tools::downloader_progress(
        state,
        job,
        &downloader,
        &[
            "--no-playlist".into(),
            "--no-warnings".into(),
            "--newline".into(),
            "--progress".into(),
            "--progress-template".into(),
            "download:UC_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes_estimate)s:%(progress.total_bytes)s".into(),
            "--js-runtimes".into(),
            format!("deno:{}", deno.display()),
            "--ffmpeg-location".into(),
            ffmpeg
                .parent()
                .context("Invalid FFmpeg path")?
                .to_string_lossy()
                .into_owned(),
            "--format".into(),
            "bv*[height<=1080]+ba/b[height<=1080]/b".into(),
            "--merge-output-format".into(),
            "mp4".into(),
            "--retries".into(),
            "3".into(),
            "--continue".into(),
            "--print".into(),
            "after_move:filepath".into(),
            "--print".into(),
            "after_move:title".into(),
            "--output".into(),
            format!("{}.%(ext)s", source_prefix.display()),
            url.clone(),
        ],
        cancellation,
    )
    .await?;
    let stdout = String::from_utf8_lossy(&output);
    let mut lines = stdout.lines().filter(|line| !line.trim().is_empty());
    let downloaded = lines
        .next()
        .context("The downloader returned no source file")?;
    let name = lines.next().unwrap_or("YouTube video").to_string();
    let path = std::path::PathBuf::from(downloaded.trim());
    let canonical = tokio::fs::canonicalize(&path).await?;
    let sources = tokio::fs::canonicalize(state.root.join("sources")).await?;
    anyhow::ensure!(
        canonical.starts_with(sources),
        "Downloader output escaped managed source storage."
    );
    let filename = path
        .file_name()
        .context("Missing downloaded filename")?
        .to_string_lossy();
    job.payload["relative_path"] = json!(format!("sources/{filename}"));
    job.payload["name"] = json!(name);
    job.payload["source_kind"] = json!("youtube");
    job.payload["source_url"] = json!(url);
    db::save_job(&state.db, job).await?;
    import_file(state, job, cancellation).await
}

fn parse_transcript(value: &serde_json::Value, duration: i64) -> Vec<Word> {
    crate::speech::parse_transcript(value, duration)
}

pub async fn transcribe(
    state: &AppState,
    job: &mut Job,
    project: &mut Project,
    cancellation: &CancellationToken,
) -> Result<()> {
    if !project.has_audio {
        bail!("No audio was found. Create a clip manually to edit this video.");
    }
    let settings = db::settings(&state.db).await?;
    let speech_model = job.payload["speech_model"]
        .as_str()
        .unwrap_or(&settings.speech_model)
        .to_string();
    let model = model_manager::model_path(state, &speech_model).await?;
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let audio = state
        .root
        .join("temporary")
        .join(format!("{}.wav", project.id));
    state
        .progress(
            job,
            "audio",
            0.1,
            "Preparing audio for local transcription.",
        )
        .await?;
    if !audio.is_file() {
        let temporary_audio = audio.with_extension("part.wav");
        tools::capture(
            &tools::executable(state, "ffmpeg", "ffmpeg")?,
            &[
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-y".into(),
                "-i".into(),
                source.to_string_lossy().into_owned(),
                "-vn".into(),
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                temporary_audio.to_string_lossy().into_owned(),
            ],
            cancellation,
        )
        .await?;
        tokio::fs::rename(temporary_audio, &audio).await?;
    }
    state
        .progress(job, "transcription", 0.2, "Transcribing on this computer.")
        .await?;
    let prefix = state
        .root
        .join("temporary")
        .join(format!("{}-transcript", project.id));
    let language = job.payload["language"]
        .as_str()
        .unwrap_or(&settings.transcription_language);
    let alignment = if speech_model == "whisper-medium" {
        "medium"
    } else {
        "small"
    };
    tools::capture(
        &tools::executable(state, "whisper", "whisper-cli")?,
        &[
            "-m".into(),
            model.to_string_lossy().into_owned(),
            "-f".into(),
            audio.to_string_lossy().into_owned(),
            "-l".into(),
            language.into(),
            "-ojf".into(),
            "-of".into(),
            prefix.to_string_lossy().into_owned(),
            "-ml".into(),
            "1".into(),
            "-sow".into(),
            "-ng".into(),
            "-t".into(),
            "6".into(),
            "--dtw".into(),
            alignment.into(),
            "-nfa".into(),
            "-sns".into(),
        ],
        cancellation,
    )
    .await?;
    let data: serde_json::Value =
        serde_json::from_slice(&tokio::fs::read(prefix.with_extension("json")).await?)?;
    project.words = parse_transcript(&data, project.duration_ms);
    project.language = data["result"]["language"].as_str().map(str::to_owned);
    project.transcript_configuration = Some(format!("{speech_model}:{language}"));
    db::save_project(&state.db, project).await?;
    anyhow::ensure!(
        !project.words.is_empty(),
        "No speech was detected. Create a clip manually or try another speech model."
    );
    Ok(())
}

pub async fn refine_captions(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let clip_id = job.clip_id.as_deref().context("Missing clip")?.to_string();
    let mut clip = db::clip(&state.db, &clip_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    // A crash after the edit transaction must not apply the same recognition twice.
    if job.payload["caption_applied_revision"].as_i64() == Some(clip.revision)
        && job.payload["caption_applied_document"] == serde_json::to_value(&clip.document)?
    {
        return Ok(());
    }
    let revision = job.payload["revision"]
        .as_i64()
        .context("Missing edit revision")?;
    anyhow::ensure!(
        clip.revision == revision,
        "The clip changed. Retry after saving your edit."
    );
    let project = db::project(&state.db, &clip.project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    anyhow::ensure!(project.has_audio, "This source has no audio to transcribe.");
    let model_id = job.payload["speech_model"]
        .as_str()
        .context("Missing speech model")?
        .to_string();
    let language = job.payload["language"]
        .as_str()
        .unwrap_or("auto")
        .to_string();
    let vocabulary = job.payload["vocabulary"].as_str().unwrap_or("").to_string();
    let input_start = (clip.document.start_ms - 2000).max(0);
    let input_end = (clip.document.end_ms + 2000).min(project.duration_ms);
    let input_duration = input_end - input_start;
    let directory = state.root.join("temporary").join(&job.id);
    tokio::fs::create_dir_all(&directory).await?;
    let prefix = directory.join(format!("captions-{input_start}-{input_end}"));
    let transcript_path = prefix.with_extension("json");
    if !transcript_path.is_file() {
        let model = model_manager::model_path(state, &model_id).await?;
        let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id)
            .await
            .map_err(|error| anyhow::anyhow!(error.message))?;
        let audio = directory.join("speech.wav");
        state
            .progress(
                job,
                "audio",
                0.1,
                "Preparing the original clip audio with context.",
            )
            .await?;
        tools::capture(
            &tools::executable(state, "ffmpeg", "ffmpeg")?,
            &[
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-y".into(),
                "-ss".into(),
                format!("{:.3}", input_start as f64 / 1000.0),
                "-i".into(),
                source.to_string_lossy().into_owned(),
                "-t".into(),
                format!("{:.3}", input_duration as f64 / 1000.0),
                "-vn".into(),
                "-ar".into(),
                "16000".into(),
                "-ac".into(),
                "1".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                audio.to_string_lossy().into_owned(),
            ],
            cancellation,
        )
        .await?;
        let alignment = if model_id == "whisper-medium" {
            "medium"
        } else {
            "small"
        };
        let temporary_prefix = directory.join("recognition-part");
        let mut args = vec![
            "-m".into(),
            model.to_string_lossy().into_owned(),
            "-f".into(),
            audio.to_string_lossy().into_owned(),
            "-l".into(),
            language.clone(),
            "-ojf".into(),
            "-of".into(),
            temporary_prefix.to_string_lossy().into_owned(),
            "-ml".into(),
            "1".into(),
            "-sow".into(),
            "-ng".into(),
            "-t".into(),
            "6".into(),
            "--dtw".into(),
            alignment.into(),
            "-nfa".into(),
            "-sns".into(),
        ];
        if !vocabulary.trim().is_empty() {
            args.extend(["--prompt".into(), vocabulary.trim().into()]);
        }
        state
            .progress(
                job,
                "transcription",
                0.25,
                "Recognizing words and aligning them to the original audio.",
            )
            .await?;
        tools::capture(
            &tools::executable(state, "whisper", "whisper-cli")?,
            &args,
            cancellation,
        )
        .await?;
        let bytes = tokio::fs::read(temporary_prefix.with_extension("json")).await?;
        serde_json::from_slice::<serde_json::Value>(&bytes)?;
        tokio::fs::rename(temporary_prefix.with_extension("json"), &transcript_path).await?;
    }
    let data = serde_json::from_slice(&tokio::fs::read(&transcript_path).await?)?;
    anyhow::ensure!(!cancellation.is_cancelled(), "Job cancelled.");
    let clip_start = clip.document.start_ms - input_start;
    let clip_end = clip.document.end_ms - input_start;
    let words = parse_transcript(&data, input_duration)
        .into_iter()
        .filter(|word| word.start_ms >= clip_start && word.start_ms < clip_end)
        .map(|mut word| {
            word.start_ms -= clip_start;
            word.end_ms = (word.end_ms - clip_start).min(clip_end - clip_start);
            word
        })
        .collect::<Vec<_>>();
    anyhow::ensure!(
        !words.is_empty(),
        "No speech was found in this clip. Existing captions were preserved."
    );
    job.payload["recognized_words"] = json!(words.len());
    job.payload["review_words"] = json!(
        words
            .iter()
            .filter(|word| word.confidence.is_some_and(|value| value < 0.65))
            .count()
    );
    clip.document.words = words;
    clip.document.caption_model = Some(format!("{model_id}:{language}:dtw"));
    clip.document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    job.payload["caption_applied_revision"] = json!(revision + 1);
    job.payload["caption_applied_document"] = serde_json::to_value(&clip.document)?;
    state
        .progress(
            job,
            "captions",
            0.9,
            "Saving aligned captions without changing the source transcript.",
        )
        .await?;
    clip.revision += 1;
    db::update_clip(&state.db, &clip, revision)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Suggestion {
    start_ms: i64,
    end_ms: i64,
    title: String,
    #[serde(default)]
    explanation: String,
    #[serde(default)]
    score: u32,
    #[serde(default)]
    hook: String,
    #[serde(default)]
    payoff: String,
}

fn normalized_quote(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn grounded(suggestion: &Suggestion, words: &[Word]) -> bool {
    let transcript = words
        .iter()
        .filter(|word| word.end_ms > suggestion.start_ms && word.start_ms < suggestion.end_ms)
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let transcript = normalized_quote(&transcript);
    [&suggestion.hook, &suggestion.payoff].iter().all(|quote| {
        let quote = normalized_quote(quote);
        quote.chars().count() >= 3 && format!(" {transcript} ").contains(&format!(" {quote} "))
    })
}

fn fit_suggestion(mut suggestion: Suggestion, project: &Project) -> Option<Suggestion> {
    let words = &project.words;
    let first = words
        .iter()
        .position(|word| word.end_ms > suggestion.start_ms)?;
    let last = words
        .iter()
        .rposition(|word| word.start_ms < suggestion.end_ms)?;
    if last < first {
        return None;
    }
    let mut start_index = first;
    while start_index > 0 && words[first].start_ms - words[start_index - 1].start_ms <= 1600 {
        let previous = &words[start_index - 1];
        if previous.text.ends_with(['.', '!', '?'])
            || words[start_index].start_ms - previous.end_ms > 650
        {
            break;
        }
        start_index -= 1;
    }
    let mut end_index = last;
    while end_index + 1 < words.len() && words[end_index + 1].end_ms - words[last].end_ms <= 1600 {
        let word = &words[end_index];
        if word.text.ends_with(['.', '!', '?']) || words[end_index + 1].start_ms - word.end_ms > 650
        {
            break;
        }
        end_index += 1;
    }
    suggestion.start_ms = (words[start_index].start_ms - 120).max(0);
    suggestion.end_ms = (words[end_index].end_ms + 180).min(project.duration_ms);
    if suggestion.end_ms - suggestion.start_ms > 60000 {
        return None;
    }
    (suggestion.end_ms > suggestion.start_ms).then_some(suggestion)
}

pub async fn infer(
    state: &AppState,
    prompt: &str,
    schema: &str,
    cancellation: &CancellationToken,
) -> Result<String> {
    let model = model_manager::model_path(state, "qwen3-4b").await?;
    let filename = state
        .root
        .join("temporary")
        .join(format!("{}-prompt.txt", Uuid::new_v4()));
    let prompt = format!(
        "<|im_start|>system\nYou edit video clips. Follow the requested JSON schema and use only the provided transcript.<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
    );
    // Qwen's byte fallback bounds tokens by UTF-8 bytes; reserve room for generated JSON.
    anyhow::ensure!(
        prompt.len() <= INFERENCE_CONTEXT_TOKENS - INFERENCE_OUTPUT_TOKENS - 32,
        "The transcript is too large for this model's context. Use a shorter clip or edit manually."
    );
    tokio::fs::write(&filename, prompt).await?;
    let result = tools::capture(
        &tools::executable(state, "llama", "llama-completion")?,
        &[
            "-m".into(),
            model.to_string_lossy().into_owned(),
            "-f".into(),
            filename.to_string_lossy().into_owned(),
            "-n".into(),
            INFERENCE_OUTPUT_TOKENS.to_string(),
            "-c".into(),
            INFERENCE_CONTEXT_TOKENS.to_string(),
            "-ngl".into(),
            "0".into(),
            "--no-display-prompt".into(),
            "--no-conversation".into(),
            "--no-escape".into(),
            "--reasoning".into(),
            "off".into(),
            "--json-schema".into(),
            schema.into(),
            "--temp".into(),
            "0.7".into(),
            "--top-p".into(),
            "0.8".into(),
            "-t".into(),
            "6".into(),
        ],
        cancellation,
    )
    .await;
    let _ = tokio::fs::remove_file(&filename).await;
    Ok(String::from_utf8_lossy(&result?).into_owned())
}

fn extract_json<T: serde::de::DeserializeOwned>(output: &str) -> Result<T> {
    for (index, _) in output.match_indices('{') {
        let mut stream = serde_json::Deserializer::from_str(&output[index..]).into_iter::<T>();
        if let Some(Ok(value)) = stream.next() {
            return Ok(value);
        }
    }
    bail!("The local model returned invalid structured data. Retry or edit manually.")
}

#[derive(Deserialize)]
struct Selection {
    clips: Vec<Suggestion>,
}

const TRANSCRIPT_WINDOW_BYTES: usize = 4000;
const INFERENCE_CONTEXT_TOKENS: usize = 8192;
const INFERENCE_OUTPUT_TOKENS: usize = 2048;

struct TranscriptWindow<'a> {
    words: &'a [Word],
    text: String,
}

fn transcript_windows(words: &[Word]) -> Result<Vec<TranscriptWindow<'_>>> {
    let mut windows = Vec::new();
    let mut window_start = 0;
    let mut group_start = 0;
    let mut text = String::new();
    while group_start < words.len() {
        let mut group_end = group_start + 1;
        while group_end < words.len() && group_end - group_start < 12 {
            let previous = &words[group_end - 1];
            if words[group_end].start_ms - previous.end_ms > 2000
                || previous.text.ends_with(['.', '!', '?'])
            {
                break;
            }
            group_end += 1;
        }
        let phrase = words[group_start..group_end]
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let line = format!(
            "[{}-{}] {phrase}\n",
            words[group_start].start_ms,
            words[group_end - 1].end_ms
        );
        anyhow::ensure!(
            line.len() <= TRANSCRIPT_WINDOW_BYTES,
            "A transcript phrase is too large for local selection. Shorten it or create a clip manually."
        );
        if text.len() + line.len() > TRANSCRIPT_WINDOW_BYTES {
            windows.push(TranscriptWindow {
                words: &words[window_start..group_start],
                text: std::mem::take(&mut text),
            });
            window_start = group_start;
        }
        text.push_str(&line);
        group_start = group_end;
    }
    if !text.is_empty() {
        windows.push(TranscriptWindow {
            words: &words[window_start..],
            text,
        });
    }
    Ok(windows)
}

fn output_language(project: &Project) -> &str {
    match project.language.as_deref() {
        Some("id") => "Indonesian (Bahasa Indonesia)",
        Some("en") => "English",
        Some(language) => language,
        None => "the original transcript language",
    }
}

async fn review_suggestions(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    suggestions: Vec<Suggestion>,
    cancellation: &CancellationToken,
) -> Result<Vec<Suggestion>> {
    #[derive(Deserialize)]
    struct ReviewItem {
        index: usize,
        score: u32,
        explanation: String,
    }
    #[derive(Deserialize)]
    struct Review {
        clips: Vec<ReviewItem>,
    }
    let candidates: Vec<Suggestion> = if job.payload["review_candidates"].is_array() {
        serde_json::from_value(job.payload["review_candidates"].clone())?
    } else {
        job.payload["review_candidates"] = json!(suggestions);
        db::save_job(&state.db, job).await?;
        suggestions
    };
    let minimum = job.payload["minimum_score"].as_u64().unwrap_or(70) as u32;
    let focus = job.payload["focus"].as_str().unwrap_or("").to_string();
    let mut reviewed: Vec<Suggestion> =
        serde_json::from_value(job.payload["reviewed_suggestions"].clone()).unwrap_or_default();
    let mut offset = job.payload["review_offset"].as_u64().unwrap_or(0) as usize;
    while offset < candidates.len() {
        let mut brief = Vec::new();
        let mut end = offset;
        while end < candidates.len() && end - offset < 16 {
            let suggestion = &candidates[end];
            let transcript = project
                .words
                .iter()
                .filter(|word| {
                    word.end_ms > suggestion.start_ms && word.start_ms < suggestion.end_ms
                })
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            let mut bytes = 0;
            let excerpt = transcript
                .chars()
                .take_while(|character| {
                    bytes += character.len_utf8();
                    bytes <= 1000
                })
                .collect::<String>();
            let value = json!({
                "index": end, "score": suggestion.score,
                "start_ms": suggestion.start_ms, "end_ms": suggestion.end_ms,
                "title": suggestion.title.chars().take(40).collect::<String>(),
                "hook": suggestion.hook.chars().take(40).collect::<String>(),
                "payoff": suggestion.payoff.chars().take(40).collect::<String>(),
                "transcript": excerpt
            });
            brief.push(value);
            if serde_json::to_string(&brief)?.len() > 4000 {
                brief.pop();
                break;
            }
            end += 1;
        }
        anyhow::ensure!(
            end > offset,
            "A highlight review exceeded the local context budget."
        );
        state
            .progress(
                job,
                "review",
                0.9 + 0.05 * offset as f64 / candidates.len().max(1) as f64,
                "Comparing hooks and payoffs; rejecting filler and weak moments.",
            )
            .await?;
        let prompt = format!(
            "Act as a strict short-video editor. Review these proposed moments against the same scale: 0-49 routine actions, reading without a reaction, or incomplete context; 50-69 mildly useful but ordinary; 70-84 a clear standalone hook and payoff; 85-100 an unusually compelling surprise, funny reaction, or tense outcome. Reject repeated topics and candidates that end before the payoff. Do not fill a quota. Return only candidates scoring at least {minimum}, or an empty array. Viewer preference: {focus}. Explanations must be concise and in {}. Use the exact candidate index. Candidates: {}",
            output_language(project),
            serde_json::to_string(&brief)?
        );
        let indices = (offset..end).collect::<Vec<_>>();
        let schema = json!({"type":"object","properties":{"clips":{"type":"array","maxItems":indices.len(),"items":{"type":"object","properties":{
            "index":{"type":"integer","enum":indices},"score":{"type":"integer","minimum":0,"maximum":100},"explanation":{"type":"string"}},
            "required":["index","score","explanation"],"additionalProperties":false}}},"required":["clips"],"additionalProperties":false});
        let output = infer(state, &prompt, &schema.to_string(), cancellation).await?;
        let result: Review = extract_json(&output)?;
        let mut seen = std::collections::HashSet::new();
        for item in result.clips {
            if item.index < offset
                || item.index >= end
                || item.score < minimum
                || !seen.insert(item.index)
            {
                continue;
            }
            let mut suggestion = candidates[item.index].clone();
            suggestion.score = item.score;
            suggestion.explanation = item.explanation;
            reviewed.push(suggestion);
        }
        offset = end;
        job.payload["review_offset"] = json!(offset);
        job.payload["reviewed_suggestions"] = json!(reviewed);
        db::save_job(&state.db, job).await?;
    }
    Ok(reviewed)
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project_id = job
        .project_id
        .as_deref()
        .context("Missing project")?
        .to_string();
    let mut project = db::project(&state.db, &project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    if job.payload["plan"].is_array() {
        return complete_plan(state, job, &project).await;
    }
    let settings = db::settings(&state.db).await?;
    if !job.payload["speech_model"].is_string() {
        job.payload["speech_model"] = json!(settings.speech_model);
        job.payload["resolution"] = json!(settings.resolution);
        db::save_job(&state.db, job).await?;
    }
    let language = job.payload["language"]
        .as_str()
        .unwrap_or(&settings.transcription_language);
    let configuration = format!(
        "{}:{language}",
        job.payload["speech_model"]
            .as_str()
            .context("Missing speech model")?
    );
    if project.words.is_empty()
        || project.transcript_configuration.as_deref() != Some(&configuration)
    {
        transcribe(state, job, &mut project, cancellation).await?;
    }
    let count = job.payload["clip_count"].as_u64().unwrap_or(4) as usize;
    let minimum_score = job.payload["minimum_score"].as_u64().unwrap_or(70) as u32;
    let focus = job.payload["focus"].as_str().unwrap_or("").to_string();
    let requested_duration = job.payload["duration_ms"].as_i64().unwrap_or(0);
    let mut suggestions: Vec<Suggestion> =
        serde_json::from_value(job.payload["suggestions"].clone()).unwrap_or_default();
    // Word offsets preserve completed sections even if window sizing changes after an update.
    let processed_words = job.payload["selection_word_offset"]
        .as_u64()
        .map(|offset| offset as usize)
        .unwrap_or_else(|| job.payload["processed_windows"].as_u64().unwrap_or(0) as usize * 700)
        .min(project.words.len());
    let windows = transcript_windows(&project.words[processed_words..])?;
    let mut word_offset = processed_words;
    for (window_index, window) in windows.iter().enumerate() {
        let words = window.words;
        if cancellation.is_cancelled() {
            bail!("Job cancelled.");
        }
        job.payload["selection_section"] = json!(window_index + 1);
        job.payload["selection_sections"] = json!(windows.len());
        state
            .progress(
                job,
                "selection",
                0.45 + 0.45 * word_offset as f64 / project.words.len().max(1) as f64,
                &format!(
                    "Finding moments in transcript section {} of {}.",
                    window_index + 1,
                    windows.len()
                ),
            )
            .await?;
        let transcript = &window.text;
        let duration_instruction = if requested_duration > 0 {
            format!(
                "Aim near {requested_duration} milliseconds, but end after the payoff and never add filler merely to reach that duration."
            )
        } else {
            "Prefer complete moments lasting 8000 to 60000 milliseconds.".into()
        };
        let prompt = format!(
            "Select zero to {} standalone highlights: a surprising reaction, funny exchange, tense outcome, or useful insight with a payoff. Skip greetings, routine actions, repetitive passages, and reading with no reaction. Do not fill a quota. Viewer preference: {focus}. {duration_instruction} Begin at a complete phrase and finish after its payoff. Timestamps are integer SOURCE milliseconds. Score ordinary content below 60; require at least {minimum_score} for a clear hook and payoff. Output language: {}. Return short grounded titles and explanations in this language. Include hook and payoff as exact short quotes from WITHIN each selected range. An empty clips array is valid. Transcript:\n{transcript}",
            count.min(3),
            output_language(&project)
        );
        let schema = json!({"type":"object","properties":{"clips":{"type":"array","maxItems":8,"items":{"type":"object","properties":{
            "start_ms":{"type":"integer"},"end_ms":{"type":"integer"},"title":{"type":"string"},
            "explanation":{"type":"string"},"score":{"type":"integer","minimum":0,"maximum":100},"hook":{"type":"string"},"payoff":{"type":"string"}},
            "required":["start_ms","end_ms","title","explanation","score","hook","payoff"],"additionalProperties":false}}},"required":["clips"],"additionalProperties":false});
        let output = infer(state, &prompt, &schema.to_string(), cancellation).await?;
        let window: Selection = extract_json(&output)?;
        for suggestion in window.clips {
            if suggestion.start_ms >= words[0].start_ms
                && suggestion.end_ms <= words.last().context("Transcript window is empty")?.end_ms
                && suggestion.end_ms > suggestion.start_ms
                && !suggestion.title.trim().is_empty()
                && suggestion.score >= minimum_score
                && grounded(&suggestion, words)
            {
                suggestions.push(suggestion);
            }
        }
        job.payload["suggestions"] = json!(suggestions);
        word_offset += words.len();
        job.payload["selection_word_offset"] = json!(word_offset);
        db::save_job(&state.db, job).await?;
    }
    let mut suggestions =
        review_suggestions(state, job, &project, suggestions, cancellation).await?;
    suggestions.sort_by_key(|suggestion| std::cmp::Reverse(suggestion.score));
    let mut accepted = Vec::<Suggestion>::new();
    for suggestion in suggestions {
        let Some(suggestion) = fit_suggestion(suggestion, &project) else {
            continue;
        };
        if accepted
            .iter()
            .any(|other| suggestion.start_ms < other.end_ms && suggestion.end_ms > other.start_ms)
        {
            continue;
        }
        accepted.push(suggestion);
        if accepted.len() >= count {
            break;
        }
    }
    anyhow::ensure!(
        !accepted.is_empty(),
        "No moments passed the interest filter. Try another focus or lower the threshold, or create a clip manually."
    );
    let mut plan = Vec::new();
    for suggestion in accepted {
        let mut document = EditDocument::new(&project, suggestion.start_ms, suggestion.end_ms);
        document.resolution = job.payload["resolution"]
            .as_u64()
            .unwrap_or(settings.resolution as u64) as u32;
        document.title.text = suggestion.title.clone();
        document
            .validate(project.duration_ms)
            .map_err(anyhow::Error::msg)?;
        let clip = Clip {
            id: Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            name: suggestion.title,
            explanation: suggestion.explanation,
            score: Some(suggestion.score.min(100)),
            revision: 1,
            document,
            created_at: now_ms(),
        };
        plan.push(clip);
    }
    job.payload["plan"] = json!(plan);
    db::save_job(&state.db, job).await?;
    complete_plan(state, job, &project).await
}

async fn complete_plan(state: &AppState, job: &mut Job, project: &Project) -> Result<()> {
    let plan: Vec<Clip> = serde_json::from_value(job.payload["plan"].clone())?;
    for clip in plan {
        clip.document
            .validate(project.duration_ms)
            .map_err(anyhow::Error::msg)?;
        sqlx::query("INSERT INTO clips(id, project_id, revision, data, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
            .bind(&clip.id).bind(&clip.project_id).bind(clip.revision).bind(serde_json::to_string(&clip)?).bind(clip.created_at)
            .execute(&state.db).await?;
    }
    state
        .progress(job, "selection", 0.95, "Clips are ready for review.")
        .await?;
    state.emit("projects", None);
    Ok(())
}

pub async fn title(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let id = job.clip_id.as_deref().context("Missing clip")?;
    let mut clip = db::clip(&state.db, id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let revision = job.payload["revision"]
        .as_i64()
        .context("Missing edit revision")?;
    anyhow::ensure!(
        clip.revision == revision,
        "This clip changed while queued. Generate the title again."
    );
    let transcript = clip
        .document
        .words
        .iter()
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    anyhow::ensure!(
        !transcript.is_empty(),
        "Transcribe this clip before generating a title, or enter a title manually."
    );
    let schema = json!({"type":"object","properties":{"title":{"type":"string"}},"required":["title"],"additionalProperties":false});
    let project = db::project(&state.db, &clip.project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let prompt = format!(
        "Write one concise, accurate hook title. Output language: {}. Use this language without translating to another language. Return JSON with title. Transcript: {transcript}",
        output_language(&project)
    );
    let output = infer(state, &prompt, &schema.to_string(), cancellation).await?;
    #[derive(Deserialize)]
    struct Hook {
        title: String,
    }
    let hook: Hook = extract_json(&output)?;
    anyhow::ensure!(
        !hook.title.trim().is_empty(),
        "The model returned an empty title."
    );
    clip.document.title.text = hook.title.trim().chars().take(300).collect();
    clip.revision += 1;
    db::update_clip(&state.db, &clip, revision)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    Ok(())
}

pub async fn render_batch(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let snapshots: Vec<Clip> = serde_json::from_value(job.payload["snapshots"].clone())
        .context("Missing export snapshots")?;
    let mut completed = job.payload["completed_exports"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for (index, clip) in snapshots.into_iter().enumerate() {
        if completed.iter().any(|value| value["clip_id"] == clip.id) {
            continue;
        }
        job.payload["render_index"] = json!(index);
        let export = render::export_clip(state, job, &clip, cancellation).await?;
        completed.push(json!({"clip_id": clip.id, "export_id": export.id}));
        job.payload["completed_exports"] = json!(completed);
        db::save_job(&state.db, job).await?;
        state.emit("exports", None);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlight_evidence_must_quote_words_inside_the_selected_range() {
        let words = parse_transcript(
            &json!({"transcription":[
                {"text":"Hadiah biasa.","offsets":{"from":0,"to":1000}},
                {"text":"Dia jahat! Lari guys!","offsets":{"from":2000,"to":4000}}
            ]}),
            5000,
        );
        let mut suggestion = Suggestion {
            start_ms: 2000,
            end_ms: 4000,
            title: "Escape".into(),
            explanation: String::new(),
            score: 85,
            hook: "Dia jahat".into(),
            payoff: "Lari guys".into(),
        };
        assert!(grounded(&suggestion, &words));
        suggestion.payoff = "Hadiah biasa".into();
        assert!(!grounded(&suggestion, &words));
        suggestion.start_ms = 0;
        suggestion.end_ms = 1000;
        suggestion.hook = "Dia".into();
        assert!(!grounded(&suggestion, &words));
    }

    #[test]
    fn cut_boundaries_complete_the_phrase_without_forcing_thirty_seconds() {
        let words = parse_transcript(
            &json!({"transcription":[
                {"text":"Introduction.","offsets":{"from":0,"to":1000}},
                {"text":"Dia jahat!","offsets":{"from":2000,"to":3000}},
                {"text":"Lari guys!","offsets":{"from":3200,"to":4300}},
                {"text":"Next topic.","offsets":{"from":9000,"to":10000}}
            ]}),
            30_000,
        );
        let project = serde_json::from_value(json!({
            "id":"fixture","name":"Fixture","source_kind":"file","source_url":null,
            "asset_id":"source","thumbnail_id":null,"duration_ms":30000,
            "width":1920,"height":1080,"has_audio":true,"language":"id","created_at":1,"words":words
        }))
        .unwrap();
        let suggestion = Suggestion {
            start_ms: 2500,
            end_ms: 3900,
            title: "Escape".into(),
            explanation: String::new(),
            score: 85,
            hook: "Dia jahat".into(),
            payoff: "Lari guys".into(),
        };
        let fitted = fit_suggestion(suggestion, &project).unwrap();
        assert_eq!(fitted.start_ms, 1880);
        assert_eq!(fitted.end_ms, 4480);
    }

    #[test]
    fn speech_annotations_split_across_segments_do_not_become_caption_words() {
        let segments = ["[Suara", "pesawat", "terbang]", "Lari,", "kocak!"];
        let transcription = segments
            .iter()
            .enumerate()
            .map(|(index, text)| {
                json!({
                    "text": text,
                    "offsets": {"from": index * 1000, "to": index * 1000 + 500}
                })
            })
            .collect::<Vec<_>>();
        let words = parse_transcript(&json!({"transcription": transcription}), 5000);
        assert_eq!(
            words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>(),
            ["Lari,", "kocak!"]
        );
        assert_eq!(words[0].start_ms, 3000);
        assert_eq!(words[1].end_ms, 4500);
    }

    #[test]
    fn long_multilingual_transcripts_keep_all_source_words_within_context_budget() {
        let words = (0..6740)
            .map(|index| Word {
                id: index.to_string(),
                text: ["teman-teman", "これはテストです", "selamat", "नमस्ते"][index % 4].into(),
                start_ms: index as i64 * 750,
                end_ms: index as i64 * 750 + 500,
                emphasis: false,
                color: None,
                confidence: None,
            })
            .collect::<Vec<_>>();
        let windows = transcript_windows(&words).unwrap();
        assert!(windows.len() > 1);
        assert_eq!(
            windows
                .iter()
                .map(|window| window.words.len())
                .sum::<usize>(),
            words.len()
        );
        let mut expected = 0;
        for window in windows {
            assert!(window.text.len() <= TRANSCRIPT_WINDOW_BYTES);
            assert_eq!(window.words[0].id, expected.to_string());
            expected += window.words.len();
            assert_eq!(window.words.last().unwrap().id, (expected - 1).to_string());
            assert!(window.text.contains(&window.words[0].start_ms.to_string()));
            assert!(
                window
                    .text
                    .contains(&window.words.last().unwrap().end_ms.to_string())
            );
        }
    }
}

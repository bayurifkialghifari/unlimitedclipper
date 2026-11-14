use crate::{alignment, db, models::*, pipeline, speaker, state::AppState, tools, tracking};
use anyhow::{Result, ensure};
use serde::Deserialize;
use serde_json::json;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct Emphasis {
    word_ids: Vec<String>,
    note_word_ids: Vec<String>,
}

fn layer(kind: &str, start: i64, end: i64, duration: i64) -> VisualLayer {
    VisualLayer {
        id: uuid::Uuid::new_v4().to_string(),
        enabled: true,
        start_ms: start,
        end_ms: end.min(duration),
        kind: kind.into(),
        text: String::new(),
        crop: None,
        secondary_crop: None,
        x: 0.5,
        y: 0.24,
        color: "#FFCB66".into(),
        size: 60,
        asset_id: None,
        source_start_ms: 0,
    }
}

fn add_layers(
    document: &mut EditDocument,
    choice: &Emphasis,
    faces: &[(i64, Vec<CropRect>)],
    job: &mut Job,
) {
    let duration = document.duration_ms();
    let mut generated = Vec::new();
    let mut review = Vec::<String>::new();
    let mut last_shot_end = 0;
    for id in choice.word_ids.iter().take(4) {
        let Some(word) = document.words.iter().find(|word| &word.id == id) else {
            continue;
        };
        if word.start_ms < last_shot_end {
            continue;
        }
        let end = (word.end_ms + 500).min(duration);
        let crops = faces
            .iter()
            .rev()
            .find(|(time, _)| *time <= word.start_ms)
            .map(|(_, crops)| crops);
        if let Some(crops) = crops.filter(|crops| !crops.is_empty()) {
            if crops.len() > 1 {
                let mut shot = layer("split", word.start_ms, end, duration);
                shot.crop = Some(crops[0].clone());
                shot.secondary_crop = Some(crops[1].clone());
                generated.push(shot);
                review
                    .push("Multiple faces use a split composition; review speaker mapping.".into());
            } else {
                let crop = &crops[0];
                let mut shot = layer("punch_in", word.start_ms, end, duration);
                let width = crop.width / 1.12;
                let height = crop.height / 1.12;
                shot.crop = Some(CropRect {
                    x: (crop.x + (crop.width - width) / 2.0).clamp(0.0, 1.0 - width),
                    y: (crop.y + (crop.height - height) / 2.0).clamp(0.0, 1.0 - height),
                    width,
                    height,
                });
                generated.push(shot);
            }
            last_shot_end = end + 700;
        }
    }
    for id in choice.note_word_ids.iter().take(2) {
        if let Some(word) = document.words.iter().find(|word| &word.id == id) {
            let mut note = layer("note", word.start_ms, word.end_ms + 600, duration);
            note.text = word.text.clone();
            generated.push(note);
        }
    }
    if job.payload["profile"] == "reaction" {
        generated.push(layer("camera_frame", 0, duration, duration));
    }
    document.visual_layers.extend(generated);
    job.payload["review_notes"] = json!(review);
}

async fn remove_silence(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    document: &EditDocument,
    cancellation: &CancellationToken,
) -> Result<EditDocument> {
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id).await?;
    let directory = state.root.join("temporary").join(&job.id);
    tokio::fs::create_dir_all(&directory).await?;
    let audio = directory.join("speech.wav");
    tools::capture_managed(
        state,
        "ffmpeg",
        "ffmpeg",
        &[
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-ss".into(),
            format!("{:.3}", document.start_ms as f64 / 1000.0),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-t".into(),
            format!(
                "{:.3}",
                (document.end_ms - document.start_ms) as f64 / 1000.0
            ),
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
    let mut words = document
        .words
        .iter()
        .map(|word| {
            let mut word = word.clone();
            word.start_ms = document.output_to_source(word.start_ms).unwrap() - document.start_ms;
            word.end_ms =
                document.output_to_source(word.end_ms - 1).unwrap() + 1 - document.start_ms;
            word
        })
        .collect();
    let report = alignment::align(
        state,
        &mut words,
        &audio,
        document.start_ms,
        document
            .caption_model
            .as_deref()
            .and_then(|configuration| configuration.split(':').nth(1))
            .filter(|language| ["id", "en"].contains(language))
            .or(project.language.as_deref())
            .unwrap_or("unknown"),
        cancellation,
    )
    .await?;
    ensure!(
        report.available,
        "Quality pack does not support this transcript language."
    );
    let turns = speaker::identify(
        state,
        alignment::read_audio(&audio)?,
        report.regions.clone(),
        document.start_ms,
        cancellation,
    )
    .await?;
    job.payload["speaker_turns"] = serde_json::to_value(turns)?;
    let mut aligned_document = document.clone();
    for target in &mut aligned_document.words {
        if target
            .timing
            .as_ref()
            .is_some_and(|timing| timing.provenance == "manual")
        {
            continue;
        }
        let Some(aligned) = words.iter().find(|word| word.id == target.id) else {
            continue;
        };
        let source_start = document.start_ms + aligned.start_ms;
        let source_end = document.start_ms + aligned.end_ms;
        if let (Some(start), Some(end)) = (
            document.source_to_output(source_start),
            document.source_to_output(source_end - 1),
        ) {
            target.start_ms = start;
            target.end_ms = end + 1;
            target.timing = aligned.timing.clone();
        }
    }
    let segments = trimmed_segments(&aligned_document, &report.regions);
    job.payload["alignment"] = serde_json::to_value(report)?;
    Ok(aligned_document.replace_segments(segments))
}

fn trimmed_segments(
    document: &EditDocument,
    regions: &[alignment::SpeechRegion],
) -> Vec<SourceSegment> {
    let mut segments = Vec::new();
    for segment in document.source_segments() {
        let mut keep_from = segment.start_ms;
        for gap in regions.windows(2) {
            let from = (gap[0].end_ms + 120).max(segment.start_ms);
            let to = (gap[1].start_ms - 120).min(segment.end_ms);
            let protected = document.words.iter().any(|word| {
                let start = document.output_to_source(word.start_ms).unwrap();
                let end = document.output_to_source(word.end_ms - 1).unwrap() + 1;
                start < to && end > from
            });
            if to - from > 650 && !protected && from > keep_from {
                segments.push(SourceSegment {
                    start_ms: keep_from,
                    end_ms: from,
                });
                keep_from = to;
            }
        }
        segments.push(SourceSegment {
            start_ms: keep_from,
            end_ms: segment.end_ms,
        });
    }
    segments
}

pub async fn auto_edit(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    if job.payload["proposed_document"].is_object() {
        return Ok(());
    }
    let clip: Clip = serde_json::from_value(job.payload["snapshot"].clone())?;
    let project = db::project(&state.db, &clip.project_id).await?;
    ensure!(
        !clip.document.words.is_empty(),
        "Transcribe this clip before automatic editing."
    );
    ensure!(
        clip.document.duration_ms() <= 60000
            && clip.document.end_ms - clip.document.start_ms <= 600000,
        "Automatic editing supports clips up to 60 seconds within a ten-minute source range."
    );
    let mut document = clip
        .document
        .replace_segments(clip.document.source_segments());
    if job.payload["remove_silence"] == true {
        state
            .progress(
                job,
                "alignment",
                0.1,
                "Verifying speech and reactions before trimming.",
            )
            .await?;
        document = remove_silence(state, job, &project, &document, cancellation).await?;
    }
    state
        .progress(
            job,
            "review",
            0.45,
            "Choosing transcript-grounded emphasis.",
        )
        .await?;
    let transcript: Vec<_> = document
        .words
        .iter()
        .map(|word| json!({"id": word.id, "text": word.text}))
        .collect();
    let schema = json!({"type":"object","properties":{
        "word_ids":{"type":"array","maxItems":8,"items":{"type":"string"}},
        "note_word_ids":{"type":"array","maxItems":2,"items":{"type":"string"}}},
        "required":["word_ids","note_word_ids"],"additionalProperties":false});
    let prompt = format!(
        "Choose up to eight meaningful word IDs for caption emphasis and up to two word IDs for visual notes. Use only transcript IDs. Prefer spoken keywords; skip filler. Empty arrays are valid. Transcript: {}",
        serde_json::to_string(&transcript)?
    );
    let output = pipeline::infer(state, &prompt, &schema.to_string(), cancellation).await?;
    let choice: Emphasis = pipeline::extract_json(&output)?;
    for word in &mut document.words {
        if choice.word_ids.contains(&word.id) {
            word.emphasis = true;
        }
    }
    if let Some(preset) = crate::caption_presets::presets()
        .into_iter()
        .find(|preset| preset.id == "kinetic")
    {
        document.captions = preset.style;
    }
    state
        .progress(
            job,
            "tracking",
            0.65,
            "Reviewing available faces for framing.",
        )
        .await?;
    let faces = tracking::sample_faces(state, &project, &document, cancellation).await?;
    add_layers(&mut document, &choice, &faces, job);
    document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    job.payload["proposed_document"] = serde_json::to_value(document)?;
    job.payload["base_revision"] = json!(clip.revision);
    state
        .progress(
            job,
            "review",
            0.95,
            "An editable proposal is ready for review.",
        )
        .await?;
    Ok(())
}

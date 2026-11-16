use crate::{
    alignment, db, models::*, motion, pipeline, speaker, state::AppState, tools, tracking,
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct Emphasis {
    word_ids: Vec<String>,
    note_word_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct SilenceGap {
    start_ms: i64,
    end_ms: i64,
}

#[derive(Debug, Default, Serialize)]
struct MotionReview {
    anchors: usize,
    single_face_samples: usize,
    emphasis_pulses: usize,
    skipped_multi_face_samples: usize,
}

#[derive(Clone, Copy)]
struct PanAnchor {
    x: f64,
    y: f64,
    hold: bool,
}

fn pan_at(anchors: &BTreeMap<i64, PanAnchor>, time: i64) -> PanAnchor {
    let (start, previous) = anchors.range(..=time).next_back().unwrap();
    let Some((end, next)) = anchors.range((time + 1)..).next() else {
        return *previous;
    };
    if next.hold {
        return *previous;
    }
    let progress = (time - start) as f64 / (end - start) as f64;
    PanAnchor {
        x: previous.x + (next.x - previous.x) * progress,
        y: previous.y + (next.y - previous.y) * progress,
        hold: false,
    }
}

fn propose_auto_motion(
    document: &mut EditDocument,
    faces: &[(i64, Vec<CropRect>)],
    choice: &Emphasis,
) -> MotionReview {
    let duration = document.duration_ms();
    let center = PanAnchor {
        x: document.crop.x + document.crop.width / 2.0,
        y: document.crop.y + document.crop.height / 2.0,
        hold: false,
    };
    let mut review = MotionReview::default();
    let mut pan = BTreeMap::from([(0, center)]);
    if !document.keyframes.is_empty() {
        for key in &document.keyframes {
            pan.insert(
                key.time_ms,
                PanAnchor {
                    x: key.x + document.crop.width / 2.0,
                    y: key.y + document.crop.height / 2.0,
                    hold: false,
                },
            );
        }
    } else {
        let mut offset = 0;
        for segment in document.source_segments() {
            let end = offset + segment.end_ms - segment.start_ms;
            let samples = faces
                .iter()
                .filter(|(time, _)| *time >= offset && *time < end)
                .collect::<Vec<_>>();
            review.skipped_multi_face_samples += samples
                .iter()
                .filter(|(_, candidates)| candidates.len() > 1)
                .count();
            let single = samples
                .iter()
                .filter(|(_, candidates)| candidates.len() == 1)
                .collect::<Vec<_>>();
            review.single_face_samples += single.len();
            let initial = single
                .first()
                .filter(|(time, _)| *time - offset <= 1000)
                .map(|(_, candidates)| &candidates[0]);
            let mut position = initial.map_or(center, |crop| PanAnchor {
                x: crop.x + crop.width / 2.0,
                y: crop.y + crop.height / 2.0,
                hold: offset > 0,
            });
            position.hold = offset > 0;
            pan.insert(offset, position);
            let mut previous_time = offset;
            for (time, candidates) in single {
                if *time < offset + 1250 || *time - previous_time < 1250 {
                    continue;
                }
                let crop = &candidates[0];
                let target_x = crop.x + crop.width / 2.0;
                let target_y = crop.y + crop.height / 2.0;
                let delta = (target_x - position.x).hypot(target_y - position.y);
                if delta < 0.018 || delta > 0.28 {
                    continue;
                }
                let max_step = 0.12 * (*time - previous_time) as f64 / 1000.0;
                let fraction = (max_step / delta).min(0.65);
                position = PanAnchor {
                    x: position.x + (target_x - position.x) * fraction,
                    y: position.y + (target_y - position.y) * fraction,
                    hold: false,
                };
                pan.insert(*time, position);
                previous_time = *time;
            }
            if end < duration {
                pan.insert(end - 1, position);
            }
            offset = end;
        }
    }

    let mut pulses = Vec::new();
    let mut last_peak = -2000;
    let segments = document.source_segments();
    for word in &document.words {
        if !choice.word_ids.contains(&word.id) || pulses.len() >= 4 {
            continue;
        }
        let start = (word.start_ms - 250).max(0);
        let peak = (word.start_ms + 150).min(duration);
        let end = (word.end_ms + 800).min(duration);
        let start_source = document.content_to_source(start);
        let end_source = document.content_to_source(end.saturating_sub(1));
        let inside_one_segment = segments.iter().any(|segment| {
            start_source.is_some_and(|source| source >= segment.start_ms)
                && end_source.is_some_and(|source| source < segment.end_ms)
        });
        if start > last_peak + 1600 && peak > start && end > peak && inside_one_segment {
            pulses.push((start, peak, end));
            last_peak = peak;
        }
    }
    review.emphasis_pulses = pulses.len();
    let first = pan.get(&0).unwrap();
    let has_pan = pan.iter().any(|(time, position)| {
        *time > 0 && (position.x - first.x).hypot(position.y - first.y) > 0.005
    });
    if !has_pan && pulses.is_empty() {
        return review;
    }
    let mut times = pan.keys().copied().collect::<BTreeSet<_>>();
    for (start, peak, end) in &pulses {
        times.extend([*start, *peak, *end]);
    }
    let keys = times
        .into_iter()
        .map(|time| {
            let position = pan_at(&pan, time);
            let zoom = pulses.iter().fold(1.0_f64, |zoom, (start, peak, end)| {
                let pulse = if time < *start || time > *end {
                    0.0
                } else if time <= *peak {
                    (time - start) as f64 / (peak - start) as f64
                } else {
                    (end - time) as f64 / (end - peak) as f64
                };
                zoom.max(1.0 + 0.12 * pulse)
            });
            motion::CameraKeyframe {
                time_ms: time,
                x: position.x,
                y: position.y,
                zoom,
                easing: if position.hold {
                    motion::Easing::Hold
                } else {
                    motion::Easing::Smooth
                },
            }
        })
        .collect::<Vec<_>>();
    review.anchors = keys.len();
    for segment in &mut document.segments {
        if segment.id.is_none() {
            segment.id = Some(
                uuid::Uuid::new_v5(
                    &uuid::Uuid::NAMESPACE_URL,
                    format!("uc-auto-motion:{}:{}", segment.start_ms, segment.end_ms).as_bytes(),
                )
                .to_string(),
            );
        }
    }
    document.version = document.version.max(4);
    document.keyframes.clear();
    document.camera_motion = keys;
    review
}

fn layer(kind: &str, start: i64, end: i64, duration: i64) -> VisualLayer {
    VisualLayer {
        id: uuid::Uuid::new_v4().to_string(),
        motion: Vec::new(),
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
            word.start_ms = document.content_to_source(word.start_ms).unwrap() - document.start_ms;
            word.end_ms =
                document.content_to_source(word.end_ms - 1).unwrap() + 1 - document.start_ms;
            word
        })
        .collect::<Vec<_>>();
    words.sort_by_key(|word| word.start_ms);
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
            document.source_to_content(source_start),
            document.source_to_content(source_end - 1),
        ) {
            target.start_ms = start;
            target.end_ms = end + 1;
            target.timing = aligned.timing.clone();
        }
    }
    let (segments, gaps) = trimmed_segments(&aligned_document, &report.regions);
    job.payload["alignment"] = serde_json::to_value(report)?;
    job.payload["silence_gaps"] = serde_json::to_value(gaps)?;
    Ok(aligned_document.replace_segments(segments))
}

fn trimmed_segments(
    document: &EditDocument,
    regions: &[alignment::SpeechRegion],
) -> (Vec<SourceSegment>, Vec<SilenceGap>) {
    let mut segments = Vec::new();
    let mut removed = Vec::new();
    for segment in document.source_segments() {
        let mut keep_from = segment.start_ms;
        for gap in regions.windows(2) {
            let from = (gap[0].end_ms + 120).max(segment.start_ms);
            let to = (gap[1].start_ms - 120).min(segment.end_ms);
            let protected = document.words.iter().any(|word| {
                let start = document.content_to_source(word.start_ms).unwrap();
                let end = document.content_to_source(word.end_ms - 1).unwrap() + 1;
                start < to && end > from
            });
            if to - from > 650 && !protected && from > keep_from {
                segments.push(segment.section(keep_from, from));
                removed.push(SilenceGap {
                    start_ms: from,
                    end_ms: to,
                });
                keep_from = to;
            }
        }
        segments.push(segment.section(keep_from, segment.end_ms));
    }
    (segments, removed)
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
    if job.payload["auto_motion"] == true {
        let review = propose_auto_motion(&mut document, &faces, &choice);
        job.payload["motion_review"] = serde_json::to_value(review)?;
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> Project {
        Project {
            id: "motion-fixture".into(),
            name: "Motion fixture".into(),
            source_kind: "file".into(),
            source_url: None,
            asset_id: "source".into(),
            preview_asset_id: None,
            thumbnail_id: None,
            duration_ms: 8000,
            width: 1280,
            height: 720,
            has_audio: true,
            language: Some("en".into()),
            transcript_configuration: None,
            created_at: 0,
            words: vec![Word {
                id: "emphasis".into(),
                text: "important".into(),
                start_ms: 2400,
                end_ms: 2800,
                emphasis: false,
                color: None,
                confidence: None,
                timing: None,
            }],
        }
    }

    fn face(x: f64) -> CropRect {
        CropRect {
            x,
            y: 0.2,
            width: 0.25,
            height: 0.5,
        }
    }

    #[test]
    fn automatic_motion_uses_single_face_pan_and_transcript_zoom() {
        let fixture = project();
        let mut document = EditDocument::new(&fixture, 0, 6000);
        let choice = Emphasis {
            word_ids: vec!["emphasis".into()],
            note_word_ids: Vec::new(),
        };
        let faces = vec![
            (0, vec![face(0.2)]),
            (1500, vec![face(0.25)]),
            (3000, vec![face(0.3)]),
            (4500, vec![face(0.35)]),
        ];
        let review = propose_auto_motion(&mut document, &faces, &choice);
        assert_eq!(review.single_face_samples, 4);
        assert_eq!(review.emphasis_pulses, 1);
        assert!(review.anchors >= 5);
        assert!(document.camera_motion.iter().any(|key| key.zoom > 1.1));
        assert!(document.camera_motion.last().unwrap().x > document.camera_motion[0].x);
        assert!(document.keyframes.is_empty());
        document.validate(fixture.duration_ms).unwrap();
    }

    #[test]
    fn automatic_motion_holds_across_reordered_scene_cuts() {
        let fixture = project();
        let mut document = EditDocument::new(&fixture, 0, 6000).replace_segments(vec![
            SourceSegment {
                id: Some("first".into()),
                start_ms: 0,
                end_ms: 2000,
            },
            SourceSegment {
                id: Some("second".into()),
                start_ms: 4000,
                end_ms: 6000,
            },
        ]);
        let choice = Emphasis {
            word_ids: Vec::new(),
            note_word_ids: Vec::new(),
        };
        let faces = vec![(0, vec![face(0.1)]), (2000, vec![face(0.65)])];
        let review = propose_auto_motion(&mut document, &faces, &choice);
        assert!(review.anchors > 0);
        let curve = motion::camera_curve(&document);
        assert!((curve.at(1999.0)[0] - curve.at(2000.0)[0]).abs() > 0.4);
        document.validate(fixture.duration_ms).unwrap();
    }

    #[test]
    fn silence_review_lists_only_unprotected_interior_gaps() {
        let fixture = project();
        let mut document = EditDocument::new(&fixture, 0, 6000);
        document.words.clear();
        let regions = [
            alignment::SpeechRegion {
                start_ms: 1000,
                end_ms: 1700,
            },
            alignment::SpeechRegion {
                start_ms: 3100,
                end_ms: 4000,
            },
        ];
        let (segments, gaps) = trimmed_segments(&document, &regions);
        assert_eq!(segments.len(), 2);
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].start_ms, 1820);
        assert_eq!(gaps[0].end_ms, 2980);
        let mut protected = document;
        protected.words.push(Word {
            id: "protected".into(),
            text: "reaction".into(),
            start_ms: 2500,
            end_ms: 2600,
            emphasis: false,
            color: None,
            confidence: None,
            timing: None,
        });
        let (segments, gaps) = trimmed_segments(&protected, &regions);
        assert_eq!(segments.len(), 1);
        assert!(gaps.is_empty());
    }
}

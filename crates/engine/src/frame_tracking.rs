use crate::{
    db,
    models::*,
    state::AppState,
    tools,
    tracking::{self, Face},
};
use anyhow::{Context, Result, ensure};
use ort::session::Session;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize, Deserialize)]
struct Detection {
    rect: CropRect,
    appearance: Vec<f64>,
    score: f64,
}

#[derive(Clone, Serialize, Deserialize)]
struct Sample {
    time_ms: i64,
    faces: Vec<Detection>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Shot {
    start_ms: i64,
    end_ms: i64,
    samples: Vec<Sample>,
}

fn descriptor(bytes: &[u8], face: &Face) -> Vec<f64> {
    let mut bins = vec![0.0; 24];
    let mut count = 0.0;
    for row in 0..8 {
        for column in 0..8 {
            let x = (face.x + face.width * (column as f64 + 0.5) / 8.0).clamp(0.0, 639.0) as usize;
            let y = (face.y + face.height * (row as f64 + 0.5) / 8.0).clamp(0.0, 639.0) as usize;
            let offset = (y * 640 + x) * 3;
            for channel in 0..3 {
                bins[channel * 8 + bytes[offset + channel] as usize / 32] += 1.0;
            }
            count += 1.0;
        }
    }
    for value in &mut bins {
        *value /= count;
    }
    bins
}

fn distance(a: &Detection, b: &Detection) -> f64 {
    a.appearance
        .iter()
        .zip(&b.appearance)
        .map(|(a, b)| (a - b).abs())
        .sum::<f64>()
        / 6.0
}

fn center(rect: &CropRect) -> (f64, f64) {
    (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0)
}

fn iou(a: &CropRect, b: &CropRect) -> f64 {
    let width = ((a.x + a.width).min(b.x + b.width) - a.x.max(b.x)).max(0.0);
    let height = ((a.y + a.height).min(b.y + b.height) - a.y.max(b.y)).max(0.0);
    let area = width * height;
    area / (a.width * a.height + b.width * b.height - area).max(0.00001)
}

fn associate<'a>(previous: &Detection, faces: &'a [Detection]) -> Option<&'a Detection> {
    let origin = center(&previous.rect);
    faces
        .iter()
        .filter(|face| {
            let next = center(&face.rect);
            let movement = (next.0 - origin.0).hypot(next.1 - origin.1);
            let size = (face.rect.width / previous.rect.width.max(0.001))
                .ln()
                .abs();
            movement < (previous.rect.width * 2.5).clamp(0.08, 0.3)
                && size < 0.8
                && distance(previous, face) < 0.5
        })
        .min_by(|a, b| {
            let cost = |face: &Detection| {
                let next = center(&face.rect);
                (next.0 - origin.0).hypot(next.1 - origin.1) * 3.0
                    + distance(previous, face) * 2.0
                    + (1.0 - iou(&previous.rect, &face.rect)) * 0.3
            };
            cost(a).total_cmp(&cost(b))
        })
}

fn choose<'a>(faces: &'a [Detection], crop: &CropRect) -> Option<&'a Detection> {
    let origin = center(crop);
    faces.iter().min_by(|a, b| {
        let cost = |face: &Detection| {
            let next = center(&face.rect);
            (next.0 - origin.0).hypot(next.1 - origin.1) - face.score * 0.03
        };
        cost(a).total_cmp(&cost(b))
    })
}

async fn scan_segment(
    state: &AppState,
    project: &Project,
    segment: &SourceSegment,
    output: i64,
    region: &CropRect,
    cancellation: &CancellationToken,
) -> Result<Vec<Shot>> {
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id).await?;
    let runtime = state.tools_root().join("onnxruntime/onnxruntime.dll");
    let model = state.tools_root().join("yunet.onnx");
    let width = ((region.width * project.width as f64).floor() as u32 / 2 * 2).max(2);
    let height = ((region.height * project.height as f64).floor() as u32 / 2 * 2).max(2);
    let x = ((region.x * project.width as f64).floor() as u32 / 2 * 2).min(project.width - width);
    let y =
        ((region.y * project.height as f64).floor() as u32 / 2 * 2).min(project.height - height);
    let actual = CropRect {
        x: x as f64 / project.width as f64,
        y: y as f64 / project.height as f64,
        width: width as f64 / project.width as f64,
        height: height as f64 / project.height as f64,
    };
    let scale = (640.0 / width as f64).min(640.0 / height as f64);
    let scaled_width = width as f64 * scale;
    let scaled_height = height as f64 * scale;
    let (sender, mut receiver) = tokio::sync::mpsc::channel::<Vec<u8>>(2);
    let token = cancellation.clone();
    let detector = tokio::task::spawn_blocking(move || -> Result<Vec<Sample>> {
        let environment = crate::onnx::environment(&runtime)?;
        let mut session = Session::builder(&environment)?
            .with_intra_threads(2)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .commit_from_file(model)?;
        let mut samples = Vec::new();
        let mut index = 0_i64;
        let mut previous: Vec<Detection> = Vec::new();
        let mut rapid = false;
        while let Some(frame) = receiver.blocking_recv() {
            ensure!(!token.is_cancelled(), "Job cancelled.");
            if index % 2 == 0 || rapid {
                let faces = tracking::detect(&mut session, &frame)?
                    .into_iter()
                    .filter(|face| {
                        face.x + face.width / 2.0 < scaled_width
                            && face.y + face.height / 2.0 < scaled_height
                    })
                    .map(|face| Detection {
                        rect: CropRect {
                            x: (actual.x + face.x.max(0.0) / scaled_width * actual.width)
                                .clamp(0.0, 1.0),
                            y: (actual.y + face.y.max(0.0) / scaled_height * actual.height)
                                .clamp(0.0, 1.0),
                            width: (face.width / scaled_width * actual.width).clamp(0.001, 1.0),
                            height: (face.height / scaled_height * actual.height).clamp(0.001, 1.0),
                        },
                        appearance: descriptor(&frame, &face),
                        score: face.score,
                    })
                    .collect::<Vec<_>>();
                rapid = previous.iter().any(|face| {
                    associate(face, &faces).is_some_and(|next| {
                        let a = center(&face.rect);
                        let b = center(&next.rect);
                        (a.0 - b.0).hypot(a.1 - b.1) > 0.012
                    })
                }) || faces.len() != previous.len();
                previous = faces.clone();
                samples.push(Sample {
                    time_ms: index * 250,
                    faces,
                });
            }
            index += 1;
        }
        Ok(samples)
    });
    let args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "info".into(),
        "-nostats".into(),
        "-ss".into(),
        format!("{:.3}", segment.start_ms as f64 / 1000.0),
        "-i".into(),
        source.to_string_lossy().into_owned(),
        "-t".into(),
        format!("{:.3}", (segment.end_ms - segment.start_ms) as f64 / 1000.0),
        "-an".into(),
        "-vf".into(),
        format!(
            "crop={width}:{height}:{x}:{y},scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:0:0:black,scdet=threshold=14,metadata=mode=print:key=lavfi.scd.time,fps=4"
        ),
        "-pix_fmt".into(),
        "bgr24".into(),
        "-f".into(),
        "rawvideo".into(),
        "pipe:1".into(),
    ];
    let decoded = tools::stream_frames(state, &args, 640 * 640 * 3, sender, cancellation).await;
    let detected = detector.await;
    let samples = detected??;
    let mut cuts = decoded?;
    let duration = segment.end_ms - segment.start_ms;
    cuts.retain(|time| *time > 0 && *time < duration);
    cuts.push(0);
    cuts.push(duration);
    cuts.sort_unstable();
    cuts.dedup();
    Ok(cuts
        .windows(2)
        .map(|pair| Shot {
            start_ms: output + pair[0],
            end_ms: output + pair[1],
            samples: samples
                .iter()
                .filter(|sample| sample.time_ms >= pair[0] && sample.time_ms < pair[1])
                .map(|sample| {
                    let mut sample = sample.clone();
                    sample.time_ms += output;
                    sample
                })
                .collect(),
        })
        .collect())
}

async fn scan(
    state: &AppState,
    project: &Project,
    document: &EditDocument,
    region: &CropRect,
    cancellation: &CancellationToken,
    job: Option<&mut Job>,
) -> Result<Vec<Shot>> {
    let segments = document.source_segments();
    let mut shots = Vec::new();
    let mut output = 0;
    let mut job = job;
    for (index, segment) in segments.iter().enumerate() {
        if let Some(job) = job.as_deref_mut() {
            state
                .progress(
                    job,
                    "tracking",
                    0.1 + 0.7 * index as f64 / segments.len() as f64,
                    "Sampling edited scenes through a bounded frame stream.",
                )
                .await?;
        }
        shots.extend(scan_segment(state, project, segment, output, region, cancellation).await?);
        output += segment.end_ms - segment.start_ms;
    }
    Ok(shots)
}

fn framed(face: &CropRect, crop: &CropRect) -> CropRect {
    let at = center(face);
    CropRect {
        x: (at.0 - crop.width / 2.0).clamp(0.0, 1.0 - crop.width),
        y: (at.1 - crop.height * 0.38)
            .min(face.y - crop.height * 0.06)
            .clamp(0.0, 1.0 - crop.height),
        width: crop.width,
        height: crop.height,
    }
}

fn move_crop(previous: &CropRect, next: &CropRect, seconds: f64) -> CropRect {
    let step = |old: f64, new: f64, size: f64| {
        let delta = new - old;
        if delta.abs() < size * 0.02 {
            old
        } else {
            old + (delta * 0.65).clamp(-size * seconds * 0.8, size * seconds * 0.8)
        }
    };
    CropRect {
        x: step(previous.x, next.x, previous.width),
        y: step(previous.y, next.y, previous.height),
        width: previous.width,
        height: previous.height,
    }
}

fn follow(shots: &[Shot], crop: &CropRect) -> (Vec<Keyframe>, usize, usize) {
    let mut keys = Vec::new();
    let mut position = crop.clone();
    let mut hits = 0;
    let mut missing = 0;
    for shot in shots {
        let before = position.clone();
        let mut subject: Option<Detection> = None;
        let mut previous_time = shot.start_ms;
        for sample in &shot.samples {
            let face = match &subject {
                Some(previous) => associate(previous, &sample.faces),
                None => choose(&sample.faces, &position),
            };
            if let Some(face) = face {
                let next = framed(&face.rect, crop);
                position = if subject.is_none() {
                    next
                } else {
                    move_crop(
                        &position,
                        &next,
                        (sample.time_ms - previous_time).max(1) as f64 / 1000.0,
                    )
                };
                subject = Some(face.clone());
                hits += 1;
            } else {
                missing += 1;
            }
            if sample.time_ms
                == shot
                    .samples
                    .first()
                    .map_or(shot.start_ms, |sample| sample.time_ms)
            {
                if shot.start_ms > 0 {
                    keys.push(Keyframe {
                        time_ms: shot.start_ms - 1,
                        x: before.x,
                        y: before.y,
                    });
                }
                keys.push(Keyframe {
                    time_ms: shot.start_ms,
                    x: position.x,
                    y: position.y,
                });
            }
            keys.push(Keyframe {
                time_ms: sample.time_ms,
                x: position.x,
                y: position.y,
            });
            previous_time = sample.time_ms;
        }
    }
    keys.sort_by_key(|key| key.time_ms);
    keys.dedup_by_key(|key| key.time_ms);
    (keys, hits, missing)
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    values[values.len() / 2]
}

fn stable_face(faces: &[Detection]) -> CropRect {
    let mut x = faces.iter().map(|face| face.rect.x).collect::<Vec<_>>();
    let mut y = faces.iter().map(|face| face.rect.y).collect::<Vec<_>>();
    let mut width = faces.iter().map(|face| face.rect.width).collect::<Vec<_>>();
    let mut height = faces
        .iter()
        .map(|face| face.rect.height)
        .collect::<Vec<_>>();
    CropRect {
        x: median(&mut x),
        y: median(&mut y),
        width: median(&mut width),
        height: median(&mut height),
    }
}

fn split_crop(face: &CropRect, project: &Project, ratio: f64) -> CropRect {
    let aspect = project.width as f64 / project.height as f64;
    let width = (face.width * 3.0).clamp(0.18, 1.0);
    let height = (width * aspect / ratio).min(1.0);
    let width = height * ratio / aspect;
    framed(
        face,
        &CropRect {
            x: 0.0,
            y: 0.0,
            width,
            height,
        },
    )
}

fn split_layers(shots: &[Shot], project: &Project, clip_id: &str) -> Vec<VisualLayer> {
    let mut result = Vec::new();
    for shot in shots {
        let Some(first) = shot.samples.iter().find(|sample| sample.faces.len() >= 2) else {
            continue;
        };
        let mut initial = first.faces.clone();
        initial.sort_by(|a, b| b.rect.width.total_cmp(&a.rect.width));
        initial.truncate(2);
        initial.sort_by(|a, b| a.rect.x.total_cmp(&b.rect.x));
        let mut tracks = [vec![initial[0].clone()], vec![initial[1].clone()]];
        for sample in shot
            .samples
            .iter()
            .filter(|sample| sample.time_ms > first.time_ms)
        {
            for track in &mut tracks {
                if let Some(face) =
                    associate(track.last().expect("Initial face exists"), &sample.faces)
                {
                    track.push(face.clone());
                }
            }
        }
        if tracks
            .iter()
            .any(|track| track.len() * 5 < shot.samples.len() * 3)
        {
            continue;
        }
        let a = stable_face(&tracks[0]);
        let b = stable_face(&tracks[1]);
        if iou(&a, &b) > 0.2 {
            continue;
        }
        result.push(VisualLayer {
            id: format!("track-split:{clip_id}:{}", shot.start_ms),
            motion: Vec::new(),
            enabled: true,
            start_ms: shot.start_ms,
            end_ms: shot.end_ms,
            kind: "split".into(),
            text: String::new(),
            crop: Some(split_crop(&a, project, 9.0 / 8.0)),
            secondary_crop: Some(split_crop(&b, project, 9.0 / 8.0)),
            x: 0.5,
            y: 0.5,
            color: "#FFFFFF".into(),
            size: 60,
            asset_id: None,
            source_start_ms: 0,
        });
    }
    result
}

pub(crate) async fn sample_faces(
    state: &AppState,
    project: &Project,
    document: &EditDocument,
    cancellation: &CancellationToken,
) -> Result<Vec<(i64, Vec<CropRect>)>> {
    let shots = scan(
        state,
        project,
        document,
        &CropRect::default(),
        cancellation,
        None,
    )
    .await?;
    Ok(shots
        .into_iter()
        .flat_map(|shot| shot.samples)
        .map(|sample| {
            let mut faces = sample.faces;
            faces.sort_by(|a, b| a.rect.x.total_cmp(&b.rect.x));
            (
                sample.time_ms,
                faces
                    .iter()
                    .take(2)
                    .map(|face| framed(&face.rect, &document.crop))
                    .collect(),
            )
        })
        .collect())
}

pub(crate) async fn track(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let id = job.clip_id.clone().context("Missing clip")?;
    let current = db::clip(&state.db, &id).await?;
    if job.payload["tracking_committed_revision"].as_i64() == Some(current.revision) {
        return Ok(());
    }
    let mut clip: Clip = if job.payload["frozen_clip"].is_object() {
        serde_json::from_value(job.payload["frozen_clip"].clone())?
    } else {
        current.clone()
    };
    let revision = job.payload["revision"]
        .as_i64()
        .context("Missing edit revision")?;
    ensure!(
        current.revision == revision,
        "This clip changed while queued. Start tracking again."
    );
    let project = db::project(&state.db, &clip.project_id).await?;
    let mode = job.payload["mode"].as_str().unwrap_or("follow").to_string();
    let region = if mode == "facecam" {
        clip.document.facecam_crop.clone()
    } else {
        CropRect::default()
    };
    let shots: Vec<Shot> = if job.payload["tracking_shots"].is_array() {
        serde_json::from_value(job.payload["tracking_shots"].clone())?
    } else {
        let shots = scan(
            state,
            &project,
            &clip.document,
            &region,
            cancellation,
            Some(job),
        )
        .await?;
        job.payload["tracking_shots"] = json!(shots);
        db::save_job(&state.db, job).await?;
        shots
    };
    let (keys, hits, missing) = follow(
        &shots,
        if mode == "facecam" {
            &region
        } else {
            &clip.document.crop
        },
    );
    ensure!(
        hits > 0,
        "No face was detected in the chosen region. Adjust the crop or choose another framing mode."
    );
    let mut splits = 0;
    if mode == "facecam" {
        let mut positions = Vec::new();
        for shot in &shots {
            let mut subject: Option<Detection> = None;
            for sample in &shot.samples {
                let selected = match &subject {
                    Some(previous) => associate(previous, &sample.faces),
                    None => choose(&sample.faces, &region),
                };
                if let Some(face) = selected {
                    subject = Some(face.clone());
                    positions.push(face.clone());
                }
            }
        }
        ensure!(!positions.is_empty(), "No stable facecam was detected.");
        positions.sort_by(|a, b| b.score.total_cmp(&a.score));
        let (output_width, output_height) =
            clip.document.layout.dimensions(clip.document.resolution);
        let ratio = output_width as f64 / (output_height as f64 * clip.document.split_ratio);
        let mut fitted = split_crop(&stable_face(&positions), &project, ratio);
        let factor = (region.width / fitted.width)
            .min(region.height / fitted.height)
            .min(1.0);
        fitted.width *= factor;
        fitted.height *= factor;
        fitted.x = fitted
            .x
            .clamp(region.x, region.x + region.width - fitted.width);
        fitted.y = fitted
            .y
            .clamp(region.y, region.y + region.height - fitted.height);
        clip.document.facecam_crop = fitted;
    } else {
        clip.document.keyframes = keys;
        clip.document.camera_motion.clear();
        let prefix = format!("track-split:{}:", clip.id);
        clip.document
            .visual_layers
            .retain(|layer| !layer.id.starts_with(&prefix));
        if mode == "split" {
            let layers = split_layers(&shots, &project, &clip.id)
                .into_iter()
                .filter(|candidate| {
                    !clip.document.visual_layers.iter().any(|layer| {
                        layer.enabled
                            && ["split", "punch_in"].contains(&layer.kind.as_str())
                            && layer.start_ms < candidate.end_ms
                            && candidate.start_ms < layer.end_ms
                    })
                })
                .collect::<Vec<_>>();
            splits = layers.len();
            clip.document.visual_layers.extend(layers);
        }
    }
    clip.document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    job.payload["tracking_report"] = json!({"mode": mode, "detections": hits, "missing_samples": missing,
        "shots": shots.len(), "split_shots": splits, "active_speaker_detection": false});
    state
        .progress(
            job,
            "tracking",
            0.95,
            "Saving scene-aware framing; review uncertain sections in Edited preview.",
        )
        .await?;
    let _gate = state.operation_gate.lock().await;
    ensure!(!cancellation.is_cancelled(), "Job cancelled.");
    clip.revision += 1;
    db::commit_tracking(&state.db, &clip, revision, job).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn face(x: f64, color: usize) -> Detection {
        let mut appearance = vec![0.0; 24];
        appearance[color] = 3.0;
        Detection {
            rect: CropRect {
                x,
                y: 0.2,
                width: 0.1,
                height: 0.15,
            },
            appearance,
            score: 0.95,
        }
    }

    #[test]
    fn association_preserves_subject_when_another_face_moves_closer() {
        let subject = face(0.2, 1);
        let faces = [face(0.21, 2), face(0.24, 1)];
        assert_eq!(associate(&subject, &faces).unwrap().rect.x, 0.24);
        assert!(associate(&subject, &[face(0.21, 2)]).is_none());
    }

    #[test]
    fn shot_boundaries_hold_old_position_then_jump_without_a_pan() {
        let shots = [
            Shot {
                start_ms: 0,
                end_ms: 1000,
                samples: vec![Sample {
                    time_ms: 0,
                    faces: vec![face(0.1, 1)],
                }],
            },
            Shot {
                start_ms: 1000,
                end_ms: 2000,
                samples: vec![Sample {
                    time_ms: 1000,
                    faces: vec![face(0.7, 2)],
                }],
            },
        ];
        let crop = CropRect {
            x: 0.2,
            y: 0.0,
            width: 0.3,
            height: 1.0,
        };
        let (keys, hits, _) = follow(&shots, &crop);
        assert_eq!(hits, 2);
        assert!(
            keys.iter()
                .any(|key| key.time_ms == 999 && key.x.abs() < 1e-9)
        );
        assert!(keys.iter().any(|key| key.time_ms == 1000 && key.x > 0.5));
        assert!(
            keys.windows(2)
                .all(|pair| pair[0].time_ms < pair[1].time_ms)
        );
    }
}

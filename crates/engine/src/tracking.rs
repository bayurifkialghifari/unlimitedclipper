use crate::{db, models::*, state::AppState, tools};
use anyhow::{Context, Result};
use ort::{session::Session, value::Tensor};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
struct Face {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    score: f64,
}

pub async fn sample_faces(
    state: &AppState,
    project: &Project,
    document: &EditDocument,
    cancellation: &CancellationToken,
) -> Result<Vec<(i64, Vec<CropRect>)>> {
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id).await?;
    let span = document.end_ms - document.start_ms;
    let interval = (span as f64 / 48.0).max(500.0);
    let frames = tools::capture_managed(
        state,
        "ffmpeg",
        "ffmpeg",
        &[
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-ss".into(),
            format!("{:.3}", document.start_ms as f64 / 1000.0),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-t".into(),
            format!("{:.3}", span as f64 / 1000.0),
            "-vf".into(),
            format!(
                "fps={:.6},scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:0:0",
                1000.0 / interval
            ),
            "-frames:v".into(),
            "48".into(),
            "-pix_fmt".into(),
            "bgr24".into(),
            "-f".into(),
            "rawvideo".into(),
            "pipe:1".into(),
        ],
        cancellation,
    )
    .await?;
    let runtime = state.tools_root().join("onnxruntime/onnxruntime.dll");
    let model = state.tools_root().join("yunet.onnx");
    let project = project.clone();
    let document = document.clone();
    let cancellation = cancellation.clone();
    tokio::task::spawn_blocking(move || -> Result<_> {
        let environment = ort::init_from(runtime)?.build()?;
        let mut session = Session::builder(&environment)?
            .with_intra_threads(4)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .commit_from_file(model)?;
        let scale = (640.0 / project.width as f64).min(640.0 / project.height as f64);
        let mut samples = Vec::new();
        for (index, frame) in frames.as_chunks::<{ 640 * 640 * 3 }>().0.iter().enumerate() {
            anyhow::ensure!(!cancellation.is_cancelled(), "Job cancelled.");
            let source = document.start_ms + (index as f64 * interval).round() as i64;
            let Some(time) = document.source_to_output(source) else {
                continue;
            };
            let mut faces = detect(&mut session, frame)?;
            faces.sort_by(|a, b| a.x.total_cmp(&b.x));
            let crops = faces
                .into_iter()
                .take(2)
                .map(|face| {
                    let width = document.crop.width;
                    let height = document.crop.height;
                    CropRect {
                        x: ((face.x + face.width / 2.0) / scale / project.width as f64
                            - width / 2.0)
                            .clamp(0.0, 1.0 - width),
                        y: ((face.y + face.height / 2.0) / scale / project.height as f64
                            - height / 2.0)
                            .clamp(0.0, 1.0 - height),
                        width,
                        height,
                    }
                })
                .collect();
            samples.push((time, crops));
        }
        Ok(samples)
    })
    .await?
}

fn overlap(a: &Face, b: &Face) -> f64 {
    let width = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
    let height = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);
    let area = width.max(0.0) * height.max(0.0);
    area / (a.width * a.height + b.width * b.height - area).max(0.001)
}

fn detect(session: &mut Session, bytes: &[u8]) -> Result<Vec<Face>> {
    let pixels = 640 * 640;
    let mut data = vec![0.0_f32; pixels * 3];
    for (index, pixel) in bytes.as_chunks::<3>().0.iter().enumerate() {
        for channel in 0..3 {
            data[channel * pixels + index] = pixel[channel] as f32;
        }
    }
    let tensor = Tensor::from_array(([1_usize, 3, 640, 640], data))?;
    let outputs = session.run(ort::inputs![tensor])?;
    let mut candidates = Vec::new();
    for stride in [8, 16, 32] {
        let columns = 640 / stride;
        let (_, classes) = outputs[format!("cls_{stride}").as_str()].try_extract_tensor::<f32>()?;
        let (_, objects) = outputs[format!("obj_{stride}").as_str()].try_extract_tensor::<f32>()?;
        let (_, boxes) = outputs[format!("bbox_{stride}").as_str()].try_extract_tensor::<f32>()?;
        anyhow::ensure!(
            classes.len() == columns * columns
                && objects.len() == classes.len()
                && boxes.len() == classes.len() * 4,
            "Face detector output shape is incompatible."
        );
        for index in 0..classes.len() {
            let score =
                (classes[index].clamp(0.0, 1.0) * objects[index].clamp(0.0, 1.0)).sqrt() as f64;
            if score < 0.7 {
                continue;
            }
            let center_x = ((index % columns) as f64 + boxes[index * 4] as f64) * stride as f64;
            let center_y = ((index / columns) as f64 + boxes[index * 4 + 1] as f64) * stride as f64;
            let width = (boxes[index * 4 + 2] as f64).exp() * stride as f64;
            let height = (boxes[index * 4 + 3] as f64).exp() * stride as f64;
            if width.is_finite() && height.is_finite() {
                candidates.push(Face {
                    x: center_x - width / 2.0,
                    y: center_y - height / 2.0,
                    width,
                    height,
                    score,
                });
            }
        }
    }
    candidates.sort_by(|a, b| b.score.total_cmp(&a.score));
    let mut faces = Vec::new();
    for face in candidates {
        if !faces.iter().any(|other| overlap(&face, other) > 0.3) {
            faces.push(face);
        }
    }
    Ok(faces)
}

pub async fn track(
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
        "This clip changed while queued. Start tracking again."
    );
    let project = db::project(&state.db, &clip.project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let duration = clip.document.end_ms - clip.document.start_ms;
    let interval = (duration as f64 / 96.0).max(500.0);
    state
        .progress(
            job,
            "tracking",
            0.1,
            "Sampling video frames for local face tracking.",
        )
        .await?;
    let frames = tools::capture_managed(
        state,
        "ffmpeg",
        "ffmpeg",
        &[
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-ss".into(),
            format!("{:.3}", clip.document.start_ms as f64 / 1000.0),
            "-i".into(),
            source.to_string_lossy().into_owned(),
            "-t".into(),
            format!("{:.3}", duration as f64 / 1000.0),
            "-vf".into(),
            format!(
                "fps={},scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:0:0:black",
                1000.0 / interval
            ),
            "-frames:v".into(),
            "96".into(),
            "-pix_fmt".into(),
            "bgr24".into(),
            "-f".into(),
            "rawvideo".into(),
            "pipe:1".into(),
        ],
        cancellation,
    )
    .await?;
    let runtime = state.tools_root().join("onnxruntime/onnxruntime.dll");
    let model = state.tools_root().join("yunet.onnx");
    let crop = clip.document.crop.clone();
    let cancellation = cancellation.clone();
    state
        .progress(
            job,
            "tracking",
            0.4,
            "Detecting and following the face nearest the current crop center.",
        )
        .await?;
    let keyframes = tokio::task::spawn_blocking(move || -> Result<Vec<Keyframe>> {
        let environment = ort::init_from(runtime)?.build()?;
        let mut session = Session::builder(&environment)?
            .with_intra_threads(4)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .commit_from_file(model)?;
        let scale = (640.0 / project.width as f64).min(640.0 / project.height as f64);
        let scaled_width = project.width as f64 * scale;
        let scaled_height = project.height as f64 * scale;
        let mut center = (crop.x + crop.width / 2.0, crop.y + crop.height / 2.0);
        let mut keyframes = Vec::new();
        let mut detections = 0;
        for (index, frame) in frames.as_chunks::<{ 640 * 640 * 3 }>().0.iter().enumerate() {
            anyhow::ensure!(!cancellation.is_cancelled(), "Job cancelled.");
            let faces = detect(&mut session, frame)?;
            let face = faces.iter().min_by(|a, b| {
                let distance = |face: &Face| {
                    (face.x / scaled_width + face.width / scaled_width / 2.0 - center.0).powi(2)
                        + (face.y / scaled_height + face.height / scaled_height / 2.0 - center.1)
                            .powi(2)
                };
                distance(a).total_cmp(&distance(b))
            });
            if let Some(face) = face {
                let next = (
                    (face.x + face.width / 2.0) / scaled_width,
                    (face.y + face.height / 2.0) / scaled_height,
                );
                let weight = if detections == 0 { 1.0 } else { 0.4 };
                center = (
                    center.0 * (1.0 - weight) + next.0 * weight,
                    center.1 * (1.0 - weight) + next.1 * weight,
                );
                detections += 1;
            }
            keyframes.push(Keyframe {
                time_ms: (index as f64 * interval).round() as i64,
                x: (center.0 - crop.width / 2.0).clamp(0.0, 1.0 - crop.width),
                y: (center.1 - crop.height / 2.0).clamp(0.0, 1.0 - crop.height),
            });
        }
        anyhow::ensure!(
            detections > 0,
            "No face was detected. Position the crop manually or select another region."
        );
        Ok(keyframes)
    })
    .await??;
    clip.document.keyframes = keyframes;
    let project = db::project(&state.db, &clip.project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    clip.document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    clip.revision += 1;
    db::update_clip(&state.db, &clip, revision)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    Ok(())
}

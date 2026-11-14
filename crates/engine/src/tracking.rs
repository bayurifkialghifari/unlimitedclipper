use crate::{models::*, state::AppState};
use anyhow::Result;
use ort::{session::Session, value::Tensor};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub(crate) struct Face {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub score: f64,
}

pub async fn sample_faces(
    state: &AppState,
    project: &Project,
    document: &EditDocument,
    cancellation: &CancellationToken,
) -> Result<Vec<(i64, Vec<CropRect>)>> {
    crate::frame_tracking::sample_faces(state, project, document, cancellation).await
}

fn overlap(a: &Face, b: &Face) -> f64 {
    let width = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
    let height = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);
    let area = width.max(0.0) * height.max(0.0);
    area / (a.width * a.height + b.width * b.height - area).max(0.001)
}

pub(crate) fn detect(session: &mut Session, bytes: &[u8]) -> Result<Vec<Face>> {
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
    crate::frame_tracking::track(state, job, cancellation).await
}

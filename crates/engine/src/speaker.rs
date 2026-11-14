use crate::alignment::SpeechRegion;
use crate::{quality_pack, state::AppState};
use anyhow::{Result, ensure};
use ort::{session::Session, value::Tensor};
use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Serialize, Deserialize)]
pub struct SpeakerTurn {
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker: usize,
    pub confidence: f64,
}

pub fn features(audio: &[f32]) -> Vec<f32> {
    let count = audio.len() / 160 + 1;
    let fft = FftPlanner::new().plan_fft_forward(400);
    let maximum_mel = 2595.0_f32 * (1.0_f32 + 8000.0 / 700.0).log10();
    let frequencies: Vec<_> = (0..82)
        .map(|index| 700.0 * (10.0_f32.powf(maximum_mel * index as f32 / 81.0 / 2595.0) - 1.0))
        .collect();
    let mut output = vec![0.0_f32; count * 80];
    let mut buffer = vec![Complex::default(); 400];
    for frame in 0..count {
        for (index, bin) in buffer.iter_mut().enumerate() {
            let sample = frame as i64 * 160 + index as i64 - 200;
            let value = if sample >= 0 {
                audio.get(sample as usize).copied().unwrap_or(0.0)
            } else {
                0.0
            };
            let window = 0.54 - 0.46 * (2.0 * std::f32::consts::PI * index as f32 / 400.0).cos();
            *bin = Complex::new(value * window, 0.0);
        }
        fft.process(&mut buffer);
        for mel in 0..80 {
            let center = frequencies[mel + 1];
            let band = frequencies[mel + 1] - frequencies[mel];
            let power: f32 = buffer[..201]
                .iter()
                .enumerate()
                .map(|(index, bin)| {
                    let weight = (1.0 - ((index as f32 * 40.0 - center) / band).abs()).max(0.0);
                    bin.norm_sqr() * weight
                })
                .sum();
            output[frame * 80 + mel] = 10.0 * power.max(1e-10).log10();
        }
    }
    let floor = output.iter().copied().fold(f32::NEG_INFINITY, f32::max) - 80.0;
    for value in &mut output {
        *value = value.max(floor);
    }
    for mel in 0..80 {
        let mean = (0..count)
            .map(|frame| output[frame * 80 + mel])
            .sum::<f32>()
            / count as f32;
        for frame in 0..count {
            output[frame * 80 + mel] -= mean;
        }
    }
    output
}

pub async fn identify(
    state: &AppState,
    audio: Vec<f32>,
    regions: Vec<SpeechRegion>,
    source_start: i64,
    cancellation: &CancellationToken,
) -> Result<Vec<SpeakerTurn>> {
    if !quality_pack::status(state).await.ready {
        return Ok(Vec::new());
    }
    let model = quality_pack::directory(state).join("speaker.onnx");
    let suffix = if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    };
    let runtime = state.tools_root().join("onnxruntime").join(suffix);
    let cancellation = cancellation.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<SpeakerTurn>> {
        let environment = crate::onnx::environment(&runtime)?;
        let mut session = Session::builder(&environment)?
            .with_intra_threads(4)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?
            .commit_from_file(model)?;
        let mut centroids: Vec<Vec<f32>> = Vec::new();
        let mut turns = Vec::new();
        for region in regions {
            for start in (region.start_ms..region.end_ms).step_by(2000) {
                ensure!(!cancellation.is_cancelled(), "Job cancelled.");
                let end = (start + 2000).min(region.end_ms);
                if end - start < 500 {
                    continue;
                }
                let first = (start - source_start).max(0) as usize * 16;
                let last = ((end - source_start).max(0) as usize * 16).min(audio.len());
                if last <= first {
                    continue;
                }
                let input = features(&audio[first..last]);
                let output = session.run(ort::inputs!["features" =>
                    Tensor::from_array(([1_usize, input.len() / 80, 80], input))?])?;
                let (_, vector) = output["embedding"].try_extract_tensor::<f32>()?;
                let norm = vector
                    .iter()
                    .map(|value| value * value)
                    .sum::<f32>()
                    .sqrt()
                    .max(1e-8);
                let vector: Vec<_> = vector.iter().map(|value| value / norm).collect();
                let best = centroids
                    .iter()
                    .enumerate()
                    .map(|(index, center)| {
                        (
                            index,
                            center.iter().zip(&vector).map(|(a, b)| a * b).sum::<f32>(),
                        )
                    })
                    .max_by(|a, b| a.1.total_cmp(&b.1));
                let (speaker, confidence) =
                    if let Some((index, similarity)) = best.filter(|(_, score)| *score > 0.65) {
                        (index, similarity as f64)
                    } else if centroids.len() < 8 {
                        centroids.push(vector);
                        (centroids.len() - 1, 0.65)
                    } else {
                        (
                            best.map_or(0, |value| value.0),
                            best.map_or(0.0, |value| value.1 as f64),
                        )
                    };
                turns.push(SpeakerTurn {
                    start_ms: start,
                    end_ms: end,
                    speaker,
                    confidence,
                });
            }
        }
        Ok(turns)
    })
    .await?
}

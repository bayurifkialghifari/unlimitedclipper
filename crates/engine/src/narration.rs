use crate::{db, models::*, state::AppState};
use anyhow::{Context, Result, ensure};
use ort::{session::Session, value::Tensor};
use serde::Deserialize;
use std::path::Path;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct ModelConfig {
    ae: AudioConfig,
    ttl: LatentConfig,
}

#[derive(Deserialize)]
struct AudioConfig {
    sample_rate: u32,
    base_chunk_size: usize,
}

#[derive(Deserialize)]
struct LatentConfig {
    chunk_compress_factor: usize,
    latent_dim: usize,
}

#[derive(Deserialize)]
struct StyleFile {
    style_ttl: StyleTensor,
    style_dp: StyleTensor,
}

#[derive(Deserialize)]
struct StyleTensor {
    data: Vec<Vec<Vec<f32>>>,
    dims: Vec<usize>,
}

fn style_values(tensor: StyleTensor, dimensions: [usize; 3]) -> Result<Vec<f32>> {
    ensure!(
        tensor.dims == dimensions,
        "Narration voice style has unexpected dimensions."
    );
    let values = tensor
        .data
        .into_iter()
        .flat_map(|batch| batch.into_iter().flat_map(|row| row.into_iter()))
        .collect::<Vec<_>>();
    ensure!(
        values.len() == dimensions.iter().product::<usize>()
            && values.iter().all(|value| value.is_finite()),
        "Narration voice style contains invalid values."
    );
    Ok(values)
}

fn model_session(environment: &ort::environment::Environment, path: &Path) -> Result<Session> {
    Ok(Session::builder(environment)?
        .with_intra_threads(2)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?
        .commit_from_file(path)?)
}

fn uniform(seed: &mut u64) -> f64 {
    *seed ^= *seed >> 12;
    *seed ^= *seed << 25;
    *seed ^= *seed >> 27;
    let value = seed.wrapping_mul(0x2545_F491_4F6C_DD1D);
    ((value >> 11) as f64 + 0.5) / ((1_u64 << 53) as f64)
}

fn normal(seed: &mut u64) -> f32 {
    let radius = (-2.0 * uniform(seed).ln()).sqrt();
    let angle = std::f64::consts::TAU * uniform(seed);
    (radius * angle.cos()) as f32
}

fn prepared_text(text: &str, language: &str, indexer: &[i64]) -> Result<Vec<i64>> {
    ensure!(
        ["id", "en"].contains(&language),
        "Narration currently supports Indonesian and English."
    );
    let normalized = text
        .replace(['“', '”'], "\"")
        .replace(['‘', '’'], "'")
        .replace(['–', '—'], "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    ensure!(
        !normalized.is_empty() && normalized.chars().count() <= 280,
        "Narration text must contain 1 to 280 characters."
    );
    let punctuation = ['.', '!', '?', ';', ':', ',', '\'', '"', ')'];
    let sentence = if normalized
        .chars()
        .last()
        .is_some_and(|character| punctuation.contains(&character))
    {
        normalized
    } else {
        normalized + "."
    };
    let marked = format!("<{language}>{sentence}</{language}>");
    marked
        .chars()
        .map(|character| {
            indexer
                .get(character as usize)
                .copied()
                .filter(|value| *value >= 0)
                .context("Narration text contains a character unsupported by this model.")
        })
        .collect()
}

pub fn synthesize(
    pack: &Path,
    runtime: &Path,
    text: &str,
    language: &str,
    voice: &str,
    cancellation: &CancellationToken,
) -> Result<(Vec<f32>, u32)> {
    ensure!(
        voice == "M1",
        "Only the installed M1 narration voice is available."
    );
    let config: ModelConfig = serde_json::from_slice(&std::fs::read(pack.join("onnx/tts.json"))?)?;
    let indexer: Vec<i64> =
        serde_json::from_slice(&std::fs::read(pack.join("onnx/unicode_indexer.json"))?)?;
    let text_ids = prepared_text(text, language, &indexer)?;
    let length = text_ids.len();
    let style: StyleFile =
        serde_json::from_slice(&std::fs::read(pack.join("voice_styles/M1.json"))?)?;
    let style_ttl = style_values(style.style_ttl, [1, 50, 256])?;
    let style_dp = style_values(style.style_dp, [1, 8, 16])?;
    ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
    let environment = crate::onnx::environment(runtime)?;
    let mut duration_session =
        model_session(&environment, &pack.join("onnx/duration_predictor.onnx"))?;
    let mut encoder = model_session(&environment, &pack.join("onnx/text_encoder.onnx"))?;
    let mut estimator = model_session(&environment, &pack.join("onnx/vector_estimator.onnx"))?;
    let mut vocoder = model_session(&environment, &pack.join("onnx/vocoder.onnx"))?;
    let text_mask = vec![1.0_f32; length];
    let prediction = duration_session.run(ort::inputs![
        "text_ids" => Tensor::from_array(([1_usize, length], text_ids.clone()))?,
        "style_dp" => Tensor::from_array(([1_usize, 8, 16], style_dp))?,
        "text_mask" => Tensor::from_array(([1_usize, 1, length], text_mask.clone()))?
    ])?;
    let (_, predicted) = prediction["duration"].try_extract_tensor::<f32>()?;
    let seconds = predicted
        .first()
        .copied()
        .context("Narration model returned no duration.")?
        / 1.05;
    ensure!(
        seconds.is_finite() && seconds > 0.1 && seconds <= 20.0,
        "Narration model returned an invalid duration."
    );
    ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
    let encoded = encoder.run(ort::inputs![
        "text_ids" => Tensor::from_array(([1_usize, length], text_ids))?,
        "style_ttl" => Tensor::from_array(([1_usize, 50, 256], style_ttl.clone()))?,
        "text_mask" => Tensor::from_array(([1_usize, 1, length], text_mask.clone()))?
    ])?;
    let (embedding_shape, embedding) = encoded["text_emb"].try_extract_tensor::<f32>()?;
    ensure!(
        embedding_shape.len() == 3 && embedding_shape[0] == 1,
        "Narration encoder returned an invalid shape."
    );
    let embedding_shape = embedding_shape
        .iter()
        .map(|value| *value as usize)
        .collect::<Vec<_>>();
    let latent_channels = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
    let chunk_size = config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
    let sample_count = (seconds * config.ae.sample_rate as f32) as usize;
    let latent_length = sample_count.div_ceil(chunk_size);
    ensure!(
        latent_length > 0 && latent_length <= 800,
        "Narration latent length is invalid."
    );
    let mut seed = 0xA2C4_D921_EA48_675B_u64;
    for byte in text.bytes().chain(language.bytes()) {
        seed ^= byte as u64;
        seed = seed.wrapping_mul(0x100_0000_01B3);
    }
    let mut latent = (0..latent_channels * latent_length)
        .map(|_| normal(&mut seed))
        .collect::<Vec<_>>();
    for step in 0..8 {
        ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
        let output = estimator.run(ort::inputs![
            "noisy_latent" => Tensor::from_array(([1_usize, latent_channels, latent_length], latent))?,
            "text_emb" => Tensor::from_array((embedding_shape.clone(), embedding.to_vec()))?,
            "style_ttl" => Tensor::from_array(([1_usize, 50, 256], style_ttl.clone()))?,
            "latent_mask" => Tensor::from_array(([1_usize, 1, latent_length], vec![1.0_f32; latent_length]))?,
            "text_mask" => Tensor::from_array(([1_usize, 1, length], text_mask.clone()))?,
            "current_step" => Tensor::from_array(([1_usize], vec![step as f32]))?,
            "total_step" => Tensor::from_array(([1_usize], vec![8.0_f32]))?
        ])?;
        let (_, denoised) = output["denoised_latent"].try_extract_tensor::<f32>()?;
        latent = denoised.to_vec();
    }
    ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
    let output = vocoder.run(ort::inputs![
        "latent" => Tensor::from_array(([1_usize, latent_channels, latent_length], latent))?
    ])?;
    let (_, samples) = output["wav_tts"].try_extract_tensor::<f32>()?;
    ensure!(
        samples.len() >= sample_count,
        "Narration vocoder returned short audio."
    );
    let audio = samples[..sample_count].to_vec();
    ensure!(
        audio.iter().all(|sample| sample.is_finite()),
        "Narration vocoder returned invalid audio."
    );
    Ok((audio, config.ae.sample_rate))
}

fn wav_duration(path: &Path) -> Result<i64> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    ensure!(
        spec.channels == 1
            && spec.sample_rate == 44_100
            && spec.bits_per_sample == 16
            && spec.sample_format == hound::SampleFormat::Int,
        "Narration WAV has an unsupported format."
    );
    let mut samples = 0i64;
    for sample in reader.samples::<i16>() {
        sample?;
        samples += 1;
    }
    ensure!(samples > 0, "Narration WAV is empty.");
    Ok((samples * 1000 + i64::from(spec.sample_rate) - 1) / i64::from(spec.sample_rate))
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let snapshot: Clip = serde_json::from_value(job.payload["snapshot"].clone())?;
    let kind = job.payload["card_kind"]
        .as_str()
        .context("Narration card kind is missing.")?
        .to_string();
    let language = job.payload["language"]
        .as_str()
        .context("Narration language is missing.")?
        .to_string();
    let card = match kind.as_str() {
        "intro" => snapshot.document.intro_card.as_ref(),
        "outro" => snapshot.document.outro_card.as_ref(),
        _ => anyhow::bail!("Unknown narration card kind."),
    }
    .context("The selected card no longer exists in this job snapshot.")?;
    ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
    let pack = crate::narration_pack::ready_path(state).await?;
    let runtime = state
        .tools_root()
        .join("onnxruntime")
        .join(if cfg!(windows) {
            "onnxruntime.dll"
        } else {
            "libonnxruntime.so"
        });
    let relative = format!("audio/narration-{}.wav", job.id);
    let destination = state.root.join(&relative);
    let existing = tokio::task::spawn_blocking({
        let destination = destination.clone();
        move || wav_duration(&destination)
    })
    .await?;
    let duration_ms = if let Ok(duration) = existing {
        duration
    } else {
        state
            .progress(
                job,
                "synthesize",
                0.05,
                "Generating card narration locally.",
            )
            .await?;
        let temporary = state
            .root
            .join("temporary")
            .join(format!("{}-narration.part.wav", job.id));
        let text = card.text.clone();
        let language = language.clone();
        let token = cancellation.clone();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let (samples, sample_rate) =
                synthesize(&pack, &runtime, &text, &language, "M1", &token)?;
            ensure!(!token.is_cancelled(), "Narration job cancelled.");
            let mut writer = hound::WavWriter::create(
                &temporary,
                hound::WavSpec {
                    channels: 1,
                    sample_rate,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )?;
            for sample in samples {
                writer.write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16)?;
            }
            writer.finalize()?;
            ensure!(!token.is_cancelled(), "Narration job cancelled.");
            wav_duration(&temporary)?;
            if destination.exists() {
                std::fs::remove_file(&destination)?;
            }
            std::fs::rename(temporary, destination)?;
            Ok(())
        })
        .await??;
        wav_duration(&state.root.join(&relative))?
    };
    ensure!(
        duration_ms <= 9_750,
        "Narration is longer than a card. Shorten its text and generate it again."
    );
    ensure!(!cancellation.is_cancelled(), "Narration job cancelled.");
    let asset_id = db::register_asset(
        &state.db,
        &relative,
        &format!("{} card narration", kind),
        "audio",
    )
    .await?;
    sqlx::query("UPDATE assets SET duration_ms = ? WHERE id = ?")
        .bind(duration_ms)
        .bind(&asset_id)
        .execute(&state.db)
        .await?;
    job.payload["card_narration"] = serde_json::to_value(CardNarration {
        asset_id,
        text: card.text.clone(),
        language,
        voice: "M1".into(),
        duration_ms,
    })?;
    state
        .progress(job, "ready", 1.0, "Card narration is ready to review.")
        .await?;
    Ok(())
}

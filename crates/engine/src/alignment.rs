use crate::{
    models::{Word, WordTiming},
    quality_pack,
    state::AppState,
};
use anyhow::{Result, ensure};
use ort::{session::Session, value::Tensor};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
struct CtcConfiguration {
    vocabulary: HashMap<String, usize>,
    blank_id: usize,
    normalize: bool,
    sample_rate: u32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SpeechRegion {
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct AlignmentReport {
    pub aligned_words: usize,
    pub review_words: usize,
    pub regions: Vec<SpeechRegion>,
    pub available: bool,
}

pub fn read_audio(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)?;
    let specification = reader.spec();
    ensure!(
        specification.sample_rate == 16000
            && specification.channels == 1
            && specification.bits_per_sample == 16,
        "Alignment requires mono 16 kHz PCM audio."
    );
    reader
        .samples::<i16>()
        .map(|sample| {
            sample
                .map(|value| value as f32 / 32768.0)
                .map_err(anyhow::Error::from)
        })
        .collect()
}

fn session(state: &AppState, file: &Path) -> Result<Session> {
    let suffix = if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    };
    let environment =
        crate::onnx::environment(&state.tools_root().join("onnxruntime").join(suffix))?;
    Ok(Session::builder(&environment)?
        .with_intra_threads(4)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?
        .commit_from_file(file)?)
}

fn speech_regions(
    session: &mut Session,
    audio: &[f32],
    source_start: i64,
    cancellation: &CancellationToken,
) -> Result<Vec<SpeechRegion>> {
    let mut recurrent = vec![0.0_f32; 2 * 128];
    let mut context = vec![0.0_f32; 64];
    let mut regions = Vec::new();
    let mut active: Option<i64> = None;
    let mut last_active = 0;
    for (index, chunk) in audio.chunks(512).enumerate() {
        ensure!(!cancellation.is_cancelled(), "Job cancelled.");
        let mut input = context.clone();
        input.extend(chunk);
        input.resize(576, 0.0);
        let output = session.run(ort::inputs![
            "input" => Tensor::from_array(([1_usize, 576], input))?,
            "state" => Tensor::from_array(([2_usize, 1, 128], recurrent))?,
            "sr" => Tensor::from_array((Vec::<usize>::new(), vec![16000_i64]))?
        ])?;
        let (_, probabilities) = output["output"].try_extract_tensor::<f32>()?;
        let (_, state) = output["stateN"].try_extract_tensor::<f32>()?;
        recurrent = state.to_vec();
        context.fill(0.0);
        let tail = &chunk[chunk.len().saturating_sub(64)..];
        context[64 - tail.len()..].copy_from_slice(tail);
        let time = index as i64 * 32;
        let rms = (chunk.iter().map(|value| value * value).sum::<f32>()
            / chunk.len().max(1) as f32)
            .sqrt();
        // Energy protects audible laughter and reactions that a speech-only detector can miss.
        let audible = probabilities[0] > 0.45 || rms > 0.012;
        if audible {
            active.get_or_insert(time);
            last_active = time + chunk.len() as i64 / 16;
        } else if time - last_active >= 160
            && let Some(start) = active.take()
        {
            regions.push(SpeechRegion {
                start_ms: source_start + start,
                end_ms: source_start + last_active,
            });
        }
    }
    if let Some(start) = active {
        regions.push(SpeechRegion {
            start_ms: source_start + start,
            end_ms: source_start + last_active,
        });
    }
    Ok(regions)
}

fn forced_path(
    logits: &[f32],
    frames: usize,
    vocabulary: usize,
    target: &[usize],
    blank: usize,
    cancellation: &CancellationToken,
) -> Result<Vec<(usize, usize, f64)>> {
    ensure!(
        !target.is_empty() && frames > 0 && logits.len() == frames * vocabulary,
        "CTC alignment has incompatible dimensions."
    );
    let states = target.len() * 2 + 1;
    let label = |state: usize| {
        if state.is_multiple_of(2) {
            blank
        } else {
            target[state / 2]
        }
    };
    let mut previous = vec![f64::NEG_INFINITY; states];
    previous[0] = 0.0;
    let mut backtrack = vec![0_u8; frames * states];
    let mut log_probabilities = vec![0.0_f64; frames * vocabulary];
    for frame in 0..frames {
        ensure!(!cancellation.is_cancelled(), "Job cancelled.");
        let row = &logits[frame * vocabulary..(frame + 1) * vocabulary];
        let maximum = row.iter().copied().fold(f32::NEG_INFINITY, f32::max) as f64;
        let normalizer = row
            .iter()
            .map(|value| (*value as f64 - maximum).exp())
            .sum::<f64>()
            .ln()
            + maximum;
        let mut current = vec![f64::NEG_INFINITY; states];
        for state in 0..states {
            let mut best = previous[state];
            let mut step = 0;
            if state > 0 && previous[state - 1] > best {
                best = previous[state - 1];
                step = 1;
            }
            if state > 1
                && label(state) != blank
                && label(state) != label(state - 2)
                && previous[state - 2] > best
            {
                best = previous[state - 2];
                step = 2;
            }
            current[state] = best + row[label(state)] as f64 - normalizer;
            backtrack[frame * states + state] = step;
        }
        for (index, value) in row.iter().enumerate() {
            log_probabilities[frame * vocabulary + index] = *value as f64 - normalizer;
        }
        previous = current;
    }
    let mut state = if previous[states - 1] > previous[states - 2] {
        states - 1
    } else {
        states - 2
    };
    ensure!(
        previous[state].is_finite(),
        "Transcript cannot be aligned to this audio window."
    );
    let mut positions = vec![(usize::MAX, 0, 0.0, 0_usize); target.len()];
    for frame in (0..frames).rev() {
        if state % 2 == 1 {
            let position = &mut positions[state / 2];
            position.0 = position.0.min(frame);
            position.1 = position.1.max(frame + 1);
            position.2 += log_probabilities[frame * vocabulary + label(state)];
            position.3 += 1;
        }
        state -= backtrack[frame * states + state] as usize;
    }
    ensure!(
        positions.iter().all(|position| position.3 > 0),
        "CTC path omitted transcript characters."
    );
    Ok(positions
        .into_iter()
        .map(|(start, end, probability, count)| (start, end, (probability / count as f64).exp()))
        .collect())
}

pub async fn align(
    state: &AppState,
    words: &mut Vec<Word>,
    audio: &Path,
    source_start: i64,
    language: &str,
    cancellation: &CancellationToken,
) -> Result<AlignmentReport> {
    if !quality_pack::status(state).await.ready || !["id", "en"].contains(&language) {
        return Ok(AlignmentReport {
            review_words: words.len(),
            ..Default::default()
        });
    }
    let audio = read_audio(audio)?;
    let original = words.clone();
    let mut recognized = original.clone();
    let state = state.clone();
    let language = language.to_string();
    let cancellation = cancellation.clone();
    let (aligned, report) = tokio::task::spawn_blocking(move || -> Result<_> {
        let root = quality_pack::directory(&state);
        let mut vad = session(&state, &root.join("vad.onnx"))?;
        let regions = speech_regions(&mut vad, &audio, source_start, &cancellation)?;
        drop(vad);
        let configuration: CtcConfiguration = serde_json::from_slice(&std::fs::read(
            root.join(format!("alignment-{language}.json")),
        )?)?;
        ensure!(
            configuration.sample_rate == 16000,
            "Unsupported alignment sample rate."
        );
        let mut encoder = session(&state, &root.join(format!("alignment-{language}.onnx")))?;
        let mut first = 0;
        while first < recognized.len() {
            let mut last = first + 1;
            while last < recognized.len()
                && recognized[last].end_ms - recognized[first].start_ms < 12000
                && recognized[last].start_ms - recognized[last - 1].end_ms < 700
                && last - first < 40
            {
                last += 1;
            }
            let start = (recognized[first].start_ms - 200).max(0) as usize * 16;
            let end = ((recognized[last - 1].end_ms + 250).max(0) as usize * 16).min(audio.len());
            if end <= start + 400 {
                first = last;
                continue;
            }
            let mut target = Vec::new();
            let mut owners = Vec::new();
            let mut supported = true;
            for (word_index, word) in recognized[first..last].iter().enumerate() {
                if word_index > 0
                    && let Some(separator) = configuration.vocabulary.get("|")
                {
                    target.push(*separator);
                    owners.push(None);
                }
                for character in word
                    .text
                    .chars()
                    .filter(|character| character.is_alphanumeric())
                {
                    let text = character.to_string();
                    let token = configuration
                        .vocabulary
                        .get(&text)
                        .or_else(|| configuration.vocabulary.get(&text.to_uppercase()))
                        .or_else(|| configuration.vocabulary.get(&text.to_lowercase()));
                    if let Some(token) = token {
                        target.push(*token);
                        owners.push(Some(first + word_index));
                    } else {
                        supported = false;
                    }
                }
            }
            if !supported || target.is_empty() {
                first = last;
                continue;
            }
            let mut samples = audio[start..end].to_vec();
            if configuration.normalize {
                let mean = samples.iter().sum::<f32>() / samples.len() as f32;
                let variance = samples
                    .iter()
                    .map(|value| (*value - mean).powi(2))
                    .sum::<f32>()
                    / samples.len() as f32;
                for sample in &mut samples {
                    *sample = (*sample - mean) / (variance + 1e-7).sqrt();
                }
            }
            ensure!(!cancellation.is_cancelled(), "Job cancelled.");
            let output = encoder.run(ort::inputs!["audio" =>
                Tensor::from_array(([1_usize, samples.len()], samples))?])?;
            let (shape, logits) = output["logits"].try_extract_tensor::<f32>()?;
            ensure!(
                shape.len() == 3 && shape[0] == 1,
                "Unsupported CTC output shape."
            );
            let path = forced_path(
                logits,
                shape[1] as usize,
                shape[2] as usize,
                &target,
                configuration.blank_id,
                &cancellation,
            );
            if let Ok(path) = path {
                for (word_index, word) in recognized.iter_mut().enumerate().take(last).skip(first) {
                    let positions: Vec<_> = path
                        .iter()
                        .zip(&owners)
                        .filter(|(_, owner)| **owner == Some(word_index))
                        .map(|(position, _)| position)
                        .collect();
                    if positions.is_empty() {
                        continue;
                    }
                    let confidence = positions.iter().map(|position| position.2).sum::<f64>()
                        / positions.len() as f64;
                    if confidence < 0.15 {
                        continue;
                    }
                    if word
                        .timing
                        .as_ref()
                        .is_some_and(|timing| timing.provenance == "manual")
                    {
                        continue;
                    }
                    word.start_ms = start as i64 / 16 + positions[0].0 as i64 * 20;
                    word.end_ms = (start as i64 / 16 + positions.last().unwrap().1 as i64 * 20)
                        .min(audio.len() as i64 / 16)
                        .max(word.start_ms + 1);
                    word.timing = Some(WordTiming {
                        provenance: "aligned".into(),
                        source_start_ms: source_start + word.start_ms,
                        source_end_ms: source_start + word.end_ms,
                        alignment_confidence: Some(confidence),
                    });
                }
            } else {
                ensure!(!cancellation.is_cancelled(), "Job cancelled.");
            }
            first = last;
        }
        // Mixed estimated and acoustic anchors must preserve transcript order and manual edits.
        for index in 0..recognized.len() {
            let previous = index
                .checked_sub(1)
                .map(|previous| recognized[previous].end_ms);
            let next = recognized.get(index + 1).map(|next| next.start_ms);
            if previous.is_some_and(|end| recognized[index].start_ms < end)
                || next.is_some_and(|start| recognized[index].end_ms > start)
            {
                recognized[index] = original[index].clone();
            }
        }
        let aligned_words = recognized
            .iter()
            .filter(|word| {
                word.timing
                    .as_ref()
                    .is_some_and(|timing| timing.provenance == "aligned")
            })
            .count();
        let report = AlignmentReport {
            aligned_words,
            review_words: recognized.len() - aligned_words,
            regions,
            available: true,
        };
        Ok((recognized, report))
    })
    .await??;
    *words = aligned;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_ctc_symbols_require_a_blank_between_them() {
        let logits = [0.0, 9.0, 9.0, 0.0, 0.0, 9.0];
        let result = forced_path(&logits, 3, 2, &[1, 1], 0, &CancellationToken::new()).unwrap();
        assert_eq!((result[0].0, result[0].1), (0, 1));
        assert_eq!((result[1].0, result[1].1), (2, 3));
    }
}

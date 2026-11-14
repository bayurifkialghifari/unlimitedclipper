use crate::{
    db,
    inference::Session,
    model_manager,
    models::*,
    pipeline::{self, Suggestion},
    state::AppState,
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize, Deserialize)]
struct Window {
    first: usize,
    end: usize,
    core_start_ms: i64,
    core_end_ms: i64,
}

#[derive(Deserialize)]
struct Proposals {
    clips: Vec<Suggestion>,
}

#[derive(Deserialize)]
struct Dimension {
    key: String,
    score: u32,
    quote: String,
}

#[derive(Deserialize)]
struct Review {
    title: String,
    explanation: String,
    dimensions: Vec<Dimension>,
}

#[derive(Clone, Serialize, Deserialize)]
struct AudioCue {
    time_ms: i64,
    strength: f64,
}

async fn audio_cues(
    state: &AppState,
    project: &Project,
    cancellation: &CancellationToken,
) -> Result<Vec<AudioCue>> {
    let audio = state
        .root
        .join("temporary")
        .join(format!("{}.wav", project.id));
    if !audio.is_file() {
        let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id).await?;
        crate::tools::capture_managed(
            state,
            "ffmpeg",
            "ffmpeg",
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
                audio.to_string_lossy().into_owned(),
            ],
            cancellation,
        )
        .await?;
    }
    let token = cancellation.clone();
    tokio::task::spawn_blocking(move || -> Result<_> {
        let mut reader = hound::WavReader::open(audio)?;
        ensure!(
            reader.spec().sample_rate == 16000 && reader.spec().channels == 1,
            "Audio cues need source-timed mono 16 kHz audio."
        );
        let mut energy = Vec::new();
        let mut sum = 0.0;
        let mut count = 0;
        for sample in reader.samples::<i16>() {
            ensure!(!token.is_cancelled(), "Job cancelled.");
            let amplitude = sample? as f64 / 32768.0;
            sum += amplitude * amplitude;
            count += 1;
            if count == 1600 {
                energy.push((sum / count as f64).sqrt());
                sum = 0.0;
                count = 0;
            }
        }
        let mut cues = Vec::new();
        for (block, window) in energy.chunks(600).enumerate() {
            let mut sorted = window.to_vec();
            sorted.sort_by(f64::total_cmp);
            let median = sorted[sorted.len() / 2].max(0.005);
            let mut peaks = window
                .iter()
                .enumerate()
                .filter_map(|(index, value)| {
                    let previous = window[index.saturating_sub(1)];
                    let strength = value / median + (value - previous).max(0.0) / median;
                    (*value > median * 2.0).then_some(AudioCue {
                        time_ms: (block * 600 + index) as i64 * 100,
                        strength,
                    })
                })
                .collect::<Vec<_>>();
            peaks.sort_by(|a, b| b.strength.total_cmp(&a.strength));
            cues.extend(peaks.into_iter().take(3));
        }
        Ok(cues)
    })
    .await?
}

fn windows(words: &[Word]) -> Vec<Window> {
    let mut result = Vec::new();
    let mut first = 0;
    while first < words.len() {
        let mut end = first + 1;
        let mut bytes = words[first].text.len() + 30;
        while end < words.len()
            && words[end].end_ms - words[first].start_ms <= 60_000
            && bytes + words[end].text.len() + 30 <= 1800
        {
            bytes += words[end].text.len() + 30;
            end += 1;
        }
        let core_start_ms = words[first].start_ms;
        let core_end_ms = words[end - 1].end_ms;
        let mut context_first = first;
        let mut context_end = end;
        while context_first > 0
            && core_start_ms - words[context_first - 1].start_ms <= 15_000
            && bytes + words[context_first - 1].text.len() + 30 <= 2400
        {
            context_first -= 1;
            bytes += words[context_first].text.len() + 30;
        }
        while context_end < words.len()
            && words[context_end].end_ms - core_end_ms <= 15_000
            && bytes + words[context_end].text.len() + 30 <= 2650
        {
            bytes += words[context_end].text.len() + 30;
            context_end += 1;
        }
        result.push(Window {
            first: context_first,
            end: context_end,
            core_start_ms,
            core_end_ms,
        });
        first = end;
    }
    result
}

fn transcript(words: &[Word]) -> String {
    let mut lines = String::new();
    let mut first = 0;
    while first < words.len() {
        let mut end = first + 1;
        while end < words.len() && end - first < 12 {
            if words[end].start_ms - words[end - 1].end_ms > 650
                || words[end - 1].text.ends_with(['.', '!', '?'])
            {
                break;
            }
            end += 1;
        }
        let phrase = words[first..end]
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        lines.push_str(&format!(
            "[{}-{}] {phrase}\n",
            words[first].start_ms,
            words[end - 1].end_ms
        ));
        first = end;
    }
    lines
}

fn batched_windows(words: &[Word]) -> Vec<Window> {
    let mut batches: Vec<Window> = Vec::new();
    for window in windows(words) {
        if let Some(previous) = batches.last_mut()
            && window.core_end_ms - previous.core_start_ms <= 240_000
            && transcript(&words[previous.first..window.end]).len() <= 2650
        {
            previous.end = window.end;
            previous.core_end_ms = window.core_end_ms;
        } else {
            batches.push(window);
        }
    }
    batches
}

fn increment(job: &mut Job, key: &str) {
    let previous = job.payload["discovery_report"][key].as_u64().unwrap_or(0);
    job.payload["discovery_report"][key] = json!(previous + 1);
}

fn rank(mut candidates: Vec<Suggestion>, count: usize) -> Vec<Suggestion> {
    candidates.sort_by_key(|item| std::cmp::Reverse(item.score));
    let mut result: Vec<Suggestion> = Vec::new();
    for candidate in candidates {
        if result.iter().any(|other| {
            let overlap = (candidate.end_ms.min(other.end_ms)
                - candidate.start_ms.max(other.start_ms))
            .max(0);
            overlap * 2 > (candidate.end_ms - candidate.start_ms).min(other.end_ms - other.start_ms)
        }) {
            continue;
        }
        result.push(candidate);
        if result.len() >= count.saturating_mul(3).max(12) {
            break;
        }
    }
    result
}

fn select_nonoverlapping(mut candidates: Vec<Suggestion>, count: usize) -> Vec<Suggestion> {
    candidates.sort_by_key(|item| std::cmp::Reverse(item.score));
    let mut accepted: Vec<Suggestion> = Vec::new();
    for candidate in candidates {
        if !accepted
            .iter()
            .any(|other| candidate.start_ms < other.end_ms && candidate.end_ms > other.start_ms)
        {
            accepted.push(candidate);
        }
        if accepted.len() >= count {
            break;
        }
    }
    accepted
}

async fn propose(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    cancellation: &CancellationToken,
) -> Result<()> {
    let plan: Vec<Window> = serde_json::from_value(job.payload["discovery_windows"].clone())?;
    let offset = job.payload["discovery_window_offset"].as_u64().unwrap_or(0) as usize;
    if offset >= plan.len() {
        return Ok(());
    }
    let model = job.payload["proposal_model"]
        .as_str()
        .context("Missing proposal model")?
        .to_string();
    state
        .progress(
            job,
            "selection",
            0.45,
            "Loading the proposal model once for this stage.",
        )
        .await?;
    let mut session = Session::open(state, &model, cancellation).await?;
    increment(job, "model_loads");
    let result = propose_windows(
        state,
        job,
        project,
        &plan,
        offset,
        &mut session,
        cancellation,
    )
    .await;
    job.payload["inference_calls"] =
        json!(job.payload["inference_calls"].as_u64().unwrap_or(0) + session.calls as u64);
    session.close().await;
    result
}

async fn propose_windows(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    plan: &[Window],
    offset: usize,
    session: &mut Session,
    cancellation: &CancellationToken,
) -> Result<()> {
    let schema = json!({"type":"object","properties":{"clips":{"type":"array","maxItems":4,"items":{"type":"object","properties":{
        "start_ms":{"type":"integer"},"end_ms":{"type":"integer"},"title":{"type":"string","maxLength":80},
        "explanation":{"type":"string","maxLength":160},"score":{"type":"integer","minimum":0,"maximum":100},
        "hook":{"type":"string","minLength":1,"maxLength":100},"payoff":{"type":"string","minLength":1,"maxLength":100}},
        "required":["start_ms","end_ms","title","explanation","score","hook","payoff"],"additionalProperties":false}}},"required":["clips"],"additionalProperties":false});
    let mut candidates: Vec<Suggestion> =
        serde_json::from_value(job.payload["discovery_candidates"].clone()).unwrap_or_default();
    let count = job.payload["clip_count"].as_u64().unwrap_or(4) as usize;
    let focus = job.payload["focus"].as_str().unwrap_or("").to_string();
    let profile = job.payload["content_profile"]
        .as_str()
        .unwrap_or("podcast")
        .to_string();
    for (index, window) in plan.iter().enumerate().skip(offset) {
        ensure!(!cancellation.is_cancelled(), "Job cancelled.");
        job.payload["selection_section"] = json!(index + 1);
        job.payload["selection_sections"] = json!(plan.len());
        state
            .progress(
                job,
                "selection",
                0.45 + 0.3 * index as f64 / plan.len().max(1) as f64,
                "Finding complete moments with neighboring context.",
            )
            .await?;
        let words = &project.words[window.first..window.end];
        let profile_instruction = if profile == "gaming" {
            "Prefer a surprising reaction, funny exchange, or tense outcome. Loud audio alone is not evidence of an interesting moment."
        } else {
            "Prefer a useful insight, complete short story, surprising statement, or funny exchange."
        };
        let excluded = job.payload["discovery_accepted"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .map(|item| format!("{}-{}", item["start_ms"], item["end_ms"]))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        let duration = job.payload["duration_ms"].as_i64().unwrap_or(0);
        let cues: Vec<AudioCue> =
            serde_json::from_value(job.payload["audio_cues"].clone()).unwrap_or_default();
        let cue_text = cues
            .iter()
            .filter(|cue| {
                cue.time_ms >= words[0].start_ms
                    && cue.time_ms <= words.last().map_or(0, |word| word.end_ms)
            })
            .take(3)
            .map(|cue| cue.time_ms.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let request = format!(
            "Find up to 4 standalone video excerpts. {profile_instruction} Read the whole conversation before selecting. Prefer complete 8000-60000 ms moments. Include the setup AND its answer, outcome, or conclusion. Never suggest isolated fragments, unanswered questions, greetings, or repeated quotes. Target duration {duration} ms (0 means automatic); do not pad filler. Use integer SOURCE timestamps shown below. Focus: {focus}. Audio energy changes near source ms {cue_text} are search hints only, not semantic evidence. Avoid already selected ranges: {excluded}. Titles and explanations in {}. Hook and payoff must be short exact quotes INSIDE the range; they should describe its opening and completed ending. An empty array is valid. Prefer moments starting in {}-{}; neighboring text may complete their context. Transcript:\n{}",
            pipeline::output_language(project),
            window.core_start_ms,
            window.core_end_ms,
            transcript(words)
        );
        let output = session.complete(&request, &schema, cancellation).await?;
        let response: Proposals = pipeline::extract_json(&output)?;
        for candidate in response.clips {
            increment(job, "proposed");
            if candidate.start_ms < words[0].start_ms
                || candidate.end_ms > words.last().context("Empty transcript window")?.end_ms
                || candidate.end_ms <= candidate.start_ms
                || candidate.title.trim().is_empty()
                || !pipeline::grounded(&candidate, words)
            {
                increment(job, "invalid_evidence");
                continue;
            }
            if let Some(candidate) = pipeline::fit_suggestion(candidate, project) {
                candidates.push(candidate);
            } else {
                increment(job, "duration");
            }
        }
        candidates = rank(candidates, count);
        job.payload["discovery_candidates"] = json!(candidates);
        job.payload["discovery_window_offset"] = json!(index + 1);
        db::save_job(&state.db, job).await?;
    }
    Ok(())
}

fn validate_review(review: &Review, text: &str) -> Result<u32> {
    let mut keys = std::collections::HashSet::new();
    let mut score = 0;
    ensure!(
        !review.title.trim().is_empty() && !review.explanation.trim().is_empty(),
        "Review text is empty."
    );
    ensure!(
        review.dimensions.len() == 4,
        "Review needs four dimensions."
    );
    for dimension in &review.dimensions {
        ensure!(
            ["hook", "clarity", "flow", "payoff"].contains(&dimension.key.as_str())
                && keys.insert(&dimension.key)
                && dimension.score <= 25,
            "Review dimensions are invalid."
        );
        ensure!(
            !dimension.quote.trim().is_empty() && text.contains(&dimension.quote),
            "Review quotes must occur exactly in the candidate transcript."
        );
        score += dimension.score;
    }
    Ok(score)
}

async fn review(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    cancellation: &CancellationToken,
) -> Result<()> {
    let candidates: Vec<Suggestion> =
        serde_json::from_value(job.payload["discovery_candidates"].clone()).unwrap_or_default();
    let offset = job.payload["discovery_review_offset"].as_u64().unwrap_or(0) as usize;
    if offset >= candidates.len() {
        return Ok(());
    }
    let model = job.payload["review_model"]
        .as_str()
        .context("Missing review model")?
        .to_string();
    state
        .progress(
            job,
            "review",
            0.76,
            "Loading the final review model; evaluating complete transcripts.",
        )
        .await?;
    let mut session = Session::open(state, &model, cancellation).await?;
    increment(job, "model_loads");
    let result = review_candidates(
        state,
        job,
        project,
        &candidates,
        offset,
        &mut session,
        cancellation,
    )
    .await;
    job.payload["inference_calls"] =
        json!(job.payload["inference_calls"].as_u64().unwrap_or(0) + session.calls as u64);
    session.close().await;
    result
}

async fn review_candidates(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    candidates: &[Suggestion],
    offset: usize,
    session: &mut Session,
    cancellation: &CancellationToken,
) -> Result<()> {
    let schema = json!({"type":"object","properties":{
        "title":{"type":"string","maxLength":80},"explanation":{"type":"string","maxLength":300},
        "dimensions":{"type":"array","minItems":4,"maxItems":4,"items":{"type":"object","properties":{
            "key":{"type":"string","enum":["hook","clarity","flow","payoff"]},
            "score":{"type":"integer","minimum":0,"maximum":25},"quote":{"type":"string","minLength":1,"maxLength":120}},
            "required":["key","score","quote"],"additionalProperties":false}}},
        "required":["title","explanation","dimensions"],"additionalProperties":false});
    let minimum = job.payload["minimum_score"].as_u64().unwrap_or(70) as u32;
    let mut accepted: Vec<Suggestion> =
        serde_json::from_value(job.payload["discovery_accepted"].clone()).unwrap_or_default();
    for (index, candidate) in candidates.iter().enumerate().skip(offset) {
        let count = job.payload["clip_count"].as_u64().unwrap_or(4) as usize;
        if select_nonoverlapping(accepted.clone(), count).len() >= count {
            break;
        }
        let words = project
            .words
            .iter()
            .filter(|word| word.end_ms > candidate.start_ms && word.start_ms < candidate.end_ms)
            .collect::<Vec<_>>();
        let text = words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let uncertain = words
            .iter()
            .filter(|word| word.confidence.is_some_and(|confidence| confidence < 0.65))
            .count();
        let prompt = format!(
            "Independently judge this complete transcript, including its ending. Use ONLY its words. No view prediction or audiovisual understanding. Score four unique dimensions 0-25: hook (immediate interest), clarity (standalone understanding), flow (concise coherent progression), payoff (complete useful/funny/surprising ending). 0-9 weak, 10-17 ordinary, 18-21 strong, 22-25 exceptional with exceptional evidence. Do not reward recognizable content or assume missing context. Give an honest explanation and short exact transcript quote per dimension. Narrative language: {}. Viewer focus: {}. Recognition has {uncertain} uncertain words; do not invent corrections. Full transcript:\n{text}",
            pipeline::output_language(project),
            job.payload["focus"].as_str().unwrap_or("")
        );
        state
            .progress(
                job,
                "review",
                0.76 + 0.16 * index as f64 / candidates.len().max(1) as f64,
                "Checking complete hooks and payoffs without the proposal score.",
            )
            .await?;
        if !session.fits(&prompt, cancellation).await? {
            increment(job, "context_budget");
        } else {
            let mut request = prompt.clone();
            let mut validated = None;
            for attempt in 0..2 {
                let output = session.complete(&request, &schema, cancellation).await?;
                let parsed: Result<(Review, u32)> = pipeline::extract_json::<Review>(&output)
                    .and_then(|review| {
                        validate_review(&review, &text).map(|score| (review, score))
                    });
                match parsed {
                    Ok(value) => {
                        validated = Some(value);
                        break;
                    }
                    Err(error) if attempt == 0 => {
                        request = format!(
                            "{prompt}\nCorrect this validation error: {error}. Copy short exact quotes from the transcript."
                        );
                    }
                    Err(_) => {
                        increment(job, "invalid_review");
                    }
                }
            }
            if let Some((review, score)) = validated {
                let evidence = json!({
                    "start_ms": candidate.start_ms,
                    "end_ms": candidate.end_ms,
                    "score": score,
                    "dimensions": review.dimensions.iter().map(|dimension| json!({
                        "key": dimension.key, "score": dimension.score, "quote": dimension.quote
                    })).collect::<Vec<_>>()
                });
                if !job.payload["discovery_reviews"].is_array() {
                    job.payload["discovery_reviews"] = json!([]);
                }
                job.payload["discovery_reviews"]
                    .as_array_mut()
                    .context("Missing review evidence checkpoint")?
                    .push(evidence);
                if score >= minimum
                    && review
                        .dimensions
                        .iter()
                        .all(|dimension| dimension.score >= 10)
                {
                    let mut candidate = candidate.clone();
                    candidate.score = score;
                    candidate.title = review.title;
                    candidate.explanation = review.explanation;
                    if uncertain * 10 > words.len().max(1) {
                        candidate.explanation.push_str(
                            if project.language.as_deref() == Some("id") {
                                " [Pengenalan caption perlu diperiksa.]"
                            } else {
                                " [Caption recognition needs review.]"
                            },
                        );
                    }
                    accepted.push(candidate);
                } else {
                    increment(job, "below_threshold");
                }
            }
        }
        job.payload["discovery_accepted"] = json!(accepted);
        job.payload["discovery_review_offset"] = json!(index + 1);
        db::save_job(&state.db, job).await?;
    }
    Ok(())
}

pub(crate) async fn select(
    state: &AppState,
    job: &mut Job,
    project: &Project,
    cancellation: &CancellationToken,
) -> Result<Vec<Suggestion>> {
    if !job.payload["proposal_model"].is_string() {
        let small = model_manager::model_path(state, "qwen3-1.7b").await.is_ok();
        let large = model_manager::model_path(state, "qwen3-4b").await.is_ok();
        ensure!(
            small || large,
            "Install a Qwen model in Settings before finding clips."
        );
        let economy = job.payload["ai_mode"].as_str().unwrap_or("economy") == "economy";
        job.payload["proposal_model"] = json!(if small && (economy || !large) {
            "qwen3-1.7b"
        } else {
            "qwen3-4b"
        });
        job.payload["review_model"] = json!(if large { "qwen3-4b" } else { "qwen3-1.7b" });
        job.payload["discovery_windows"] = json!(batched_windows(&project.words));
        job.payload["discovery_report"] = json!({});
        job.payload["discovery_snapshot"] = json!(project);
        job.payload["inference_context"] = json!(crate::inference::CONTEXT);
        job.payload["inference_threads"] = json!(crate::inference::threads());
        let specs = model_specs();
        job.payload["discovery_model_hashes"] = json!(
            specs
                .iter()
                .filter(|spec| {
                    Some(spec.id.as_str()) == job.payload["proposal_model"].as_str()
                        || Some(spec.id.as_str()) == job.payload["review_model"].as_str()
                })
                .map(|spec| (spec.id.clone(), spec.sha256.clone()))
                .collect::<std::collections::BTreeMap<_, _>>()
        );
        db::save_job(&state.db, job).await?;
    }
    if let Some(hashes) = job.payload["discovery_model_hashes"].as_object() {
        let specs = model_specs();
        for (id, hash) in hashes {
            ensure!(
                specs
                    .iter()
                    .any(|spec| spec.id == *id && Some(spec.sha256.as_str()) == hash.as_str()),
                "The model registry changed. Start a new discovery job instead of mixing model versions."
            );
        }
    }
    if job.payload["content_profile"].as_str() == Some("gaming")
        && !job.payload["audio_cues"].is_array()
    {
        state
            .progress(
                job,
                "audio",
                0.4,
                "Finding source-timed audio changes without another AI model.",
            )
            .await?;
        job.payload["audio_cues"] = json!(audio_cues(state, project, cancellation).await?);
        db::save_job(&state.db, job).await?;
    }
    let count = job.payload["clip_count"].as_u64().unwrap_or(4) as usize;
    loop {
        propose(state, job, project, cancellation).await?;
        review(state, job, project, cancellation).await?;
        let candidates: Vec<Suggestion> =
            serde_json::from_value(job.payload["discovery_accepted"].clone()).unwrap_or_default();
        let accepted = select_nonoverlapping(candidates, count);
        if accepted.len() >= count || job.payload["discovery_extra_pass"].as_bool() == Some(true) {
            job.payload["discovery_report"]["accepted"] = json!(accepted.len());
            job.payload["discovery_report"]["requested"] = json!(count);
            return Ok(accepted);
        }
        // Revisit adjacent context once; accepted ranges remain excluded and checkpointed.
        let plan: Vec<Window> = serde_json::from_value(job.payload["discovery_windows"].clone())?;
        let mut extra = Vec::new();
        let cues: Vec<AudioCue> =
            serde_json::from_value(job.payload["audio_cues"].clone()).unwrap_or_default();
        let mut pairs = plan.windows(2).collect::<Vec<_>>();
        pairs.sort_by(|a, b| {
            let priority = |pair: &[Window]| {
                cues.iter()
                    .filter(|cue| {
                        cue.time_ms >= pair[0].core_start_ms && cue.time_ms <= pair[1].core_end_ms
                    })
                    .map(|cue| cue.strength)
                    .fold(0.0_f64, f64::max)
            };
            priority(b).total_cmp(&priority(a))
        });
        for pair in pairs.into_iter().take(8) {
            let first = pair[0].first.max(pair[0].end.saturating_sub(45));
            let end = pair[1]
                .end
                .min(pair[1].first.saturating_add(45))
                .max(first + 1)
                .min(project.words.len());
            extra.push(Window {
                first,
                end,
                core_start_ms: project.words[first].start_ms,
                core_end_ms: project.words[end - 1].end_ms,
            });
        }
        if extra.is_empty() {
            job.payload["discovery_extra_pass"] = json!(true);
            continue;
        }
        job.payload["discovery_report"]["extra_windows"] = json!(extra.len());
        job.payload["discovery_extra_pass"] = json!(true);
        job.payload["discovery_windows"] = json!(extra);
        job.payload["discovery_window_offset"] = json!(0);
        job.payload["discovery_review_offset"] = json!(0);
        job.payload["discovery_candidates"] = json!([]);
        job.payload["discovery_accepted"] = json!(accepted);
        db::save_job(&state.db, job).await?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_context_covers_all_words_and_keeps_core_bounded() {
        let words = (0..240)
            .map(|index| Word {
                id: index.to_string(),
                text: "An actual phrase.".into(),
                start_ms: index * 1000,
                end_ms: index * 1000 + 500,
                emphasis: false,
                color: None,
                confidence: Some(0.9),
                timing: None,
            })
            .collect::<Vec<_>>();
        let plan = windows(&words);
        assert!(plan.len() > 1);
        assert!(
            plan.iter()
                .all(|window| window.core_end_ms - window.core_start_ms <= 60_000)
        );
        assert!(plan.windows(2).all(|pair| pair[0].end > pair[1].first));
        assert!((0..words.len()).all(|index| {
            plan.iter()
                .any(|window| index >= window.first && index < window.end)
        }));
    }

    #[test]
    fn review_requires_four_independent_grounded_dimensions() {
        let mut review = Review {
            title: "A grounded title".into(),
            explanation: "An honest assessment.".into(),
            dimensions: ["hook", "clarity", "flow", "payoff"]
                .iter()
                .map(|key| Dimension {
                    key: (*key).into(),
                    score: 18,
                    quote: "complete ending".into(),
                })
                .collect(),
        };
        assert_eq!(validate_review(&review, "A complete ending").unwrap(), 72);
        review.dimensions[3].quote = "invented ending".into();
        assert!(validate_review(&review, "A complete ending").is_err());
    }

    #[test]
    fn sparse_batches_reduce_calls_without_losing_source_coverage() {
        let words = (0..80)
            .map(|index| Word {
                id: index.to_string(),
                text: "Sparse speech.".into(),
                start_ms: index * 10_000,
                end_ms: index * 10_000 + 500,
                emphasis: false,
                color: None,
                confidence: Some(0.9),
                timing: None,
            })
            .collect::<Vec<_>>();
        let batches = batched_windows(&words);
        assert!(batches.len() < windows(&words).len());
        assert!(
            batches
                .iter()
                .all(|batch| batch.core_end_ms - batch.core_start_ms <= 240_000)
        );
        assert!((0..words.len()).all(|index| {
            batches
                .iter()
                .any(|batch| index >= batch.first && index < batch.end)
        }));
    }
}

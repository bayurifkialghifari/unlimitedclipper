use crate::{broll, db, models::*, pipeline, state::AppState};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_util::sync::CancellationToken;

#[derive(Debug)]
struct TranscriptWindow {
    index: usize,
    start_ms: i64,
    text: String,
}

#[derive(Deserialize)]
struct ModelCandidate {
    window_index: usize,
    source_quote: String,
    query: String,
}

#[derive(Deserialize)]
struct ModelResponse {
    candidates: Vec<ModelCandidate>,
}

#[derive(Deserialize)]
struct QueryRewrite {
    query: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct SearchCandidate {
    start_ms: i64,
    source_quote: String,
    query: String,
}

fn windows(document: &EditDocument) -> Vec<TranscriptWindow> {
    let limit = document.duration_ms().min(120_000);
    let mut result = Vec::new();
    for start in (0..limit).step_by(5_000) {
        if document.visual_layers.iter().any(|layer| {
            layer.kind == "broll"
                && layer.enabled
                && layer.start_ms < start + 5_000
                && layer.end_ms > start
        }) {
            continue;
        }
        let words = document
            .words
            .iter()
            .filter(|word| {
                word.start_ms >= start
                    && word.start_ms < start + 5_000
                    && !word.text.trim().is_empty()
            })
            .map(|word| word.text.trim())
            .collect::<Vec<_>>();
        if words.len() < 3 {
            continue;
        }
        result.push(TranscriptWindow {
            index: result.len(),
            start_ms: start,
            text: words.join(" ").chars().take(250).collect(),
        });
    }
    result
}

pub fn has_transcript_window(document: &EditDocument) -> bool {
    !windows(document).is_empty()
}

fn normalized_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|word| {
            word.chars()
                .filter(|character| character.is_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect::<String>()
        })
        .filter(|word| !word.is_empty())
        .collect()
}

fn accept(windows: &[TranscriptWindow], candidates: Vec<ModelCandidate>) -> Vec<SearchCandidate> {
    let mut accepted = Vec::new();
    let mut used = std::collections::HashSet::new();
    for candidate in candidates {
        let Some(window) = windows.get(candidate.window_index) else {
            continue;
        };
        let quote = normalized_words(&candidate.source_quote);
        let source = normalized_words(&window.text);
        let query = candidate.query.trim();
        if quote.is_empty()
            || quote.iter().map(String::len).sum::<usize>() < 4
            || candidate.source_quote.chars().count() > 120
            || !source.windows(quote.len()).any(|words| words == quote)
            || !valid_query(query)
            || !used.insert(window.index)
        {
            continue;
        }
        accepted.push(SearchCandidate {
            start_ms: window.start_ms,
            source_quote: candidate.source_quote.trim().into(),
            query: query.into(),
        });
        if accepted.len() == 3 {
            break;
        }
    }
    accepted
}

fn title_score(title: &str, query: &str) -> usize {
    let title = title.to_ascii_lowercase();
    query
        .split_whitespace()
        .filter(|word| word.len() >= 4 && title.contains(&word.to_ascii_lowercase()))
        .count()
}

fn valid_query(query: &str) -> bool {
    let query = query.trim();
    (2..=80).contains(&query.len())
        && query.split_whitespace().count() <= 5
        && query.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == ' ' || character == '-'
        })
}

fn contextual_query(candidate: &SearchCandidate) -> String {
    if candidate
        .source_quote
        .to_ascii_lowercase()
        .contains("dino-dino")
        && ["dino", "dino-dino"].contains(&candidate.query.to_ascii_lowercase().as_str())
    {
        return "dinosaur".into();
    }
    candidate.query.clone()
}

fn prompt_transcript(windows: &[TranscriptWindow]) -> String {
    let bytes_per_window = (1_700 / windows.len().max(1)).min(180).saturating_sub(8);
    windows
        .iter()
        .map(|window| {
            let end = window
                .text
                .char_indices()
                .take_while(|(index, character)| index + character.len_utf8() <= bytes_per_window)
                .map(|(index, character)| index + character.len_utf8())
                .last()
                .unwrap_or(0);
            let prefix = &window.text[..end];
            let visible = if end < window.text.len() {
                prefix
                    .rsplit_once(' ')
                    .map_or(prefix, |(complete, _)| complete)
            } else {
                prefix
            };
            format!("[{}] {}", window.index, visible)
        })
        .collect::<Vec<_>>()
        .join(" | ")
}

async fn find_video(state: &AppState, query: &str) -> Result<Option<broll::StockVideo>> {
    let mut results = broll::search_candidates(state, query).await?;
    results.sort_by_key(|video| {
        (
            std::cmp::Reverse(title_score(&video.title, query)),
            video.size_bytes,
        )
    });
    Ok(results
        .into_iter()
        .find(|video| title_score(&video.title, query) > 0))
}

async fn rewrite_query(
    state: &AppState,
    candidate: &SearchCandidate,
    cancellation: &CancellationToken,
) -> Result<Option<String>> {
    let schema = json!({
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
        "additionalProperties": false
    });
    let prompt = format!(
        "The first stock search found no relevant CC0 video. Translate the visual subject in this transcript quote into a complete common English noun for a stock-video search. Use one or two English words, preferably singular. Translate repeated or inflected non-English nouns rather than copying or shortening them. For example, an Indonesian repeated noun referring to dinosaurs must become 'dinosaur', not the abbreviation 'dino' or a person's name. Do not add a subject absent from the quote. Quote: {}. Failed query: {}.",
        candidate.source_quote, candidate.query
    );
    let output = pipeline::infer(state, &prompt, &schema.to_string(), cancellation).await?;
    let response: QueryRewrite = pipeline::extract_json(&output)?;
    let query = response.query.trim();
    let repeated_stem = candidate
        .query
        .split_once('-')
        .filter(|(first, second)| first.eq_ignore_ascii_case(second))
        .map(|(first, _)| first);
    Ok((valid_query(query)
        && !query.eq_ignore_ascii_case(&candidate.query)
        && !repeated_stem.is_some_and(|stem| query.eq_ignore_ascii_case(stem)))
    .then(|| query.to_string()))
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let clip: Clip = serde_json::from_value(job.payload["snapshot"].clone())
        .context("Missing frozen clip for automatic B-roll.")?;
    let windows = windows(&clip.document);
    ensure!(
        !windows.is_empty(),
        "No uncovered transcript moment can use B-roll."
    );
    let candidates: Vec<SearchCandidate> = if job.payload["candidates"].is_array() {
        serde_json::from_value(job.payload["candidates"].clone())?
    } else {
        let schema = json!({
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "window_index": {"type": "integer"},
                            "source_quote": {"type": "string"},
                            "query": {"type": "string"}
                        },
                        "required": ["window_index", "source_quote", "query"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["candidates"],
            "additionalProperties": false
        });
        let transcript = prompt_transcript(&windows);
        let prompt = format!(
            "Choose up to three distinct moments for relevant stock video. Each source_quote must copy contiguous words exactly from its numbered transcript window. The query must be two to five English search words naming a concrete visible object, action, or place explicitly mentioned in that quote. Never suggest a generic or unrelated image. Return an empty array if the transcript has no concrete visual subject. Prefer moments early in the clip and avoid repeating one subject. Transcript windows: {transcript}"
        );
        state
            .progress(
                job,
                "suggesting",
                0.05,
                "Finding visual moments in the clip transcript.",
            )
            .await?;
        let output = pipeline::infer(state, &prompt, &schema.to_string(), cancellation).await?;
        let response: ModelResponse = pipeline::extract_json(&output)?;
        let accepted = accept(&windows, response.candidates);
        job.payload["candidates"] = json!(accepted);
        db::save_job(&state.db, job).await?;
        accepted
    };
    if job.payload["page_id"].as_i64().is_none() {
        for candidate in candidates {
            ensure!(!cancellation.is_cancelled(), "Job cancelled.");
            state
                .progress(job, "searching", 0.15, "Searching free CC0 stock video.")
                .await?;
            let mut query = contextual_query(&candidate);
            let mut video = find_video(state, &query).await?;
            if video.is_none() {
                let key = candidate.start_ms.to_string();
                let rewritten = match job.payload["fallback_queries"][&key].as_str() {
                    Some(saved) => Some(saved.to_string()),
                    None => rewrite_query(state, &candidate, cancellation).await?,
                };
                if let Some(rewritten) = rewritten {
                    job.payload["fallback_queries"][&key] = json!(rewritten);
                    db::save_job(&state.db, job).await?;
                    query = rewritten;
                    video = find_video(state, &query).await?;
                }
            }
            let Some(video) = video else {
                continue;
            };
            job.payload["page_id"] = json!(video.page_id);
            job.payload["proposal"] = json!({
                "start_ms": candidate.start_ms,
                "source_quote": candidate.source_quote,
                "query": query,
                "title": video.title,
                "source_url": video.source_url,
                "license": video.license
            });
            db::save_job(&state.db, job).await?;
            break;
        }
    }
    if job.payload["page_id"].as_i64().is_none() {
        job.payload["no_match"] = json!(true);
        db::save_job(&state.db, job).await?;
        return Ok(());
    }
    broll::import(state, job, cancellation).await?;
    let asset_id = job.payload["asset_id"]
        .as_str()
        .context("Automatic B-roll import did not register an asset.")?;
    job.payload["proposal"]["asset_id"] = json!(asset_id);
    db::save_job(&state.db, job).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposal_requires_an_exact_transcript_quote_and_safe_query() {
        let windows = vec![TranscriptWindow {
            index: 0,
            start_ms: 5_000,
            text: "We made fresh coffee in the kitchen.".into(),
        }];
        let accepted = accept(
            &windows,
            vec![
                ModelCandidate {
                    window_index: 0,
                    source_quote: "fresh coffee".into(),
                    query: "coffee brewing".into(),
                },
                ModelCandidate {
                    window_index: 0,
                    source_quote: "a mountain".into(),
                    query: "mountain".into(),
                },
                ModelCandidate {
                    window_index: 0,
                    source_quote: "fresh coffee".into(),
                    query: "coffee:secret".into(),
                },
            ],
        );
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].start_ms, 5_000);
        assert_eq!(
            title_score("Fresh coffee brewing.webm", "coffee brewing"),
            2
        );
        assert_eq!(title_score("Mountain road.webm", "coffee brewing"), 0);
    }

    #[test]
    fn repeated_dino_in_a_quote_uses_the_full_visual_noun() {
        let candidate = SearchCandidate {
            start_ms: 5_000,
            source_quote: "berkutat sama Dino-Dino".into(),
            query: "Dino-Dino".into(),
        };
        assert_eq!(contextual_query(&candidate), "dinosaur");
    }

    #[test]
    fn long_multilingual_windows_fit_the_model_prompt_budget() {
        let windows = (0..24)
            .map(|index| TranscriptWindow {
                index,
                start_ms: index as i64 * 5_000,
                text: "字幕 dan permainan yang seru ".repeat(20),
            })
            .collect::<Vec<_>>();
        assert!(prompt_transcript(&windows).len() < 1_900);
    }
}

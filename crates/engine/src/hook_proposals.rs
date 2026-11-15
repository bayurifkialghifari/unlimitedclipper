use crate::{models::*, pipeline, state::AppState};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use tokio_util::sync::CancellationToken;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HookProposal {
    pub id: String,
    pub text: String,
    pub source_quote: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HookProposalSet {
    pub id: String,
    pub clip_id: String,
    pub revision: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_signature: Option<String>,
    pub language: String,
    pub proposals: Vec<HookProposal>,
    pub created_at: i64,
}

#[derive(Deserialize)]
struct ModelProposal {
    text: String,
    source_quote: String,
    explanation: String,
}

#[derive(Deserialize)]
struct ModelResponse {
    proposals: Vec<ModelProposal>,
}

pub async fn latest(pool: &SqlitePool, clip_id: &str) -> Result<Option<HookProposalSet>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT data FROM hook_proposals WHERE clip_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .bind(clip_id)
    .fetch_optional(pool)
    .await?;
    row.map(|(data,)| {
        serde_json::from_str(&data).context("Stored hook proposals could not be read.")
    })
    .transpose()
}

async fn by_id(pool: &SqlitePool, id: &str) -> Result<Option<HookProposalSet>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT data FROM hook_proposals WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    row.map(|(data,)| {
        serde_json::from_str(&data).context("Stored hook proposals could not be read.")
    })
    .transpose()
}

fn normalized(text: &str) -> String {
    text.chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn normalized_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(normalized)
        .filter(|word| !word.is_empty())
        .collect()
}

fn source_signature(document: &EditDocument) -> Result<String> {
    let segments = document
        .segments
        .iter()
        .map(|segment| json!([segment.start_ms, segment.end_ms]))
        .collect::<Vec<_>>();
    let words = document
        .words
        .iter()
        .map(|word| json!([word.id, word.text, word.start_ms, word.end_ms]))
        .collect::<Vec<_>>();
    Ok(serde_json::to_string(&json!([
        document.start_ms,
        document.end_ms,
        segments,
        words
    ]))?)
}

fn accept(transcript: &str, candidates: Vec<ModelProposal>) -> Vec<HookProposal> {
    let source = normalized_words(transcript);
    let mut seen = std::collections::HashSet::new();
    let mut proposals = Vec::new();
    for candidate in candidates {
        let text = candidate.text.trim();
        let source_quote = candidate.source_quote.trim();
        let explanation = candidate.explanation.trim();
        let title_key = normalized(text);
        let quote = normalized_words(source_quote);
        let quote_length = quote.iter().map(String::len).sum::<usize>();
        if title_key.len() < 8
            || title_key.len() > 240
            || quote_length < 8
            || source_quote.chars().count() > 200
            || explanation.is_empty()
            || explanation.chars().count() > 300
            || !source.windows(quote.len()).any(|words| words == quote)
            || !seen.insert(title_key)
        {
            continue;
        }
        proposals.push(HookProposal {
            id: format!("hook-{}", proposals.len() + 1),
            text: text.into(),
            source_quote: source_quote.into(),
            explanation: explanation.into(),
        });
        if proposals.len() == 8 {
            break;
        }
    }
    proposals
}

pub async fn generate(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    if let Some(existing) = by_id(&state.db, &job.id).await? {
        job.payload["proposal_count"] = json!(existing.proposals.len());
        return Ok(());
    }
    let clip: Clip = serde_json::from_value(job.payload["snapshot"].clone())
        .context("Missing frozen clip for hook proposals.")?;
    let language = job.payload["language"]
        .as_str()
        .context("Missing frozen hook language.")?;
    let transcript = clip
        .document
        .words
        .iter()
        .filter_map(|word| (!word.text.trim().is_empty()).then_some(word.text.trim()))
        .collect::<Vec<_>>()
        .join(" ");
    ensure!(
        !transcript.is_empty(),
        "Transcribe this clip before requesting hook proposals."
    );
    let schema = json!({
        "type": "object",
        "properties": {
            "proposals": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "source_quote": {"type": "string"},
                        "explanation": {"type": "string"}
                    },
                    "required": ["text", "source_quote", "explanation"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["proposals"],
        "additionalProperties": false
    });
    let prompt = format!(
        "Write up to eight distinct short opening hooks in {language}. Use only the clip transcript. Each hook must have an exact contiguous source_quote from the transcript and a brief explanation of why that quote supports it. Do not invent people, outcomes, numbers, or claims. Return fewer than eight if the transcript lacks distinct grounded angles. The user will review before applying. Transcript: {transcript}"
    );
    let output = pipeline::infer(state, &prompt, &schema.to_string(), cancellation).await?;
    let response: ModelResponse = pipeline::extract_json(&output)?;
    let proposals = accept(&transcript, response.proposals);
    ensure!(
        !proposals.is_empty(),
        "No transcript-grounded hook proposals passed review. Edit the hook manually."
    );
    let set = HookProposalSet {
        id: job.id.clone(),
        clip_id: clip.id,
        revision: clip.revision,
        source_signature: Some(source_signature(&clip.document)?),
        language: language.into(),
        proposals,
        created_at: now_ms(),
    };
    sqlx::query(
        "INSERT INTO hook_proposals(id, clip_id, revision, data, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&set.id)
    .bind(&set.clip_id)
    .bind(set.revision)
    .bind(serde_json::to_string(&set)?)
    .bind(set.created_at)
    .execute(&state.db)
    .await?;
    job.payload["proposal_count"] = json!(set.proposals.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposals_require_a_source_quote_and_distinct_hook() {
        let transcript = "We crossed the river before the storm arrived.";
        let candidates = vec![
            ModelProposal {
                text: "The river crossing".into(),
                source_quote: "crossed the river".into(),
                explanation: "This action starts the story.".into(),
            },
            ModelProposal {
                text: "The river crossing".into(),
                source_quote: "before the storm".into(),
                explanation: "This repeats the same hook.".into(),
            },
            ModelProposal {
                text: "A secret rescue".into(),
                source_quote: "rescued the pilot".into(),
                explanation: "This invents an event.".into(),
            },
        ];
        let accepted = accept(transcript, candidates);
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].source_quote, "crossed the river");
    }

    #[test]
    fn proposals_reject_partial_word_quotes() {
        let candidates = vec![ModelProposal {
            text: "A river crossing".into(),
            source_quote: "er before".into(),
            explanation: "This is not a complete source phrase.".into(),
        }];
        assert!(accept("We crossed the river before dawn.", candidates).is_empty());
    }

    #[test]
    fn source_signature_ignores_presentation_changes() {
        let project = Project {
            id: "project".into(),
            name: "Source".into(),
            source_kind: "file".into(),
            source_url: None,
            asset_id: "asset".into(),
            preview_asset_id: None,
            thumbnail_id: None,
            duration_ms: 5000,
            width: 1920,
            height: 1080,
            has_audio: true,
            language: None,
            transcript_configuration: None,
            created_at: 0,
            words: vec![],
        };
        let mut document = EditDocument::new(&project, 0, 5000);
        let original = source_signature(&document).unwrap();
        document.title.text = "Another hook".into();
        document.captions.size += 1;
        assert_eq!(source_signature(&document).unwrap(), original);
        document.segments[0].end_ms = 4500;
        assert_ne!(source_signature(&document).unwrap(), original);
    }
}

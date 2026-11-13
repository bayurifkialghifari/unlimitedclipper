use crate::models::Word;
use serde_json::Value;
use uuid::Uuid;

#[derive(Default)]
struct PendingWord {
    text: String,
    start_ms: i64,
    end_ms: i64,
    probability: f64,
    tokens: usize,
}

fn finish(pending: &mut PendingWord, words: &mut Vec<Word>, duration_ms: i64) {
    let text = pending.text.trim();
    if !text.is_empty() && text.chars().any(char::is_alphanumeric) {
        let start_ms = pending.start_ms.clamp(0, duration_ms);
        let end_ms = pending
            .end_ms
            .clamp(start_ms + 1, duration_ms.max(start_ms + 1));
        if start_ms < duration_ms {
            words.push(Word {
                id: Uuid::new_v4().to_string(),
                text: text.to_string(),
                start_ms,
                end_ms,
                emphasis: false,
                color: None,
                confidence: (pending.tokens > 0)
                    .then(|| (pending.probability / pending.tokens as f64).exp()),
            });
        }
    }
    *pending = PendingWord::default();
}

pub fn parse_transcript(value: &Value, duration_ms: i64) -> Vec<Word> {
    let mut words = Vec::new();
    let mut annotation_end = None;
    let Some(segments) = value["transcription"].as_array() else {
        return words;
    };
    for segment in segments {
        let mut pending = PendingWord::default();
        let segment_start = segment["offsets"]["from"].as_i64().unwrap_or(0);
        let segment_end = segment["offsets"]["to"]
            .as_i64()
            .unwrap_or(segment_start + 100);
        let fallback_text = segment["text"].as_str().unwrap_or("");
        let fallback_parts = fallback_text.split_whitespace().collect::<Vec<_>>();
        let fallback = fallback_parts
            .iter()
            .enumerate()
            .map(|(index, text)| {
                let span = (segment_end - segment_start).max(1);
                let count = fallback_parts.len().max(1) as i64;
                serde_json::json!({
                    "text": format!(" {text}"),
                    "offsets": {
                        "from": segment_start + span * index as i64 / count,
                        "to": segment_start + span * (index + 1) as i64 / count
                    }
                })
            })
            .collect::<Vec<_>>();
        let tokens = segment["tokens"].as_array().unwrap_or(&fallback);
        for (index, token) in tokens.iter().enumerate() {
            let text = token["text"].as_str().unwrap_or("");
            if text.starts_with("[_") || text.starts_with("<|") {
                continue;
            }
            let aligned = token["t_dtw"].as_f64().filter(|time| *time >= 0.0);
            let start_ms = aligned
                .map(|time| (time * 10.0).round() as i64)
                .unwrap_or_else(|| token["offsets"]["from"].as_i64().unwrap_or(segment_start));
            let next_aligned = tokens[index + 1..]
                .iter()
                .filter_map(|next| next["t_dtw"].as_f64())
                .find(|time| *time * 10.0 > start_ms as f64);
            let end_ms = if aligned.is_some() {
                next_aligned
                    .map(|time| (time * 10.0).round() as i64)
                    .unwrap_or_else(|| {
                        token["offsets"]["to"]
                            .as_i64()
                            .unwrap_or(start_ms + 250)
                            .max(start_ms + 100)
                    })
                    .min(start_ms + 1500)
            } else {
                token["offsets"]["to"].as_i64().unwrap_or(segment_end)
            };
            for character in text.chars() {
                if let Some(end) = annotation_end {
                    if character == end {
                        annotation_end = None;
                    }
                    continue;
                }
                match character {
                    '[' | '(' | '*' => {
                        finish(&mut pending, &mut words, duration_ms);
                        annotation_end = Some(match character {
                            '[' => ']',
                            '(' => ')',
                            _ => '*',
                        });
                    }
                    character if character.is_whitespace() => {
                        finish(&mut pending, &mut words, duration_ms);
                    }
                    character => {
                        if pending.text.is_empty() {
                            pending.start_ms = start_ms;
                        }
                        pending.text.push(character);
                        pending.end_ms = end_ms;
                    }
                }
            }
            if !pending.text.is_empty()
                && let Some(probability) = token["p"].as_f64()
            {
                pending.probability += probability.clamp(0.000001, 1.0).ln();
                pending.tokens += 1;
            }
        }
        finish(&mut pending, &mut words, duration_ms);
    }
    words.sort_by_key(|word| word.start_ms);
    let mut index = 0;
    while index < words.len() {
        let start = words[index].start_ms;
        let mut end = index + 1;
        while end < words.len() && words[end].start_ms == start {
            end += 1;
        }
        if end - index > 1 {
            let available_end = words[index..end]
                .iter()
                .map(|word| word.end_ms)
                .max()
                .unwrap()
                .min(
                    words
                        .get(end)
                        .map(|word| word.start_ms)
                        .unwrap_or(duration_ms),
                );
            let span = available_end - start;
            let count = (end - index) as i64;
            for (position, word) in words[index..end].iter_mut().enumerate() {
                word.start_ms = start + span * position as i64 / count;
                word.end_ms = start + span * (position + 1) as i64 / count;
                word.confidence = word.confidence.map(|confidence| confidence.min(0.64));
            }
        }
        index = end;
    }
    words.retain(|word| word.end_ms > word.start_ms);
    for index in 0..words.len() {
        let next_start = words.get(index + 1).map(|word| word.start_ms);
        let word = &mut words[index];
        word.end_ms = word.end_ms.min(word.start_ms + 1500);
        if let Some(next_start) = next_start.filter(|start| *start > word.start_ms) {
            word.end_ms = word.end_ms.min(next_start);
        }
    }
    words
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn equal_alignment_anchors_do_not_create_overlapping_words() {
        let value = json!({"transcription":[
            {"tokens":[{"text":" ini","t_dtw":100,"p":0.9}]},
            {"tokens":[{"text":" cuy","t_dtw":100,"p":0.9}]},
            {"tokens":[{"text":" Lari","t_dtw":150,"p":0.9}]}
        ]});
        let words = parse_transcript(&value, 2000);
        assert!(words[0].end_ms <= words[1].start_ms);
        assert!(words[1].end_ms <= words[2].start_ms);
        assert!(words[0].confidence.unwrap() < 0.65);
    }

    #[test]
    fn legacy_segments_are_spread_and_out_of_source_tokens_are_excluded() {
        let value = json!({"transcription": [
            {"text":"One two three.", "offsets":{"from":1000,"to":2500}},
            {"tokens":[{"text":" outside","t_dtw":600}]}
        ]});
        let words = parse_transcript(&value, 5000);
        assert_eq!(words.len(), 3);
        assert_eq!(
            words.iter().map(|word| word.start_ms).collect::<Vec<_>>(),
            [1000, 1500, 2000]
        );
        assert_eq!(words[2].end_ms, 2500);
        assert!(words.iter().all(|word| word.confidence.is_none()));
    }

    #[test]
    fn token_alignment_keeps_speech_after_silence_and_joins_subwords() {
        let value = json!({"transcription": [{
            "text": " Merampok, guys!", "offsets": {"from": 0, "to": 12000},
            "tokens": [
                {"text": " Mer", "p": 0.8, "t_dtw": 900},
                {"text": "ampok", "p": 0.9, "t_dtw": 920},
                {"text": ",", "p": 0.9, "t_dtw": 940},
                {"text": " guys", "p": 0.7, "t_dtw": 1000},
                {"text": "!", "p": 0.9, "t_dtw": 1030}
            ]
        }]});
        let words = parse_transcript(&value, 12000);
        assert_eq!(words[0].text, "Merampok,");
        assert_eq!(words[0].start_ms, 9000);
        assert_eq!(words[0].end_ms, 10000);
        assert_eq!(words[1].text, "guys!");
        assert_eq!(words[1].start_ms, 10000);
        assert!(words[0].confidence.unwrap() > 0.8);
    }
}

use crate::models::*;

impl EditDocument {
    pub fn source_segments(&self) -> Vec<SourceSegment> {
        if self.version == 1 || self.segments.is_empty() {
            vec![SourceSegment {
                start_ms: self.start_ms,
                end_ms: self.end_ms,
            }]
        } else {
            self.segments.clone()
        }
    }

    pub fn duration_ms(&self) -> i64 {
        self.source_segments()
            .iter()
            .map(|segment| segment.end_ms - segment.start_ms)
            .sum()
    }

    pub fn source_to_output(&self, source_ms: i64) -> Option<i64> {
        let mut offset = 0;
        for segment in self.source_segments() {
            if source_ms >= segment.start_ms && source_ms < segment.end_ms {
                return Some(offset + source_ms - segment.start_ms);
            }
            offset += segment.end_ms - segment.start_ms;
        }
        if source_ms == self.end_ms {
            Some(offset)
        } else {
            None
        }
    }

    pub fn output_to_source(&self, output_ms: i64) -> Option<i64> {
        if output_ms < 0 {
            return None;
        }
        let mut offset = 0;
        for segment in self.source_segments() {
            let duration = segment.end_ms - segment.start_ms;
            if output_ms < offset + duration {
                return Some(segment.start_ms + output_ms - offset);
            }
            offset += duration;
        }
        if output_ms == offset {
            Some(self.end_ms)
        } else {
            None
        }
    }

    pub fn validate_timeline(&self, source_duration: i64) -> Result<(), String> {
        if self.version == 1
            && (!self.segments.is_empty()
                || !self.visual_layers.is_empty()
                || !self.audio_layers.is_empty())
        {
            return Err("Advanced edits require document version 2.".into());
        }
        if self.version == 2 && (self.segments.is_empty() || self.segments.len() > 32) {
            return Err("A timeline needs between one and 32 source segments.".into());
        }
        let mut previous = -1;
        for segment in self.source_segments() {
            if segment.start_ms < 0
                || segment.start_ms < previous
                || segment.end_ms <= segment.start_ms
                || segment.end_ms > source_duration
            {
                return Err(
                    "Source segments must be ordered, disjoint, and inside the source.".into(),
                );
            }
            previous = segment.end_ms;
        }
        if self.version == 2
            && (self.segments[0].start_ms != self.start_ms
                || self.segments.last().unwrap().end_ms != self.end_ms)
        {
            return Err("Timeline boundaries must match the segment envelope.".into());
        }
        if self.visual_layers.len() > 64 || self.audio_layers.len() > 16 {
            return Err("This edit exceeds the supported layer limit.".into());
        }
        let duration = self.duration_ms();
        let mut ids = std::collections::HashSet::new();
        for layer in &self.visual_layers {
            if !ids.insert(&layer.id)
                || layer.id.is_empty()
                || layer.start_ms < 0
                || layer.end_ms <= layer.start_ms
                || layer.end_ms > duration
                || !["punch_in", "split", "text", "note", "camera_frame", "broll"]
                    .contains(&layer.kind.as_str())
                || layer.text.chars().count() > 200
                || !(12..=220).contains(&layer.size)
                || !layer.x.is_finite()
                || !layer.y.is_finite()
                || !(0.0..=1.0).contains(&layer.x)
                || !(0.0..=1.0).contains(&layer.y)
            {
                return Err("Visual layers need valid types, timing, and positions.".into());
            }
            validate_color(&layer.color)?;
            for crop in [&layer.crop, &layer.secondary_crop].into_iter().flatten() {
                if ![crop.x, crop.y, crop.width, crop.height]
                    .iter()
                    .all(|value| value.is_finite())
                    || crop.x < 0.0
                    || crop.y < 0.0
                    || crop.width < 0.01
                    || crop.height < 0.01
                    || crop.x + crop.width > 1.00001
                    || crop.y + crop.height > 1.00001
                {
                    return Err("Layer crops must stay inside the source.".into());
                }
            }
            if layer.kind == "punch_in" && layer.crop.is_none()
                || layer.kind == "split" && (layer.crop.is_none() || layer.secondary_crop.is_none())
                || (layer.kind == "broll"
                    && (layer.asset_id.is_none() || layer.source_start_ms < 0))
            {
                return Err(
                    "Choose the required crops; B-roll uses registered source clips.".into(),
                );
            }
        }
        for layer in &self.audio_layers {
            if !ids.insert(&layer.id)
                || layer.id.is_empty()
                || layer.start_ms < 0
                || layer.end_ms <= layer.start_ms
                || layer.end_ms > duration
                || layer.source_start_ms < 0
                || !layer.gain.is_finite()
                || !(0.0..=1.0).contains(&layer.gain)
                || (layer.asset_id.is_none() && layer.end_ms - layer.start_ms > 500)
            {
                return Err(
                    "Audio layers need valid timing, gain, and a managed asset or short tap."
                        .into(),
                );
            }
        }
        Ok(())
    }

    fn remap_ranges(&self, start: i64, end: i64, target: &Self) -> Vec<(i64, i64, i64)> {
        let mut ranges = Vec::new();
        let mut old_offset = 0;
        for old in self.source_segments() {
            let from = start.max(old_offset);
            let to = end.min(old_offset + old.end_ms - old.start_ms);
            if to > from {
                let source_start = old.start_ms + from - old_offset;
                let source_end = old.start_ms + to - old_offset;
                let mut new_offset = 0;
                for segment in target.source_segments() {
                    let kept_start = source_start.max(segment.start_ms);
                    let kept_end = source_end.min(segment.end_ms);
                    if kept_end > kept_start {
                        ranges.push((
                            new_offset + kept_start - segment.start_ms,
                            new_offset + kept_end - segment.start_ms,
                            old_offset + kept_start - old.start_ms,
                        ));
                    }
                    new_offset += segment.end_ms - segment.start_ms;
                }
            }
            old_offset += old.end_ms - old.start_ms;
        }
        ranges.sort_by_key(|range| range.0);
        ranges
    }

    pub fn replace_segments(&self, segments: Vec<SourceSegment>) -> Self {
        let mut result = self.clone();
        result.version = 2;
        result.start_ms = segments
            .first()
            .map_or(self.start_ms, |segment| segment.start_ms);
        result.end_ms = segments
            .last()
            .map_or(self.end_ms, |segment| segment.end_ms);
        result.segments = segments;
        result.words = self
            .words
            .iter()
            .filter_map(|word| {
                let (mapped_start, mapped_end, old_start) = self
                    .remap_ranges(word.start_ms, word.end_ms, &result)
                    .into_iter()
                    .max_by_key(|range| range.1 - range.0)?;
                let start = self.output_to_source(old_start)?;
                let end = start + mapped_end - mapped_start;
                let mut word = word.clone();
                word.start_ms = mapped_start;
                word.end_ms = mapped_end;
                if word.timing.is_none() {
                    word.timing = Some(WordTiming {
                        provenance: "estimated".into(),
                        source_start_ms: start,
                        source_end_ms: end,
                        alignment_confidence: None,
                    });
                }
                Some(word)
            })
            .collect();
        let mapping = result.clone();
        let remap = |time| {
            self.output_to_source(time)
                .and_then(|source| mapping.source_to_output(source))
        };
        result.keyframes = self
            .keyframes
            .iter()
            .filter_map(|key| {
                Some(Keyframe {
                    time_ms: remap(key.time_ms)?,
                    ..key.clone()
                })
            })
            .collect();
        if !self.keyframes.is_empty() {
            let mut offset = 0;
            for segment in result.source_segments() {
                if let Some(time) = self.source_to_output(segment.start_ms) {
                    let from = self.keyframes.iter().rev().find(|key| key.time_ms <= time);
                    let to = self.keyframes.iter().find(|key| key.time_ms > time);
                    let (from_time, x, y) = from.map_or((0, self.crop.x, self.crop.y), |key| {
                        (key.time_ms, key.x, key.y)
                    });
                    let (x, y) = to.map_or((x, y), |key| {
                        let fraction = (time - from_time) as f64 / (key.time_ms - from_time) as f64;
                        (x + (key.x - x) * fraction, y + (key.y - y) * fraction)
                    });
                    result.keyframes.push(Keyframe {
                        time_ms: offset,
                        x,
                        y,
                    });
                }
                offset += segment.end_ms - segment.start_ms;
            }
            result.keyframes.sort_by_key(|key| key.time_ms);
            result.keyframes.dedup_by_key(|key| key.time_ms);
        }
        result.visual_layers = self
            .visual_layers
            .iter()
            .flat_map(|layer| {
                self.remap_ranges(layer.start_ms, layer.end_ms, &mapping)
                    .into_iter()
                    .enumerate()
                    .map(|(index, (start, end, old_start))| VisualLayer {
                        id: if index == 0 {
                            layer.id.clone()
                        } else {
                            format!("{}-cut-{index}", layer.id)
                        },
                        start_ms: start,
                        end_ms: end,
                        source_start_ms: if layer.kind == "broll" {
                            layer.source_start_ms + old_start - layer.start_ms
                        } else {
                            layer.source_start_ms
                        },
                        ..layer.clone()
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        result.audio_layers = self
            .audio_layers
            .iter()
            .flat_map(|layer| {
                self.remap_ranges(layer.start_ms, layer.end_ms, &mapping)
                    .into_iter()
                    .enumerate()
                    .map(|(index, (start, end, old_start))| AudioLayer {
                        id: if index == 0 {
                            layer.id.clone()
                        } else {
                            format!("{}-cut-{index}", layer.id)
                        },
                        start_ms: start,
                        end_ms: end,
                        source_start_ms: layer.source_start_ms + old_start - layer.start_ms,
                        ..layer.clone()
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disjoint_segments_use_half_open_source_ranges() {
        let mut document: EditDocument = serde_json::from_value(serde_json::json!({
            "version": 2, "start_ms": 1000, "end_ms": 7000,
            "segments": [{"start_ms": 1000, "end_ms": 3000}, {"start_ms": 5000, "end_ms": 7000}],
            "layout": "portrait", "resolution": 1080,
            "crop": CropRect::default(), "keyframes": [],
            "gameplay_crop": CropRect::default(), "facecam_crop": CropRect::default(),
            "split_ratio": 0.3, "captions": CaptionStyle::default(),
            "title": TitleStyle::default(), "watermark": Watermark::default(), "words": []
        }))
        .unwrap();
        assert_eq!(document.duration_ms(), 4000);
        assert_eq!(document.source_to_output(3000), None);
        assert_eq!(document.source_to_output(5000), Some(2000));
        assert_eq!(document.output_to_source(2000), Some(5000));
        assert_eq!(document.output_to_source(4000), Some(7000));
        assert!(document.validate(8000).is_ok());
        document.segments[1].start_ms = 2500;
        assert!(document.validate(8000).is_err());
    }
}

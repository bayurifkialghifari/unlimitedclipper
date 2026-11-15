use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Word {
    pub id: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    #[serde(default)]
    pub emphasis: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timing: Option<WordTiming>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WordTiming {
    pub provenance: String,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
    pub alignment_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AudioAsset {
    pub asset_id: String,
    pub name: String,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SourceSegment {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
}

impl SourceSegment {
    pub fn new(start_ms: i64, end_ms: i64) -> Self {
        Self {
            id: None,
            start_ms,
            end_ms,
        }
    }

    pub fn section(&self, start_ms: i64, end_ms: i64) -> Self {
        let id = self.id.as_ref().map(|id| {
            if start_ms == self.start_ms {
                id.clone()
            } else {
                uuid::Uuid::new_v5(
                    &uuid::Uuid::NAMESPACE_URL,
                    format!("uc-scene:{id}:{start_ms}").as_bytes(),
                )
                .to_string()
            }
        });
        Self {
            id,
            start_ms,
            end_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct VisualLayer {
    pub id: String,
    pub enabled: bool,
    pub start_ms: i64,
    pub end_ms: i64,
    pub kind: String,
    pub text: String,
    pub crop: Option<CropRect>,
    pub secondary_crop: Option<CropRect>,
    pub x: f64,
    pub y: f64,
    pub color: String,
    pub size: u32,
    #[serde(default)]
    pub asset_id: Option<String>,
    #[serde(default)]
    pub source_start_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AudioLayer {
    pub id: String,
    pub enabled: bool,
    pub start_ms: i64,
    pub end_ms: i64,
    pub asset_id: Option<String>,
    pub source_start_ms: i64,
    pub gain: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub source_kind: String,
    pub source_url: Option<String>,
    pub asset_id: String,
    #[serde(default)]
    pub preview_asset_id: Option<String>,
    pub thumbnail_id: Option<String>,
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub has_audio: bool,
    pub language: Option<String>,
    #[serde(default)]
    pub transcript_configuration: Option<String>,
    pub created_at: i64,
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProjectDetail {
    pub project: Project,
    pub clips: Vec<Clip>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Layout {
    Portrait,
    Square,
    Landscape,
    Contain,
    Blur,
    Gaming,
}

impl Layout {
    pub fn dimensions(self, resolution: u32) -> (u32, u32) {
        match self {
            Self::Square => (resolution, resolution),
            Self::Landscape => (resolution * 16 / 9 / 2 * 2, resolution),
            _ => (resolution, resolution * 16 / 9 / 2 * 2),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for CropRect {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Keyframe {
    pub time_ms: i64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CaptionStyle {
    pub enabled: bool,
    pub preset: String,
    pub font: String,
    pub size: u32,
    pub color: String,
    pub highlight_color: String,
    pub outline_color: String,
    pub outline: f64,
    pub position_y: f64,
    pub words_per_line: usize,
    pub animation: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub uppercase: bool,
}

impl Default for CaptionStyle {
    fn default() -> Self {
        Self {
            enabled: true,
            preset: "highlight".into(),
            font: "DM Sans".into(),
            size: 84,
            color: "#FFFFFF".into(),
            highlight_color: "#FFB86B".into(),
            outline_color: "#000000".into(),
            outline: 4.0,
            position_y: 0.70,
            words_per_line: 3,
            animation: "none".into(),
            bold: true,
            uppercase: false,
        }
    }
}

impl CaptionStyle {
    pub fn validate(&self) -> Result<(), String> {
        for color in [&self.color, &self.highlight_color, &self.outline_color] {
            validate_color(color)?;
        }
        if !["Noto Sans", "DM Sans", "Oswald"].contains(&self.font.as_str()) {
            return Err("Choose one of the bundled fonts.".into());
        }
        if !(12..=180).contains(&self.size)
            || !(1..=10).contains(&self.words_per_line)
            || !self.outline.is_finite()
            || !(0.0..=12.0).contains(&self.outline)
            || ![
                "plain",
                "highlight",
                "box",
                "word",
                "kinetic",
                "reveal",
                "underline",
            ]
            .contains(&self.preset.as_str())
            || !["none", "fade", "pop"].contains(&self.animation.as_str())
            || !self.position_y.is_finite()
            || !(0.0..=1.0).contains(&self.position_y)
        {
            return Err("Invalid caption style.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct TitleStyle {
    pub text: String,
    pub preset: String,
    pub font: String,
    pub size: u32,
    pub color: String,
    pub position_y: f64,
    pub duration_ms: i64,
    #[serde(default)]
    pub start_ms: i64,
    #[serde(default = "default_title_animation")]
    pub animation: String,
}

impl Default for TitleStyle {
    fn default() -> Self {
        Self {
            text: String::new(),
            preset: "bold".into(),
            font: "Oswald".into(),
            size: 76,
            color: "#FFFFFF".into(),
            position_y: 0.12,
            duration_ms: 3000,
            start_ms: 0,
            animation: default_title_animation(),
        }
    }
}

fn default_title_animation() -> String {
    "none".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HeadingCard {
    pub text: String,
    pub duration_ms: i64,
    pub font: String,
    pub size: u32,
    pub color: String,
    pub background: String,
    pub position_y: f64,
    pub animation: String,
}

impl HeadingCard {
    pub fn validate(&self) -> Result<(), String> {
        validate_color(&self.color)?;
        validate_color(&self.background)?;
        if self.text.trim().is_empty()
            || self.text.chars().count() > 300
            || !(300..=10_000).contains(&self.duration_ms)
            || !(12..=220).contains(&self.size)
            || !["Noto Sans", "DM Sans", "Oswald"].contains(&self.font.as_str())
            || !["none", "fade", "pop"].contains(&self.animation.as_str())
            || !self.position_y.is_finite()
            || !(0.05..=0.95).contains(&self.position_y)
        {
            return Err("A card needs text, a supported style, and 0.3 to 10 seconds.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(default)]
pub struct VideoAdjustments {
    pub brightness: i32,
    pub contrast: i32,
    pub saturation: i32,
    pub warmth: i32,
}

impl VideoAdjustments {
    pub fn validate(&self) -> Result<(), String> {
        if [self.brightness, self.contrast, self.saturation, self.warmth]
            .iter()
            .any(|value| !(-100..=100).contains(value))
        {
            return Err("Video adjustments must be between -100 and 100.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Watermark {
    pub mode: String,
    pub text: String,
    pub asset_id: Option<String>,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
    pub color: String,
}

impl Default for Watermark {
    fn default() -> Self {
        Self {
            mode: "none".into(),
            text: String::new(),
            asset_id: None,
            x: 0.85,
            y: 0.92,
            scale: 0.18,
            opacity: 0.7,
            color: "#FFFFFF".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EditDocument {
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intro_card: Option<HeadingCard>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outro_card: Option<HeadingCard>,
    #[serde(default)]
    pub segments: Vec<SourceSegment>,
    #[serde(default)]
    pub visual_layers: Vec<VisualLayer>,
    #[serde(default)]
    pub audio_layers: Vec<AudioLayer>,
    #[serde(default)]
    pub video_adjustments: VideoAdjustments,
    pub start_ms: i64,
    pub end_ms: i64,
    pub layout: Layout,
    pub resolution: u32,
    pub crop: CropRect,
    pub keyframes: Vec<Keyframe>,
    pub gameplay_crop: CropRect,
    pub facecam_crop: CropRect,
    pub split_ratio: f64,
    pub captions: CaptionStyle,
    pub title: TitleStyle,
    pub watermark: Watermark,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_model: Option<String>,
    pub words: Vec<Word>,
}

impl EditDocument {
    pub fn new(project: &Project, start_ms: i64, end_ms: i64) -> Self {
        let crop_width = (project.height as f64 * 9.0 / 16.0 / project.width as f64).min(1.0);
        Self {
            version: 2,
            intro_card: None,
            outro_card: None,
            segments: vec![SourceSegment::new(start_ms, end_ms)],
            visual_layers: Vec::new(),
            audio_layers: Vec::new(),
            video_adjustments: VideoAdjustments::default(),
            start_ms,
            end_ms,
            layout: Layout::Portrait,
            resolution: 1080,
            crop: CropRect {
                x: (1.0 - crop_width) / 2.0,
                y: 0.0,
                width: crop_width,
                height: 1.0,
            },
            keyframes: Vec::new(),
            gameplay_crop: CropRect::default(),
            facecam_crop: CropRect {
                x: 0.0,
                y: 0.0,
                width: 0.3,
                height: 0.3,
            },
            split_ratio: 0.3,
            captions: CaptionStyle::default(),
            title: TitleStyle::default(),
            watermark: Watermark::default(),
            caption_model: project.transcript_configuration.clone(),
            words: project
                .words
                .iter()
                .filter(|word| word.end_ms > start_ms && word.start_ms < end_ms)
                .map(|word| Word {
                    start_ms: (word.start_ms - start_ms).max(0),
                    end_ms: (word.end_ms - start_ms).min(end_ms - start_ms),
                    ..word.clone()
                })
                .collect(),
        }
    }

    pub fn validate(&self, source_duration: i64) -> Result<(), String> {
        self.captions.validate()?;
        if self.version < 4 && (self.intro_card.is_some() || self.outro_card.is_some()) {
            return Err("Independent cards require document version 4.".into());
        }
        for card in [&self.intro_card, &self.outro_card].into_iter().flatten() {
            card.validate()?;
        }
        if ![1, 2, 3, 4].contains(&self.version)
            || self.start_ms < 0
            || self.end_ms <= self.start_ms
            || self.end_ms > source_duration
        {
            return Err("Clip boundaries must be inside the source video.".into());
        }
        if ![720, 1080, 1440, 2160].contains(&self.resolution) {
            return Err("Unsupported output resolution.".into());
        }
        for rect in [&self.crop, &self.gameplay_crop, &self.facecam_crop] {
            if ![rect.x, rect.y, rect.width, rect.height]
                .iter()
                .all(|v| v.is_finite())
                || rect.x < 0.0
                || rect.y < 0.0
                || rect.width < 0.01
                || rect.height < 0.01
                || rect.x + rect.width > 1.00001
                || rect.y + rect.height > 1.00001
            {
                return Err("Crop rectangles must remain inside the source.".into());
            }
        }
        self.validate_timeline(source_duration)?;
        let duration = self.duration_ms();
        let mut previous = -1;
        for keyframe in &self.keyframes {
            if keyframe.time_ms <= previous
                || keyframe.time_ms > duration
                || !keyframe.x.is_finite()
                || !keyframe.y.is_finite()
                || keyframe.x < 0.0
                || keyframe.y < 0.0
                || keyframe.x + self.crop.width > 1.00001
                || keyframe.y + self.crop.height > 1.00001
            {
                return Err("Keyframes must be sorted, unique, and inside the crop bounds.".into());
            }
            previous = keyframe.time_ms;
        }
        previous = -1;
        let mut word_ids = std::collections::HashSet::new();
        for word in &self.words {
            if self.version >= 3 && (word.id.is_empty() || !word_ids.insert(&word.id)) {
                return Err("Caption words need unique IDs.".into());
            }
            if word.start_ms < 0
                || word.start_ms < previous
                || word.end_ms <= word.start_ms
                || word.end_ms > duration
                || word.text.chars().count() > 500
            {
                return Err("Caption words need valid ordered timing within the clip.".into());
            }
            if let Some(color) = &word.color {
                validate_color(color)?;
            }
            if word
                .confidence
                .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
            {
                return Err("Caption confidence must be between zero and one.".into());
            }
            if let Some(timing) = &word.timing
                && (!["estimated", "aligned", "manual"].contains(&timing.provenance.as_str())
                    || timing.source_start_ms < 0
                    || timing.source_end_ms <= timing.source_start_ms
                    || timing.source_end_ms > source_duration
                    || timing
                        .alignment_confidence
                        .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value)))
            {
                return Err("Caption timing needs valid source bounds and provenance.".into());
            }
            previous = word.start_ms;
        }
        for color in [&self.title.color, &self.watermark.color] {
            validate_color(color)?;
        }
        if !["Noto Sans", "DM Sans", "Oswald"].contains(&self.title.font.as_str()) {
            return Err("Choose one of the bundled fonts.".into());
        }
        if !(12..=220).contains(&self.title.size)
            || !["bold", "plain", "boxed"].contains(&self.title.preset.as_str())
            || self.title.text.chars().count() > 300
            || self.title.duration_ms < 0
            || self.title.start_ms < 0
            || !["none", "fade", "pop"].contains(&self.title.animation.as_str())
            || !["none", "text", "image"].contains(&self.watermark.mode.as_str())
            || self.watermark.text.chars().count() > 150
        {
            return Err("Invalid caption, title, or watermark style.".into());
        }
        for position in [
            self.captions.position_y,
            self.title.position_y,
            self.watermark.x,
            self.watermark.y,
            self.watermark.opacity,
        ] {
            if !position.is_finite() || !(0.0..=1.0).contains(&position) {
                return Err("Positions and opacity must be between zero and one.".into());
            }
        }
        if !self.split_ratio.is_finite()
            || !(0.1..=0.9).contains(&self.split_ratio)
            || !self.watermark.scale.is_finite()
            || !(0.02..=0.8).contains(&self.watermark.scale)
        {
            return Err("Invalid split ratio or watermark scale.".into());
        }
        self.video_adjustments.validate()?;
        Ok(())
    }
}

pub fn validate_color(color: &str) -> Result<(), String> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Colors must use six-digit hexadecimal notation.".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Clip {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub explanation: String,
    pub score: Option<u32>,
    pub revision: i64,
    pub document: EditDocument,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Job {
    pub id: String,
    pub project_id: Option<String>,
    pub clip_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub stage: String,
    pub progress: f64,
    pub message: String,
    pub error: Option<String>,
    pub payload: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Export {
    pub id: String,
    pub clip_id: String,
    pub project_id: String,
    pub revision: i64,
    pub name: String,
    pub asset_id: String,
    pub srt_asset_id: String,
    pub ass_asset_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Settings {
    pub language: String,
    pub speech_model: String,
    #[serde(default = "default_ai_mode")]
    pub ai_mode: String,
    #[serde(default = "default_content_profile")]
    pub content_profile: String,
    pub transcription_language: String,
    pub clip_count: usize,
    pub clip_duration_ms: i64,
    pub resolution: u32,
    pub auto_update: bool,
    pub update_feed: String,
    pub component_feed: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "id".into(),
            speech_model: "whisper-small".into(),
            ai_mode: default_ai_mode(),
            content_profile: default_content_profile(),
            transcription_language: "auto".into(),
            clip_count: 4,
            clip_duration_ms: 0,
            resolution: 1080,
            auto_update: true,
            update_feed: String::new(),
            component_feed: String::new(),
        }
    }
}

pub fn default_ai_mode() -> String {
    "economy".into()
}

pub fn default_content_profile() -> String {
    "podcast".into()
}

pub const CONTENT_PROFILES: &[&str] = &["podcast", "gaming", "motivation", "education", "general"];

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ModelSpec {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub filename: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub license: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ModelStatus {
    #[serde(flatten)]
    pub spec: ModelSpec,
    pub ready: bool,
    pub downloaded_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Event {
    pub sequence: u64,
    pub kind: String,
    pub job: Option<Job>,
}

pub fn model_specs() -> Vec<ModelSpec> {
    serde_json::from_str(include_str!("../../../resources/models.json"))
        .expect("Embedded model manifest is valid")
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

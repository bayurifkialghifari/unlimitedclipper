use crate::models::CaptionStyle;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct CaptionPreset {
    pub id: String,
    pub style: CaptionStyle,
}

pub fn presets() -> Vec<CaptionPreset> {
    let studio = CaptionStyle::default();
    let impact = CaptionStyle {
        font: "Oswald".into(),
        size: 128,
        uppercase: true,
        words_per_line: 3,
        highlight_color: "#FFE45B".into(),
        outline: 5.0,
        animation: "pop".into(),
        ..studio.clone()
    };
    let boxed = CaptionStyle {
        preset: "box".into(),
        highlight_color: "#E83B2C".into(),
        size: 80,
        ..studio.clone()
    };
    let word = CaptionStyle {
        preset: "word".into(),
        uppercase: true,
        size: 104,
        words_per_line: 1,
        animation: "pop".into(),
        highlight_color: "#FFE45B".into(),
        ..studio.clone()
    };
    [
        ("studio", studio),
        ("impact", impact),
        ("boxed", boxed),
        ("word", word),
    ]
    .into_iter()
    .map(|(id, style)| CaptionPreset {
        id: id.into(),
        style,
    })
    .collect()
}

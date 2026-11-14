use crate::models::EditDocument;
use std::sync::OnceLock;
use ttf_parser::{Face, Tag};

fn font(name: &str) -> &'static Face<'static> {
    static DM: OnceLock<Face<'static>> = OnceLock::new();
    static OSWALD: OnceLock<Face<'static>> = OnceLock::new();
    static NOTO: OnceLock<Face<'static>> = OnceLock::new();
    let (slot, bytes): (&OnceLock<Face<'static>>, &'static [u8]) = match name {
        "DM Sans" => (
            &DM,
            include_bytes!("../../../resources/caption-fonts/DM-Sans.ttf"),
        ),
        "Oswald" => (
            &OSWALD,
            include_bytes!("../../../resources/caption-fonts/Oswald.ttf"),
        ),
        _ => (
            &NOTO,
            include_bytes!("../../../resources/caption-fonts/Noto-Sans.ttf"),
        ),
    };
    slot.get_or_init(|| {
        let mut face = Face::parse(bytes, 0).expect("Bundled caption font is valid");
        face.set_variation(Tag::from_bytes(b"wght"), 700.0);
        face
    })
}

pub fn width(text: &str, document: &EditDocument) -> f64 {
    let face = font(&document.captions.font);
    let units = face.units_per_em() as f64;
    let (width, height) = document.layout.dimensions(document.resolution);
    let size = document.captions.size as f64 * width.min(height) as f64 / 1080.0;
    text.chars()
        .map(|character| {
            face.glyph_index(character)
                .and_then(|glyph| face.glyph_hor_advance(glyph))
                .map_or(units, |advance| advance as f64)
                * size
                / units
        })
        .sum()
}

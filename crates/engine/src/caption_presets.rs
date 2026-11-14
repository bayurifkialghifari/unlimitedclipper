use crate::{
    error::{ApiError, ApiResult},
    models::{CaptionStyle, now_ms},
};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CaptionPreset {
    pub id: String,
    pub name: Option<String>,
    pub category: String,
    pub user_created: bool,
    pub style: CaptionStyle,
}

#[derive(Deserialize, ToSchema)]
pub struct SaveCaptionPreset {
    pub name: String,
    pub style: CaptionStyle,
}

pub async fn list(pool: &SqlitePool) -> ApiResult<Vec<CaptionPreset>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT data FROM caption_presets ORDER BY created_at DESC, id")
            .fetch_all(pool)
            .await?;
    let mut result = presets();
    for (data,) in rows {
        result
            .push(serde_json::from_str(&data).context("Stored caption style could not be read.")?);
    }
    Ok(result)
}

pub async fn save(pool: &SqlitePool, request: SaveCaptionPreset) -> ApiResult<CaptionPreset> {
    let name = request.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(ApiError::bad_request(
            "Style names must contain 1 to 60 characters.",
        ));
    }
    request.style.validate().map_err(ApiError::bad_request)?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM caption_presets")
        .fetch_one(pool)
        .await?;
    if count >= 50 {
        return Err(ApiError::bad_request(
            "Remove a saved style before adding more than 50.",
        ));
    }
    let preset = CaptionPreset {
        id: format!("custom-{}", uuid::Uuid::new_v4()),
        name: Some(name),
        category: "custom".into(),
        user_created: true,
        style: request.style,
    };
    sqlx::query("INSERT INTO caption_presets(id, data, created_at) VALUES (?, ?, ?)")
        .bind(&preset.id)
        .bind(serde_json::to_string(&preset).context("Caption style could not be saved.")?)
        .bind(now_ms())
        .execute(pool)
        .await?;
    Ok(preset)
}

pub async fn remove(pool: &SqlitePool, id: &str) -> ApiResult<()> {
    let result = sqlx::query("DELETE FROM caption_presets WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() != 1 {
        return Err(ApiError::not_found());
    }
    Ok(())
}

fn builtin(id: &str, category: &str, style: CaptionStyle) -> CaptionPreset {
    CaptionPreset {
        id: id.into(),
        name: None,
        category: category.into(),
        user_created: false,
        style,
    }
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
    vec![
        builtin("studio", "highlight", studio.clone()),
        builtin("impact", "bold", impact),
        builtin("boxed", "highlight", boxed),
        builtin("word", "motion", word),
        builtin(
            "kinetic",
            "motion",
            CaptionStyle {
                preset: "kinetic".into(),
                size: 92,
                words_per_line: 4,
                animation: "pop".into(),
                highlight_color: "#FFCB66".into(),
                ..CaptionStyle::default()
            },
        ),
        builtin(
            "clean",
            "minimal",
            CaptionStyle {
                preset: "plain".into(),
                font: "Noto Sans".into(),
                size: 64,
                words_per_line: 6,
                outline: 2.0,
                bold: false,
                ..studio.clone()
            },
        ),
        builtin(
            "documentary",
            "minimal",
            CaptionStyle {
                preset: "plain".into(),
                font: "Noto Sans".into(),
                size: 58,
                color: "#F4EBDD".into(),
                words_per_line: 7,
                outline: 3.0,
                ..studio.clone()
            },
        ),
        builtin(
            "headline",
            "bold",
            CaptionStyle {
                preset: "plain".into(),
                font: "Oswald".into(),
                size: 112,
                uppercase: true,
                words_per_line: 3,
                outline: 5.0,
                ..studio.clone()
            },
        ),
        builtin(
            "punch",
            "bold",
            CaptionStyle {
                preset: "word".into(),
                size: 124,
                words_per_line: 1,
                uppercase: true,
                highlight_color: "#C4ED78".into(),
                outline: 7.0,
                animation: "pop".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "marker",
            "highlight",
            CaptionStyle {
                preset: "box".into(),
                size: 82,
                uppercase: true,
                highlight_color: "#202735".into(),
                animation: "pop".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "blue_box",
            "highlight",
            CaptionStyle {
                preset: "box".into(),
                size: 78,
                highlight_color: "#2459B8".into(),
                words_per_line: 4,
                animation: "fade".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "amber",
            "highlight",
            CaptionStyle {
                font: "Oswald".into(),
                size: 94,
                highlight_color: "#FFB86B".into(),
                uppercase: true,
                outline: 5.0,
                ..studio.clone()
            },
        ),
        builtin(
            "teal",
            "highlight",
            CaptionStyle {
                size: 88,
                highlight_color: "#6EE6D5".into(),
                words_per_line: 4,
                animation: "pop".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "reveal",
            "motion",
            CaptionStyle {
                preset: "reveal".into(),
                size: 84,
                words_per_line: 5,
                animation: "fade".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "underline",
            "highlight",
            CaptionStyle {
                preset: "underline".into(),
                size: 80,
                words_per_line: 4,
                highlight_color: "#FFCF91".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "editorial",
            "bold",
            CaptionStyle {
                preset: "kinetic".into(),
                font: "Oswald".into(),
                size: 98,
                words_per_line: 4,
                uppercase: true,
                highlight_color: "#F7A986".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "soft",
            "minimal",
            CaptionStyle {
                preset: "plain".into(),
                size: 74,
                words_per_line: 5,
                color: "#FFF0DD".into(),
                outline: 2.0,
                animation: "fade".into(),
                ..studio.clone()
            },
        ),
        builtin(
            "whisper",
            "minimal",
            CaptionStyle {
                preset: "word".into(),
                size: 80,
                bold: false,
                words_per_line: 1,
                highlight_color: "#FFFFFF".into(),
                outline: 3.0,
                animation: "fade".into(),
                ..studio
            },
        ),
    ]
}

use serde_json::json;
use unlimitedclipper_engine::{caption_presets, clip_rating, db, models::*};

fn project() -> Project {
    serde_json::from_value(json!({
        "id": "caption-fixture", "name": "Caption fixture", "source_kind": "file",
        "source_url": null, "asset_id": "fixture-source", "thumbnail_id": null,
        "duration_ms": 10000, "width": 1920, "height": 1080, "has_audio": true,
        "language": "en", "created_at": 1,
        "words": [{"id": "word", "text": "Hello", "start_ms": 0, "end_ms": 1000,
            "emphasis": false, "color": null}]
    }))
    .unwrap()
}

fn clip(project: &Project) -> Clip {
    Clip {
        id: "caption-clip".into(),
        project_id: project.id.clone(),
        name: "Caption clip".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document: EditDocument::new(project, 0, 5000),
        created_at: 1,
    }
}

#[tokio::test]
async fn saved_styles_survive_reopening_and_deletion_preserves_clip_styling() {
    let directory = tempfile::tempdir().unwrap();
    let pool = db::connect(directory.path()).await.unwrap();
    let project = project();
    let mut clip = clip(&project);
    db::save_project(&pool, &project).await.unwrap();
    db::insert_clip(&pool, &clip).await.unwrap();
    let mut style = CaptionStyle {
        preset: "reveal".into(),
        highlight_color: "#AAEEFF".into(),
        ..CaptionStyle::default()
    };
    let preset = caption_presets::save(
        &pool,
        caption_presets::SaveCaptionPreset {
            name: "My interview style".into(),
            style: style.clone(),
        },
    )
    .await
    .unwrap();
    clip.document.captions = preset.style.clone();
    clip.revision += 1;
    db::update_clip(&pool, &clip, 1).await.unwrap();
    pool.close().await;
    let pool = db::connect(directory.path()).await.unwrap();
    let restored = caption_presets::list(&pool).await.unwrap();
    assert_eq!(
        restored
            .iter()
            .filter(|preset| !preset.user_created)
            .count(),
        18
    );
    assert_eq!(
        restored.last().unwrap().name.as_deref(),
        Some("My interview style")
    );
    caption_presets::remove(&pool, &preset.id).await.unwrap();
    let restored_clip = db::clip(&pool, &clip.id).await.unwrap();
    assert_eq!(restored_clip.document.captions.highlight_color, "#AAEEFF");
    assert_eq!(restored_clip.document.captions.preset, "reveal");
    assert!(caption_presets::remove(&pool, "studio").await.is_err());
    style.font = "Unregistered font".into();
    assert!(
        caption_presets::save(
            &pool,
            caption_presets::SaveCaptionPreset {
                name: "Invalid style".into(),
                style,
            }
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn older_rating_retries_cannot_replace_newer_ratings_or_modify_an_edit() {
    let directory = tempfile::tempdir().unwrap();
    let pool = db::connect(directory.path()).await.unwrap();
    let project = project();
    let mut clip = clip(&project);
    db::save_project(&pool, &project).await.unwrap();
    db::insert_clip(&pool, &clip).await.unwrap();
    clip.document.words[0].text = "Updated".into();
    clip.revision = 2;
    db::update_clip(&pool, &clip, 1).await.unwrap();
    let old = clip_rating::ClipRating {
        clip_id: clip.id.clone(),
        revision: 1,
        score: 40,
        summary: "Old revision fixture".into(),
        dimensions: Vec::new(),
        suggestions: Vec::new(),
        model: "fixture".into(),
        created_at: 1,
    };
    let newer = clip_rating::ClipRating {
        revision: 2,
        score: 80,
        summary: "Newer revision fixture".into(),
        created_at: 2,
        ..old.clone()
    };
    let (first, second) = tokio::join!(
        clip_rating::save(&pool, &old),
        clip_rating::save(&pool, &newer)
    );
    first.unwrap();
    second.unwrap();
    clip_rating::save(&pool, &old).await.unwrap();
    assert_eq!(
        clip_rating::get(&pool, &clip.id)
            .await
            .unwrap()
            .unwrap()
            .revision,
        2
    );
    let restored_clip = db::clip(&pool, &clip.id).await.unwrap();
    assert_eq!(restored_clip.revision, 2);
    assert_eq!(restored_clip.document.words[0].text, "Updated");
    sqlx::query("DELETE FROM clips WHERE id = ?")
        .bind(&clip.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(clip_rating::get(&pool, &clip.id).await.unwrap().is_none());
}

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use unlimitedclipper_engine::{api, db, models::*, state::AppState, subtitles};

fn project() -> Project {
    serde_json::from_value(json!({
        "id":"fixture", "name":"Fixture", "source_kind":"file", "source_url":null,
        "asset_id":"source", "thumbnail_id":null, "duration_ms":10_000,
        "width":1920, "height":1080, "has_audio":true, "language":"en", "created_at":1,
        "words":[{"id":"one","text":"Hello","start_ms":3000,"end_ms":3500,"emphasis":false,"color":null}]
    })).unwrap()
}

#[tokio::test]
async fn stale_edit_cannot_overwrite_a_new_revision() {
    let root = tempfile::tempdir().unwrap();
    let pool = db::connect(root.path()).await.unwrap();
    let project = project();
    db::save_project(&pool, &project).await.unwrap();
    let mut clip = Clip {
        id: "clip".into(),
        project_id: project.id.clone(),
        name: "First".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document: EditDocument::new(&project, 2000, 5000),
        created_at: 1,
    };
    db::insert_clip(&pool, &clip).await.unwrap();
    clip.revision = 2;
    clip.name = "Saved revision".into();
    db::update_clip(&pool, &clip, 1).await.unwrap();
    clip.name = "Stale edit".into();
    let error = db::update_clip(&pool, &clip, 1).await.unwrap_err();
    assert_eq!(error.status, StatusCode::CONFLICT);
    assert_eq!(
        db::clip(&pool, "clip").await.unwrap().name,
        "Saved revision"
    );
}

#[tokio::test]
async fn asset_registration_is_idempotent_and_cleanup_preserves_shared_images() {
    let root = tempfile::tempdir().unwrap();
    let pool = db::connect(root.path()).await.unwrap();
    tokio::fs::write(root.path().join("image.png"), b"fixture")
        .await
        .unwrap();
    let first = db::register_asset(&pool, "image.png", "image.png", "image")
        .await
        .unwrap();
    let second = db::register_asset(&pool, "image.png", "image.png", "image")
        .await
        .unwrap();
    assert_eq!(first, second);
    let project = project();
    db::save_project(&pool, &project).await.unwrap();
    let mut document = EditDocument::new(&project, 2000, 5000);
    document.watermark.asset_id = Some(first.clone());
    let clip = Clip {
        id: "clip".into(),
        project_id: project.id,
        name: "Fixture".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document,
        created_at: 1,
    };
    db::insert_clip(&pool, &clip).await.unwrap();
    db::remove_unused_assets(&pool, root.path(), vec![first.clone()])
        .await
        .unwrap();
    assert!(root.path().join("image.png").exists());
    sqlx::query("DELETE FROM clips")
        .execute(&pool)
        .await
        .unwrap();
    db::remove_unused_assets(&pool, root.path(), vec![first])
        .await
        .unwrap();
    assert!(!root.path().join("image.png").exists());
}

#[tokio::test]
async fn other_local_services_cannot_bootstrap_or_mutate_the_studio() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let token = state.bootstrap.lock().await.clone().unwrap();
    let router = api::router(state);
    let request = Request::builder()
        .method("POST")
        .uri("/api/v1/session")
        .header("origin", "http://127.0.0.1:9000")
        .header("content-type", "application/json")
        .body(Body::from(json!({"token":token}).to_string()))
        .unwrap();
    assert_eq!(
        router.oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[test]
fn caption_exports_preserve_clip_time_and_browser_tracks_preserve_source_time() {
    let project = project();
    let document = EditDocument::new(&project, 2000, 5000);
    assert_eq!(document.words[0].start_ms, 1000);
    assert!(subtitles::srt(&document).contains("00:00:01,000"));
    assert!(subtitles::vtt(&document).contains("00:00:03.000"));
    let mut invalid = document;
    invalid.end_ms = 2500;
    assert!(invalid.validate(project.duration_ms).is_err());
}

#[tokio::test]
async fn a_second_engine_cannot_own_the_same_database() {
    let root = tempfile::tempdir().unwrap();
    let _first = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let second = AppState::new(root.path().to_path_buf(), root.path().join("tools")).await;
    assert!(second.is_err());
}

#[tokio::test]
async fn old_active_jobs_still_block_updates_after_two_hundred_completed_jobs() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let active = state
        .enqueue("export", None, None, json!({}))
        .await
        .unwrap();
    for index in 0..205 {
        let mut completed = active.clone();
        completed.id = format!("history-{index}");
        completed.created_at += index + 1;
        completed.status = "completed".into();
        db::save_job(&state.db, &completed).await.unwrap();
    }
    assert!(
        !db::jobs(&state.db)
            .await
            .unwrap()
            .iter()
            .any(|job| job.id == active.id)
    );
    assert_eq!(db::active_jobs(&state.db).await.unwrap().len(), 1);
    assert!(!state.idle().await.unwrap());
}

#[tokio::test]
async fn interrupted_uploads_are_removed_only_after_acquiring_the_instance_lock() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let interrupted = root.path().join("sources/interrupted.upload");
    tokio::fs::write(&interrupted, b"partial").await.unwrap();
    let second = AppState::new(root.path().to_path_buf(), root.path().join("tools")).await;
    assert!(second.is_err());
    assert!(interrupted.exists());
    state.db.close().await;
    drop(state);
    let _restarted = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    assert!(!interrupted.exists());
}

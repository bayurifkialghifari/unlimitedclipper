use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;
use unlimitedclipper_engine::{api, db, models::*, state::AppState, subtitles};

#[test]
fn native_configuration_uses_its_own_library_resources_and_session_origin() {
    let workspace = tempfile::tempdir().unwrap();
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let data = workspace.path().join("private-data");
        let resources = workspace.path().join("resources");
        let studio = resources.join("studio");
        tokio::fs::create_dir_all(&studio).await.unwrap();
        tokio::fs::write(studio.join("index.html"), "Native host fixture")
            .await
            .unwrap();
        let engine =
            unlimitedclipper_engine::start_with_config(unlimitedclipper_engine::EngineConfig {
                data_dir: data.clone(),
                tools_dir: resources.join("tools"),
                studio_dir: studio,
                port: 0,
            })
            .await
            .unwrap();
        let origin = format!("http://127.0.0.1:{}", engine.port);
        let client = reqwest::Client::new();
        assert_ne!(engine.port, 0);
        assert_eq!(engine.state.root, data);
        assert_eq!(engine.state.tools_root(), resources.join("tools"));
        for route in [
            "/projects/fixture",
            "/projects/fixture/manual",
            "/studio/fixture",
        ] {
            let response = client.get(format!("{origin}{route}")).send().await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.text().await.unwrap(), "Native host fixture");
        }
        assert_eq!(
            client
                .get(&origin)
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap(),
            "Native host fixture"
        );
        let token = engine
            .studio_url()
            .split("#session=")
            .nth(1)
            .unwrap()
            .to_string();
        let denied = client
            .post(format!("{origin}/api/v1/session"))
            .header("origin", "http://127.0.0.1:9000")
            .json(&json!({ "token": token }))
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let session = client
            .post(format!("{origin}/api/v1/session"))
            .header("origin", &origin)
            .json(&json!({ "token": token }))
            .send()
            .await
            .unwrap();
        assert_eq!(session.status(), StatusCode::OK);
        let cookie = session.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        let projects = client
            .get(format!("{origin}/api/v1/projects"))
            .header("cookie", cookie)
            .header("origin", &origin)
            .send()
            .await
            .unwrap();
        assert_eq!(projects.status(), StatusCode::OK);
        assert_eq!(
            projects.json::<serde_json::Value>().await.unwrap(),
            json!([])
        );
    });
    drop(runtime);
}

fn project() -> Project {
    serde_json::from_value(json!({
        "id":"fixture", "name":"Fixture", "source_kind":"file", "source_url":null,
        "asset_id":"source", "thumbnail_id":null, "duration_ms":10_000,
        "width":1920, "height":1080, "has_audio":true, "language":"en", "created_at":1,
        "words":[{"id":"one","text":"Hello","start_ms":3000,"end_ms":3500,"emphasis":false,"color":null}]
    })).unwrap()
}

#[test]
fn timeline_remapping_preserves_manual_words_and_audio_source_offsets() {
    let mut document = EditDocument::new(&project(), 2000, 8000);
    document.words[0].timing = Some(WordTiming {
        provenance: "manual".into(),
        source_start_ms: 3000,
        source_end_ms: 3500,
        alignment_confidence: None,
    });
    document.audio_layers.push(AudioLayer {
        id: "music".into(),
        enabled: true,
        start_ms: 500,
        end_ms: 5000,
        asset_id: Some("managed-audio".into()),
        source_start_ms: 100,
        gain: 0.1,
    });
    let result = document.replace_segments(vec![
        SourceSegment {
            id: None,
            start_ms: 2000,
            end_ms: 4000,
        },
        SourceSegment {
            id: None,
            start_ms: 6000,
            end_ms: 8000,
        },
    ]);
    assert!(result.validate(10000).is_ok());
    assert_eq!(result.duration_ms(), 4000);
    assert_eq!(
        result.words[0].timing.as_ref().unwrap().provenance,
        "manual"
    );
    assert_eq!(result.audio_layers.len(), 2);
    assert_eq!(
        (
            result.audio_layers[0].start_ms,
            result.audio_layers[0].end_ms
        ),
        (500, 2000)
    );
    assert_eq!(
        (
            result.audio_layers[1].start_ms,
            result.audio_layers[1].end_ms
        ),
        (2000, 3000)
    );
    assert_eq!(result.audio_layers[1].source_start_ms, 3600);
    assert_ne!(result.audio_layers[0].id, result.audio_layers[1].id);
}

#[test]
fn legacy_edits_and_invalid_word_provenance_have_explicit_boundaries() {
    let mut document = EditDocument::new(&project(), 2000, 5000);
    document.version = 1;
    document.segments.clear();
    let legacy: EditDocument =
        serde_json::from_value(serde_json::to_value(&document).unwrap()).unwrap();
    assert_eq!(legacy.output_to_source(1000), Some(3000));
    assert!(legacy.validate(10000).is_ok());
    document.words[0].timing = Some(WordTiming {
        provenance: "invented".into(),
        source_start_ms: 3000,
        source_end_ms: 3500,
        alignment_confidence: None,
    });
    assert!(document.validate(10000).is_err());
}

#[test]
fn captions_keep_phrases_visible_but_never_group_across_a_cut() {
    let mut document = EditDocument::new(&project(), 0, 4000);
    document.segments = vec![
        SourceSegment {
            id: None,
            start_ms: 0,
            end_ms: 1000,
        },
        SourceSegment {
            id: None,
            start_ms: 3000,
            end_ms: 4000,
        },
    ];
    document.words = serde_json::from_value(json!([
        {"id":"a", "text":"First", "start_ms":100, "end_ms":200},
        {"id":"b", "text":"phrase", "start_ms":400, "end_ms":500},
        {"id":"c", "text":"Next", "start_ms":1000, "end_ms":1200}
    ]))
    .unwrap();
    assert_eq!(subtitles::caption_groups(&document).len(), 2);
    let track = subtitles::ass(&document);
    assert!(track.contains("Dialogue: 1,0:00:00.32,0:00:00.40,Caption"));
    assert!(!subtitles::srt(&document).contains("phrase Next"));
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

#[test]
fn caption_phrases_stop_at_punctuation_and_silence() {
    let mut document = EditDocument::new(&project(), 0, 10_000);
    document.captions.words_per_line = 4;
    document.words = serde_json::from_value(json!([
        {"id":"a","text":"Dia","start_ms":1000,"end_ms":1300,"emphasis":false,"color":null},
        {"id":"b","text":"jahat!","start_ms":1300,"end_ms":1700,"emphasis":false,"color":null},
        {"id":"c","text":"Lari","start_ms":1900,"end_ms":2200,"emphasis":false,"color":null},
        {"id":"d","text":"guys","start_ms":4000,"end_ms":4300,"emphasis":false,"color":null}
    ]))
    .unwrap();
    let groups = subtitles::caption_groups(&document);
    assert_eq!(
        groups.iter().map(|group| group.len()).collect::<Vec<_>>(),
        [2, 1, 1]
    );
    let srt = subtitles::srt(&document);
    assert!(srt.contains("00:00:01,000 --> 00:00:01,700\nDia jahat!"));
    let ass = subtitles::ass(&document);
    assert!(!ass.contains("0:00:02.20,0:00:04.00"));
    assert!(ass.contains("0:00:01.90,0:00:02.20"));
    document.captions.preset = "box".into();
    let ass = subtitles::ass(&document);
    assert!(ass.contains("Dia") && ass.contains("jahat!"));
    assert!(ass.contains("\\3a&H00&") && ass.contains("\\3a&HFF&"));
    document.words[0].color = Some("#0099FF".into());
    let ass = subtitles::ass(&document);
    assert!(ass.contains("\\bord8\\1c&HFF9900&}Dia"));
}

#[tokio::test]
async fn caption_recovery_reuses_recognition_and_does_not_apply_twice() {
    use unlimitedclipper_engine::pipeline;
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let project = project();
    db::save_project(&state.db, &project).await.unwrap();
    let clip = Clip {
        id: "clip".into(),
        project_id: project.id.clone(),
        name: "Recovered".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document: EditDocument::new(&project, 2000, 5000),
        created_at: 1,
    };
    db::insert_clip(&state.db, &clip).await.unwrap();
    let mut job = state
        .enqueue(
            "captions",
            Some(project.id.clone()),
            Some(clip.id.clone()),
            json!({"revision":1,"speech_model":"whisper-medium","language":"en"}),
        )
        .await
        .unwrap();
    let directory = root.path().join("temporary").join(&job.id);
    tokio::fs::create_dir_all(&directory).await.unwrap();
    tokio::fs::write(
        directory.join("captions-0-7000.json"),
        json!({"transcription":[{
            "text":" Hello!", "offsets":{"from":3000,"to":3500},
            "tokens":[{"text":" Hello!","t_dtw":300,"p":0.9,"offsets":{"to":3500}}]
        }]})
        .to_string(),
    )
    .await
    .unwrap();
    let cancellation = tokio_util::sync::CancellationToken::new();
    pipeline::refine_captions(&state, &mut job, &cancellation)
        .await
        .unwrap();
    let saved = db::clip(&state.db, "clip").await.unwrap();
    assert_eq!(saved.revision, 2);
    assert_eq!(saved.document.words[0].start_ms, 1000);
    assert_eq!(saved.document.words[0].text, "Hello!");
    assert_eq!(
        db::project(&state.db, "fixture").await.unwrap().words[0].text,
        "Hello"
    );
    pipeline::refine_captions(&state, &mut job, &cancellation)
        .await
        .unwrap();
    assert_eq!(db::clip(&state.db, "clip").await.unwrap().revision, 2);
    let mut edited = saved;
    edited.revision = 3;
    edited.document.words[0].text = "Manual correction".into();
    db::update_clip(&state.db, &edited, 2).await.unwrap();
    assert!(
        pipeline::refine_captions(&state, &mut job, &cancellation)
            .await
            .is_err()
    );
    assert_eq!(
        db::clip(&state.db, "clip").await.unwrap().document.words[0].text,
        "Manual correction"
    );
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
async fn tracking_commit_marker_is_atomic_with_the_optimistic_edit() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let project = project();
    db::save_project(&state.db, &project).await.unwrap();
    let mut clip = Clip {
        id: "tracked-clip".into(),
        project_id: project.id.clone(),
        name: "Framing recovery".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document: EditDocument::new(&project, 0, 8000),
        created_at: 1,
    };
    db::insert_clip(&state.db, &clip).await.unwrap();
    let mut job = state
        .enqueue(
            "track",
            Some(project.id),
            Some(clip.id.clone()),
            json!({"revision": 1}),
        )
        .await
        .unwrap();
    clip.revision = 2;
    clip.document.crop.x = 0.234567891234;
    db::commit_tracking(&state.db, &clip, 1, &mut job)
        .await
        .unwrap();
    assert_eq!(db::clip(&state.db, &clip.id).await.unwrap().revision, 2);
    assert_eq!(
        db::job(&state.db, &job.id).await.unwrap().payload["tracking_committed_revision"],
        2
    );

    let mut stale = state
        .enqueue("track", None, Some(clip.id.clone()), json!({"revision": 1}))
        .await
        .unwrap();
    clip.revision = 3;
    assert!(
        db::commit_tracking(&state.db, &clip, 1, &mut stale)
            .await
            .is_err()
    );
    assert!(stale.payload["tracking_committed_revision"].is_null());
    assert!(
        db::job(&state.db, &stale.id).await.unwrap().payload["tracking_committed_revision"]
            .is_null()
    );

    sqlx::query("DELETE FROM jobs WHERE id = ?")
        .bind(&stale.id)
        .execute(&state.db)
        .await
        .unwrap();
    assert!(
        db::commit_tracking(&state.db, &clip, 2, &mut stale)
            .await
            .is_err()
    );
    assert_eq!(db::clip(&state.db, &clip.id).await.unwrap().revision, 2);
    assert!(stale.payload["tracking_committed_revision"].is_null());
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
async fn auto_edit_proposal_remains_available_beyond_recent_job_history() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let proposal = Job {
        id: "motion-proposal".into(),
        project_id: Some("project".into()),
        clip_id: Some("clip".into()),
        kind: "auto_edit".into(),
        status: "completed".into(),
        stage: "review".into(),
        progress: 1.0,
        message: "Ready for review".into(),
        error: None,
        payload: json!({"base_revision": 2, "motion_review": {"anchors": 4}}),
        created_at: 1000,
        updated_at: 1000,
    };
    db::save_job(&state.db, &proposal).await.unwrap();
    for index in 0..205 {
        let mut unrelated = proposal.clone();
        unrelated.id = format!("unrelated-{index}");
        unrelated.kind = "export".into();
        unrelated.clip_id = Some("other-clip".into());
        unrelated.created_at = 1001 + index;
        db::save_job(&state.db, &unrelated).await.unwrap();
    }
    assert!(
        !db::jobs(&state.db)
            .await
            .unwrap()
            .iter()
            .any(|job| job.id == proposal.id)
    );
    let saved = db::latest_auto_edit_job(&state.db, "project", "clip")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(saved.id, proposal.id);
    assert_eq!(saved.payload["motion_review"]["anchors"], 4);
}

#[tokio::test]
async fn interrupted_uploads_are_removed_only_after_acquiring_the_instance_lock() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    let interrupted = root.path().join("sources/interrupted.upload");
    tokio::fs::write(&interrupted, b"partial").await.unwrap();
    let stale_key = root
        .path()
        .join("temporary")
        .join(format!("{}-inference.key", uuid::Uuid::new_v4()));
    tokio::fs::write(&stale_key, b"controlled abandoned session")
        .await
        .unwrap();
    let second = AppState::new(root.path().to_path_buf(), root.path().join("tools")).await;
    assert!(second.is_err());
    assert!(interrupted.exists());
    assert!(stale_key.exists());
    state.db.close().await;
    drop(state);
    let _restarted = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    assert!(!interrupted.exists());
    assert!(!stale_key.exists());
}

#[tokio::test]
async fn concurrent_clip_edit_requests_admit_only_one_job() {
    let root = tempfile::tempdir().unwrap();
    let mut state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    state.development = true;
    let project = project();
    db::save_project(&state.db, &project).await.unwrap();
    let clip = Clip {
        id: "clip".into(),
        project_id: project.id.clone(),
        name: "Fixture".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document: EditDocument::new(&project, 2000, 5000),
        created_at: 1,
    };
    db::insert_clip(&state.db, &clip).await.unwrap();
    let router = api::router(state.clone());
    let request = |kind| {
        Request::builder()
            .method("POST")
            .uri(format!("/api/v1/clips/clip/{kind}"))
            .body(Body::empty())
            .unwrap()
    };
    let (first, second) = tokio::join!(
        router.clone().oneshot(request("title")),
        router.oneshot(request("track"))
    );
    let mut statuses = [first.unwrap().status(), second.unwrap().status()];
    statuses.sort();
    assert_eq!(statuses, [StatusCode::OK, StatusCode::BAD_REQUEST]);
    assert_eq!(db::active_jobs(&state.db).await.unwrap().len(), 1);
}

#[tokio::test]
async fn hook_proposals_require_the_current_revision_and_freeze_the_clip() {
    let root = tempfile::tempdir().unwrap();
    let mut state = AppState::new(root.path().to_path_buf(), root.path().join("tools"))
        .await
        .unwrap();
    state.development = true;
    let project = project();
    db::save_project(&state.db, &project).await.unwrap();
    let clip = Clip {
        id: "hook-clip".into(),
        project_id: project.id.clone(),
        name: "Hook fixture".into(),
        explanation: String::new(),
        score: None,
        revision: 3,
        document: EditDocument::new(&project, 2000, 5000),
        created_at: 1,
    };
    db::insert_clip(&state.db, &clip).await.unwrap();
    let router = api::router(state.clone());
    let request = |revision| {
        Request::builder()
            .method("POST")
            .uri("/api/v1/clips/hook-clip/hook-proposals")
            .header("content-type", "application/json")
            .body(Body::from(json!({"revision": revision}).to_string()))
            .unwrap()
    };
    assert_eq!(
        router.clone().oneshot(request(2)).await.unwrap().status(),
        StatusCode::CONFLICT
    );
    assert!(db::active_jobs(&state.db).await.unwrap().is_empty());
    assert_eq!(
        router.oneshot(request(3)).await.unwrap().status(),
        StatusCode::OK
    );
    let jobs = db::active_jobs(&state.db).await.unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].kind, "hook_proposals");
    assert_eq!(jobs[0].payload["snapshot"]["revision"], json!(3));
    assert_eq!(jobs[0].payload["snapshot"]["id"], json!("hook-clip"));
}

use std::path::PathBuf;
use std::process::Command;
use tokio_util::sync::CancellationToken;
use unlimitedclipper_engine::{broll, db, models::*, render, state::AppState, tools, waveform};

fn media_tools() -> Option<PathBuf> {
    let root = std::env::var_os("UC_TOOLS_DIR").map(PathBuf::from)?;
    let executable = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    root.join("ffmpeg")
        .join(executable)
        .is_file()
        .then_some(root)
}

#[tokio::test]
async fn imported_broll_filters_transitions_and_asset_waveforms_use_real_media() {
    let Some(tools_root) = media_tools() else {
        eprintln!("Skipping real-media test: UC_TOOLS_DIR has no FFmpeg.");
        return;
    };
    let temporary = tempfile::tempdir().unwrap();
    let state = AppState::new(temporary.path().join("data"), tools_root)
        .await
        .unwrap();
    let source = state.root.join("sources/source.mp4");
    let ffmpeg = tools::executable(&state, "ffmpeg", "ffmpeg").unwrap();
    let status = Command::new(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=16000",
            "-t",
            "2.4",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-pix_fmt",
            "yuv420p",
            source.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(status.success());
    let cancellation = CancellationToken::new();
    let source_probe = tools::probe(&state, &source, &cancellation).await.unwrap();
    assert!(source_probe.has_audio);
    assert!(source_probe.duration_ms >= 2400);
    let source_id = db::register_asset(&state.db, "sources/source.mp4", "Source", "video")
        .await
        .unwrap();
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Media fixture".into(),
        source_kind: "file".into(),
        source_url: None,
        asset_id: source_id.clone(),
        preview_asset_id: None,
        thumbnail_id: None,
        duration_ms: source_probe.duration_ms,
        width: source_probe.width,
        height: source_probe.height,
        has_audio: true,
        language: None,
        transcript_configuration: None,
        created_at: now_ms(),
        words: Vec::new(),
    };
    db::save_project(&state.db, &project).await.unwrap();

    let broll_directory = state.root.join("broll").join(&project.id);
    tokio::fs::create_dir_all(&broll_directory).await.unwrap();
    let broll_path = broll_directory.join("local.mp4");
    tokio::fs::copy(&source, &broll_path).await.unwrap();
    let relative = format!("broll/{}/local.mp4", project.id);
    let mut import_job = state
        .enqueue(
            "broll_import",
            Some(project.id.clone()),
            None,
            serde_json::json!({"relative_path": relative, "name": "Local B-roll"}),
        )
        .await
        .unwrap();
    broll::import(&state, &mut import_job, &cancellation)
        .await
        .unwrap();
    let assets = broll::list(&state, &project.id).await.unwrap();
    assert_eq!(assets.len(), 2);
    let roll = &assets[1];
    let preview_id = roll.preview_asset_id.as_ref().unwrap();
    let (preview, _, _) = db::asset(&state.db, &state.root, preview_id).await.unwrap();
    assert!(preview.is_file());
    let preview_probe = tools::probe(&state, &preview, &cancellation).await.unwrap();
    assert_eq!(preview_probe.width, 320);

    let mut waveform_job = state
        .enqueue(
            "asset_waveform",
            None,
            None,
            serde_json::json!({"asset_id": source_id}),
        )
        .await
        .unwrap();
    waveform::generate_asset(&state, &mut waveform_job, &cancellation)
        .await
        .unwrap();
    let peaks = waveform::request_asset_peaks(&state, &project.asset_id)
        .await
        .unwrap();
    assert_eq!(serde_json::to_value(&peaks).unwrap()["status"], "ready");
    assert!(peaks.peaks.iter().any(|value| *value > 0));

    let mut document = EditDocument::new(&project, 0, 2400).replace_segments(vec![
        SourceSegment {
            id: Some("first".into()),
            start_ms: 0,
            end_ms: 1200,
        },
        SourceSegment {
            id: Some("second".into()),
            start_ms: 1200,
            end_ms: 2400,
        },
    ]);
    document.version = 5;
    document.layout = Layout::Landscape;
    document.resolution = 720;
    document.filter_layers.push(FilterLayer {
        id: "warm".into(),
        start_ms: 300,
        end_ms: 1500,
        adjustments: VideoAdjustments {
            brightness: 5,
            contrast: 12,
            saturation: 10,
            warmth: 20,
        },
    });
    document.scene_transitions.push(SceneTransition {
        incoming_scene_id: "second".into(),
        kind: "dip_black".into(),
        duration_ms: 200,
    });
    document.visual_layers.push(VisualLayer {
        id: "cutaway".into(),
        motion: Vec::new(),
        enabled: true,
        start_ms: 100,
        end_ms: 800,
        kind: "broll".into(),
        text: String::new(),
        crop: None,
        secondary_crop: None,
        x: 0.5,
        y: 0.5,
        color: "#FFFFFF".into(),
        size: 60,
        asset_id: Some(roll.asset_id.clone()),
        source_start_ms: 0,
    });
    document.validate(project.duration_ms).unwrap();
    let clip = Clip {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project.id.clone(),
        name: "Edited fixture".into(),
        explanation: String::new(),
        score: None,
        revision: 1,
        document,
        created_at: now_ms(),
    };
    db::insert_clip(&state.db, &clip).await.unwrap();
    let mut render_job = state
        .enqueue(
            "preview",
            Some(project.id.clone()),
            Some(clip.id.clone()),
            serde_json::json!({}),
        )
        .await
        .unwrap();
    let output = state.root.join("temporary/rendered.mp4");
    render::render_media(
        &state,
        &mut render_job,
        &clip,
        &output,
        false,
        &cancellation,
    )
    .await
    .unwrap();
    let output_probe = tools::probe(&state, &output, &cancellation).await.unwrap();
    assert!((output_probe.duration_ms - 2400).abs() <= 100);

    for mut job in [import_job, waveform_job, render_job] {
        job.status = "completed".into();
        db::save_job(&state.db, &job).await.unwrap();
    }

    let remaining = vec![
        roll.asset_id.clone(),
        preview_id.clone(),
        roll.thumbnail_id.clone().unwrap(),
    ];
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&project.id)
        .execute(&state.db)
        .await
        .unwrap();
    db::remove_unused_assets(&state.db, &state.root, remaining.clone())
        .await
        .unwrap();
    for asset_id in remaining {
        assert!(db::asset(&state.db, &state.root, &asset_id).await.is_err());
    }
}

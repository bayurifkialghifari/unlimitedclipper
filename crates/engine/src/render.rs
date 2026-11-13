use crate::{db, models::*, state::AppState, subtitles, tools};
use anyhow::{Context, Result};
use tokio_util::sync::CancellationToken;

fn crop_filter(rect: &CropRect, width: u32, height: u32, x: &str, y: &str) -> String {
    let crop_width = ((rect.width * width as f64).floor() as u32 / 2 * 2).max(2);
    let crop_height = ((rect.height * height as f64).floor() as u32 / 2 * 2).max(2);
    format!("crop={crop_width}:{crop_height}:x='{x}':y='{y}'")
}

fn keyframe_expression(document: &EditDocument, axis: char, dimension: u32) -> String {
    let origin = if axis == 'x' {
        document.crop.x
    } else {
        document.crop.y
    };
    let coordinate = |key: &Keyframe| if axis == 'x' { key.x } else { key.y };
    let mut points = vec![Keyframe {
        time_ms: 0,
        x: document.crop.x,
        y: document.crop.y,
    }];
    for key in &document.keyframes {
        if key.time_ms == 0 {
            points[0] = key.clone();
        } else {
            points.push(key.clone());
        }
    }
    if points.len() == 1 {
        return format!("{:.4}", coordinate(&points[0]) * dimension as f64);
    }
    let mut expression = format!(
        "{:.4}",
        coordinate(points.last().expect("Points exist")) * dimension as f64
    );
    for pair in points.windows(2).rev() {
        let start = pair[0].time_ms as f64 / 1000.0;
        let end = pair[1].time_ms as f64 / 1000.0;
        let from = coordinate(&pair[0]) * dimension as f64;
        let to = coordinate(&pair[1]) * dimension as f64;
        expression = format!(
            "if(lt(t,{end:.4}),{from:.4}+({to:.4}-{from:.4})*max(0,t-{start:.4})/({end:.4}-{start:.4}),{expression})"
        );
    }
    let _ = origin;
    expression
}

fn escape_filter_path(path: &std::path::Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

pub fn composition(document: &EditDocument, source_width: u32, source_height: u32) -> String {
    let (width, height) = document.layout.dimensions(document.resolution);
    match document.layout {
        Layout::Gaming => {
            let top = ((height as f64 * document.split_ratio).round() as u32 / 2 * 2).max(2);
            let bottom = height - top;
            let face = &document.facecam_crop;
            let game = &document.gameplay_crop;
            format!(
                "[0:v]setpts=PTS-STARTPTS,split=2[facein][gamein];[facein]{},scale={width}:{top}:force_original_aspect_ratio=increase,crop={width}:{top}[face];[gamein]{},scale={width}:{bottom}:force_original_aspect_ratio=increase,crop={width}:{bottom}[game];[face][game]vstack=inputs=2[composed]",
                crop_filter(
                    face,
                    source_width,
                    source_height,
                    &format!("{}", face.x * source_width as f64),
                    &format!("{}", face.y * source_height as f64)
                ),
                crop_filter(
                    game,
                    source_width,
                    source_height,
                    &format!("{}", game.x * source_width as f64),
                    &format!("{}", game.y * source_height as f64)
                )
            )
        }
        Layout::Blur => format!(
            "[0:v]setpts=PTS-STARTPTS,split=2[background][foreground];[background]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},gblur=sigma=24[blurred];[foreground]scale={width}:{height}:force_original_aspect_ratio=decrease[fit];[blurred][fit]overlay=(W-w)/2:(H-h)/2[composed]"
        ),
        Layout::Contain => format!(
            "[0:v]setpts=PTS-STARTPTS,scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black[composed]"
        ),
        _ => {
            let x = keyframe_expression(document, 'x', source_width);
            let y = keyframe_expression(document, 'y', source_height);
            format!(
                "[0:v]setpts=PTS-STARTPTS,{},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}[composed]",
                crop_filter(&document.crop, source_width, source_height, &x, &y)
            )
        }
    }
}

pub async fn export_clip(
    state: &AppState,
    job: &mut Job,
    clip: &Clip,
    cancellation: &CancellationToken,
) -> Result<Export> {
    let identity = format!("{}:{}:{}", job.id, clip.id, clip.revision);
    let id = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, identity.as_bytes()).to_string();
    if let Some(export) = db::exports(&state.db)
        .await?
        .into_iter()
        .find(|export| export.id == id)
    {
        let asset = db::asset(&state.db, &state.root, &export.asset_id).await;
        if asset.is_ok() {
            return Ok(export);
        }
        sqlx::query("DELETE FROM exports WHERE id = ?")
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    let project = db::project(&state.db, &clip.project_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    clip.document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id)
        .await
        .map_err(|error| anyhow::anyhow!(error.message))?;
    let working = state.root.join("temporary").join(&job.id);
    tokio::fs::create_dir_all(&working).await?;
    let ass_file = working.join("track.ass");
    tokio::fs::write(&ass_file, subtitles::ass(&clip.document)).await?;
    let temporary = state.root.join("exports").join(format!("{id}.part.mp4"));
    let final_path = state.root.join("exports").join(format!("{id}.mp4"));
    let document = &clip.document;
    let duration = document.end_ms - document.start_ms;
    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", document.start_ms as f64 / 1000.0),
        "-i".into(),
        source.to_string_lossy().into_owned(),
    ];
    let mut filter = composition(document, project.width, project.height);
    let mut subtitle_input = "composed";
    if document.watermark.mode == "image" {
        let asset_id = document
            .watermark
            .asset_id
            .as_ref()
            .context("Choose a watermark image before exporting")?;
        let (image, _, kind) = db::asset(&state.db, &state.root, asset_id)
            .await
            .map_err(|error| anyhow::anyhow!(error.message))?;
        anyhow::ensure!(kind == "image", "Watermark must reference an image asset.");
        args.extend([
            "-loop".into(),
            "1".into(),
            "-i".into(),
            image.to_string_lossy().into_owned(),
        ]);
        let (width, _) = document.layout.dimensions(document.resolution);
        let watermark_width = (width as f64 * document.watermark.scale).round() as u32;
        filter.push_str(&format!(";[1:v]format=rgba,scale={watermark_width}:-1,colorchannelmixer=aa={}[mark];[composed][mark]overlay=x=(W-w)*{}:y=(H-h)*{}[branded]",
            document.watermark.opacity, document.watermark.x, document.watermark.y));
        subtitle_input = "branded";
    }
    filter.push_str(&format!(
        ";[{subtitle_input}]subtitles=filename='{}':fontsdir='{}',setsar=1[out]",
        escape_filter_path(&ass_file),
        escape_filter_path(&state.tools_root().join("fonts"))
    ));
    args.extend([
        "-filter_complex".into(),
        filter,
        "-map".into(),
        "[out]".into(),
        "-map".into(),
        "0:a?".into(),
        "-t".into(),
        format!("{:.3}", duration as f64 / 1000.0),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "fast".into(),
        "-crf".into(),
        "20".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-r".into(),
        "30".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        "-af".into(),
        "asetpts=PTS-STARTPTS".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        temporary.to_string_lossy().into_owned(),
    ]);
    tools::ffmpeg_progress(state, job, &args, duration, cancellation).await?;
    let probe = tools::probe(state, &temporary, cancellation).await?;
    anyhow::ensure!(
        (probe.duration_ms - duration).abs() <= 150,
        "Export duration failed verification."
    );
    tokio::fs::rename(&temporary, &final_path).await?;
    let srt_path = format!("exports/{id}.srt");
    let ass_path = format!("exports/{id}.ass");
    tokio::fs::write(state.root.join(&srt_path), subtitles::srt(document)).await?;
    tokio::fs::write(state.root.join(&ass_path), subtitles::ass(document)).await?;
    let name = format!(
        "{}.mp4",
        clip.name
            .chars()
            .filter(|character| !['/', '\\', ':', '*', '?', '"', '<', '>', '|'].contains(character))
            .collect::<String>()
    );
    let export = Export {
        id: id.clone(),
        clip_id: clip.id.clone(),
        project_id: clip.project_id.clone(),
        revision: clip.revision,
        name: name.clone(),
        asset_id: db::register_asset(&state.db, &format!("exports/{id}.mp4"), &name, "video")
            .await?,
        srt_asset_id: db::register_asset(
            &state.db,
            &srt_path,
            &name.replace(".mp4", ".srt"),
            "subtitle",
        )
        .await?,
        ass_asset_id: db::register_asset(
            &state.db,
            &ass_path,
            &name.replace(".mp4", ".ass"),
            "subtitle",
        )
        .await?,
        created_at: now_ms(),
    };
    db::save_export(&state.db, &export).await?;
    Ok(export)
}

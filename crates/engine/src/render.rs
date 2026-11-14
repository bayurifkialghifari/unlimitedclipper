use crate::{db, models::*, state::AppState, subtitles, tools};
use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

pub async fn preview_job(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let mut clip: Clip = serde_json::from_value(job.payload["snapshot"].clone())?;
    clip.document.resolution = 720;
    clip.document.words.clear();
    clip.document.captions = CaptionStyle::default();
    clip.document.caption_model = None;
    let identity = hex::encode(Sha256::digest(serde_json::to_vec(&clip.document)?));
    let relative = format!("temporary/previews/{}-{identity}.mp4", clip.project_id);
    let destination = state.root.join(&relative);
    tokio::fs::create_dir_all(destination.parent().expect("Preview parent exists")).await?;
    if !destination.is_file() {
        let temporary = state
            .root
            .join("temporary")
            .join(format!("{}.preview.mp4", job.id));
        render_media(state, job, &clip, &temporary, false, cancellation).await?;
        ensure_preview_capacity(state, tokio::fs::metadata(&temporary).await?.len()).await?;
        tokio::fs::rename(&temporary, &destination).await?;
    }
    let asset = db::register_asset(&state.db, &relative, "edited-preview.mp4", "preview").await?;
    state
        .activity
        .lock()
        .await
        .insert(format!("preview:{asset}"), now_ms() + 120_000);
    job.payload["preview_asset_id"] = serde_json::json!(asset);
    job.payload["revision"] = serde_json::json!(clip.revision);
    db::save_job(&state.db, job).await?;
    Ok(())
}

async fn ensure_preview_capacity(state: &AppState, incoming: u64) -> Result<()> {
    const LIMIT: u64 = 4 * 1024 * 1024 * 1024;
    anyhow::ensure!(
        incoming <= LIMIT,
        "This preview exceeds the cache limit. Use a shorter clip."
    );
    let _gate = state.operation_gate.lock().await;
    let assets: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, relative_path FROM assets WHERE kind = 'preview' ORDER BY created_at",
    )
    .fetch_all(&state.db)
    .await?;
    let mut total = incoming;
    let mut candidates = Vec::new();
    for (id, relative) in assets {
        let size = tokio::fs::metadata(state.root.join(&relative))
            .await
            .map_or(0, |metadata| metadata.len());
        total += size;
        candidates.push((id, relative, size));
    }
    for (id, relative, size) in candidates {
        if total <= LIMIT {
            break;
        }
        let lease = state
            .activity
            .lock()
            .await
            .get(&format!("preview:{id}"))
            .copied()
            .unwrap_or(0);
        if lease > now_ms() {
            continue;
        }
        let path = state.root.join(relative);
        if path.exists() {
            let canonical = tokio::fs::canonicalize(&path).await?;
            let root = tokio::fs::canonicalize(state.root.join("temporary/previews")).await?;
            anyhow::ensure!(
                canonical.starts_with(root),
                "Preview eviction escaped its cache."
            );
            tokio::fs::remove_file(path).await?;
        }
        sqlx::query("DELETE FROM assets WHERE id = ?")
            .bind(id)
            .execute(&state.db)
            .await?;
        total -= size;
    }
    anyhow::ensure!(
        total <= LIMIT,
        "Preview cache is in use. Close other previews and retry."
    );
    Ok(())
}

fn crop_filter(rect: &CropRect, width: u32, height: u32, x: &str, y: &str) -> String {
    let crop_width = ((rect.width * width as f64).floor() as u32 / 2 * 2).max(2);
    let crop_height = ((rect.height * height as f64).floor() as u32 / 2 * 2).max(2);
    format!("crop={crop_width}:{crop_height}:x='{x}':y='{y}'")
}

fn keyframe_expression(document: &EditDocument, axis: char, dimension: u32) -> String {
    let coordinate = |key: &Keyframe| {
        if axis == 'x' { key.x } else { key.y }
    };
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
    let final_coordinate = format!(
        "{:.4}",
        coordinate(points.last().expect("Points exist")) * dimension as f64
    );
    format!(
        "if(lt(t,{:.4}),{},{final_coordinate})",
        points.last().expect("Points exist").time_ms as f64 / 1000.0,
        balanced_crop_expression(&points, axis, dimension)
    )
}

fn balanced_crop_expression(points: &[Keyframe], axis: char, dimension: u32) -> String {
    let coordinate = |key: &Keyframe| {
        if axis == 'x' { key.x } else { key.y }
    };
    let from = coordinate(&points[0]) * dimension as f64;
    if points
        .iter()
        .all(|key| coordinate(key) == coordinate(&points[0]))
    {
        return format!("{from:.4}");
    }
    if points.len() == 2 {
        let start = points[0].time_ms as f64 / 1000.0;
        let end = points[1].time_ms as f64 / 1000.0;
        let to = coordinate(&points[1]) * dimension as f64;
        return format!("{from:.4}+({to:.4}-{from:.4})*max(0,t-{start:.4})/({end:.4}-{start:.4})");
    }
    // FFmpeg limits expression nesting. A balanced tree preserves every anchor at logarithmic depth.
    let middle = points.len() / 2;
    format!(
        "if(lt(t,{:.4}),{},{})",
        points[middle].time_ms as f64 / 1000.0,
        balanced_crop_expression(&points[..=middle], axis, dimension),
        balanced_crop_expression(&points[middle..], axis, dimension)
    )
}

fn escape_filter_path(path: &std::path::Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

pub fn composition(document: &EditDocument, source_width: u32, source_height: u32) -> String {
    let (width, height) = document.layout.dimensions(document.resolution);
    composition_dimensions(document, source_width, source_height, width, height)
}

fn composition_dimensions(
    document: &EditDocument,
    source_width: u32,
    source_height: u32,
    width: u32,
    height: u32,
) -> String {
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

pub fn timeline_composition(
    document: &EditDocument,
    project: &Project,
    audio_input: usize,
) -> String {
    let mut sections = Vec::new();
    let mut offset = 0;
    for segment in document.source_segments() {
        let end = offset + segment.end_ms - segment.start_ms;
        let mut boundaries = vec![offset, end];
        for layer in document
            .visual_layers
            .iter()
            .filter(|layer| layer.enabled && ["punch_in", "split"].contains(&layer.kind.as_str()))
        {
            for time in [layer.start_ms, layer.end_ms] {
                if time > offset && time < end {
                    boundaries.push(time);
                }
            }
        }
        boundaries.sort_unstable();
        boundaries.dedup();
        for pair in boundaries.windows(2) {
            sections.push((pair[0], pair[1], segment.start_ms + pair[0] - offset));
        }
        offset = end;
    }
    let count = sections.len();
    let mut filter = format!("[0:v]split={count}");
    for index in 0..count {
        filter.push_str(&format!("[video{index}]"));
    }
    filter.push_str(&format!(";[{audio_input}:a]asplit={count}"));
    for index in 0..count {
        filter.push_str(&format!("[audio{index}]"));
    }
    for (index, &(start, end, source)) in sections.iter().enumerate() {
        let source_start = (source - document.start_ms) as f64 / 1000.0;
        let length = (end - start) as f64 / 1000.0;
        filter.push_str(&format!(
            ";[video{index}]trim=start={source_start:.3}:duration={length:.3},setpts=PTS-STARTPTS,fps=30[trimmed{index}];[audio{index}]atrim=start={source_start:.3}:duration={length:.3},asetpts=PTS-STARTPTS,apad,atrim=duration={length:.3}[sound{index}]"
        ));
        let mut section = document.clone();
        let mut points = vec![Keyframe {
            time_ms: 0,
            x: document.crop.x,
            y: document.crop.y,
        }];
        points.extend(document.keyframes.clone());
        for pair in points.windows(2) {
            if pair[0].time_ms <= start && start < pair[1].time_ms {
                let ratio = (start - pair[0].time_ms) as f64
                    / (pair[1].time_ms - pair[0].time_ms).max(1) as f64;
                section.crop.x = pair[0].x + (pair[1].x - pair[0].x) * ratio;
                section.crop.y = pair[0].y + (pair[1].y - pair[0].y) * ratio;
            }
        }
        if let Some(last) = points.last().filter(|last| last.time_ms <= start) {
            section.crop.x = last.x;
            section.crop.y = last.y;
        }
        section.keyframes = document
            .keyframes
            .iter()
            .filter(|key| key.time_ms >= start && key.time_ms < end)
            .map(|key| Keyframe {
                time_ms: key.time_ms - start,
                ..key.clone()
            })
            .collect();
        for layer in document
            .visual_layers
            .iter()
            .filter(|layer| layer.enabled && layer.start_ms <= start && layer.end_ms > start)
        {
            if layer.kind == "punch_in" {
                section.crop = layer.crop.clone().expect("Validated punch-in crop");
                section.keyframes.clear();
            } else if layer.kind == "split" {
                section.layout = Layout::Gaming;
                section.facecam_crop = layer.crop.clone().expect("Validated split crop");
                section.gameplay_crop = layer.secondary_crop.clone().expect("Validated split crop");
                section.split_ratio = 0.5;
            }
        }
        let (width, height) = document.layout.dimensions(document.resolution);
        let composed =
            composition_dimensions(&section, project.width, project.height, width, height)
                .replace("[0:v]", &format!("[trimmed{index}]"))
                .replace("[composed]", &format!("[section{index}]"))
                .replace("[facein]", &format!("[facein{index}]"))
                .replace("[gamein]", &format!("[gamein{index}]"))
                .replace("[face]", &format!("[face{index}]"))
                .replace("[game]", &format!("[game{index}]"))
                .replace("[background]", &format!("[background{index}]"))
                .replace("[foreground]", &format!("[foreground{index}]"))
                .replace("[blurred]", &format!("[blurred{index}]"))
                .replace("[fit]", &format!("[fit{index}]"));
        filter.push(';');
        filter.push_str(&composed);
        filter.push_str(&format!(";[section{index}]setsar=1[picture{index}]"));
    }
    filter.push(';');
    for index in 0..count {
        filter.push_str(&format!("[picture{index}][sound{index}]"));
    }
    filter.push_str(&format!("concat=n={count}:v=1:a=1[composed][soundtrack]"));
    filter
}

pub async fn render_media(
    state: &AppState,
    job: &mut Job,
    clip: &Clip,
    destination: &std::path::Path,
    captions: bool,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project = db::project(&state.db, &clip.project_id).await?;
    clip.document
        .validate(project.duration_ms)
        .map_err(anyhow::Error::msg)?;
    let (source, _, _) = db::asset(&state.db, &state.root, &project.asset_id).await?;
    let mut document = clip.document.clone();
    document.captions.enabled &= captions;
    let duration = document.duration_ms();
    let working = state.root.join("temporary").join(&job.id);
    tokio::fs::create_dir_all(&working).await?;
    let ass_file = working.join("track.ass");
    tokio::fs::write(&ass_file, subtitles::ass(&document)).await?;
    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", document.start_ms as f64 / 1000.0),
        "-t".into(),
        format!(
            "{:.3}",
            (document.end_ms - document.start_ms) as f64 / 1000.0
        ),
        "-i".into(),
        source.to_string_lossy().into_owned(),
    ];
    let mut next_input = 1;
    let audio_input = if project.has_audio {
        0
    } else {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=r=48000:cl=stereo".into(),
        ]);
        next_input += 1;
        1
    };
    let mut filter = timeline_composition(&document, &project, audio_input);
    let mut video_label = String::from("composed");
    for (index, layer) in document
        .visual_layers
        .iter()
        .filter(|layer| layer.enabled && layer.kind == "broll")
        .enumerate()
    {
        let asset = layer
            .asset_id
            .as_ref()
            .context("Choose a local B-roll asset.")?;
        let (path, _, kind) = db::asset(&state.db, &state.root, asset).await?;
        anyhow::ensure!(
            kind == "video",
            "B-roll must reference a managed video asset."
        );
        let probe = tools::probe(state, &path, cancellation).await?;
        let duration = layer.end_ms - layer.start_ms;
        anyhow::ensure!(
            layer.source_start_ms + duration <= probe.duration_ms,
            "B-roll extends beyond its source."
        );
        args.extend([
            "-ss".into(),
            format!("{:.3}", layer.source_start_ms as f64 / 1000.0),
            "-t".into(),
            format!("{:.3}", duration as f64 / 1000.0),
            "-i".into(),
            path.to_string_lossy().into_owned(),
        ]);
        let (width, height) = document.layout.dimensions(document.resolution);
        filter.push_str(&format!(";[{next_input}:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},fps=30,setpts=PTS-STARTPTS+{:.3}/TB[roll{index}];[{video_label}][roll{index}]overlay=eof_action=pass:enable='gte(t,{:.3})*lt(t,{:.3})'[cutaway{index}]",
            layer.start_ms as f64 / 1000.0, layer.start_ms as f64 / 1000.0, layer.end_ms as f64 / 1000.0));
        video_label = format!("cutaway{index}");
        next_input += 1;
    }
    if document.watermark.mode == "image" {
        let asset_id = document
            .watermark
            .asset_id
            .as_ref()
            .context("Choose a watermark image.")?;
        let (image, _, kind) = db::asset(&state.db, &state.root, asset_id).await?;
        anyhow::ensure!(kind == "image", "Watermark must reference an image asset.");
        args.extend([
            "-loop".into(),
            "1".into(),
            "-i".into(),
            image.to_string_lossy().into_owned(),
        ]);
        let (width, height) = document.layout.dimensions(document.resolution);
        let size = (width as f64 * document.watermark.scale).round() as u32;
        filter.push_str(&format!(";[{next_input}:v]format=rgba,scale={size}:{height}:force_original_aspect_ratio=decrease,colorchannelmixer=aa={}[mark];[{video_label}][mark]overlay=x=(W-w)*{}:y=(H-h)*{}[branded]",
            document.watermark.opacity, document.watermark.x, document.watermark.y));
        next_input += 1;
        video_label = "branded".into();
    }
    let mut audio_labels = String::from("[soundtrack]");
    let mut audio_count = 1;
    for layer in document.audio_layers.iter().filter(|layer| layer.enabled) {
        let length = (layer.end_ms - layer.start_ms) as f64 / 1000.0;
        if let Some(asset) = &layer.asset_id {
            let (path, _, kind) = db::asset(&state.db, &state.root, asset).await?;
            anyhow::ensure!(
                ["audio", "video"].contains(&kind.as_str()),
                "Choose a managed audio source."
            );
            let duration = tools::probe_audio(state, &path, cancellation).await?;
            anyhow::ensure!(
                layer.source_start_ms + layer.end_ms - layer.start_ms <= duration,
                "Audio layer extends beyond its source."
            );
            args.extend([
                "-ss".into(),
                format!("{:.3}", layer.source_start_ms as f64 / 1000.0),
                "-i".into(),
                path.to_string_lossy().into_owned(),
            ]);
        } else {
            args.extend([
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                format!("sine=frequency=720:sample_rate=48000:duration={length:.3}"),
            ]);
        }
        filter.push_str(&format!(";[{next_input}:a]atrim=duration={length:.3},asetpts=PTS-STARTPTS,volume={},afade=t=out:st={:.3}:d=0.08,adelay={}:all=1[effect{audio_count}]",
            layer.gain, (length - 0.08).max(0.0), layer.start_ms));
        audio_labels.push_str(&format!("[effect{audio_count}]"));
        next_input += 1;
        audio_count += 1;
    }
    filter.push_str(&format!(";{audio_labels}amix=inputs={audio_count}:duration=first:normalize=0,alimiter=limit=0.95:latency=1[audioout]"));
    filter.push_str(&format!(
        ";[{video_label}]subtitles=filename='{}':fontsdir='{}',setsar=1[out]",
        escape_filter_path(&ass_file),
        escape_filter_path(&state.tools_root().join("fonts"))
    ));
    let filter_argument = if state.native_tools.is_some() {
        vec!["-filter_complex".into(), filter]
    } else {
        // Managed argument files avoid Windows command-line limits for dense motion and layers.
        let filter_path = state
            .root
            .join("temporary")
            .join(format!("{}-{}-filter.txt", job.id, clip.id));
        tokio::fs::write(&filter_path, filter).await?;
        vec![
            "-/filter_complex".into(),
            filter_path.to_string_lossy().into_owned(),
        ]
    };
    args.extend(filter_argument);
    args.extend([
        "-map".into(),
        "[out]".into(),
        "-map".into(),
        "[audioout]".into(),
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
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        destination.to_string_lossy().into_owned(),
    ]);
    tools::ffmpeg_progress(state, job, &args, duration, cancellation).await?;
    let probe = tools::probe(state, destination, cancellation).await?;
    anyhow::ensure!(
        (probe.duration_ms - duration).abs() <= 100 && probe.has_audio,
        "Rendered media failed duration or audio verification."
    );
    Ok(())
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
    let document = &clip.document;
    let temporary = state.root.join("exports").join(format!("{id}.part.mp4"));
    let final_path = state.root.join("exports").join(format!("{id}.mp4"));
    render_media(state, job, clip, &temporary, true, cancellation).await?;
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

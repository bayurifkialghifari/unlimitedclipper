use crate::{db, error::ApiResult, models::Job, state::AppState, tools};
use anyhow::{Context, Result, ensure};
use futures_util::StreamExt;
use serde::Serialize;
use sqlx::Row;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use utoipa::ToSchema;

const STOCK_LIMIT: u64 = 250 * 1024 * 1024;

#[derive(Serialize, ToSchema)]
pub struct BrollAsset {
    pub asset_id: String,
    pub preview_asset_id: Option<String>,
    pub name: String,
    pub thumbnail_id: Option<String>,
    pub duration_ms: i64,
    pub width: u32,
    pub height: u32,
    pub origin: String,
    pub source_url: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub creator: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct StockVideo {
    pub page_id: i64,
    pub title: String,
    pub thumbnail_url: Option<String>,
    pub source_url: String,
    pub size_bytes: u64,
    pub creator: Option<String>,
    pub license: String,
    pub license_url: Option<String>,
}

struct StockEntry {
    video: StockVideo,
    download_url: String,
    extension: &'static str,
}

fn stock_entry(page: &serde_json::Value) -> Option<StockEntry> {
    let info = page["imageinfo"].as_array()?.first()?;
    if info["extmetadata"]["LicenseShortName"]["value"].as_str()? != "CC0" {
        return None;
    }
    let extension = match info["mime"].as_str()? {
        "video/webm" => "webm",
        "video/mp4" => "mp4",
        "video/ogg" => "ogv",
        _ => return None,
    };
    let size = info["size"].as_u64()?;
    if size == 0 || size > STOCK_LIMIT {
        return None;
    }
    let download_url = info["url"].as_str()?.to_string();
    let url = reqwest::Url::parse(&download_url).ok()?;
    if url.scheme() != "https" || url.host_str() != Some("upload.wikimedia.org") {
        return None;
    }
    Some(StockEntry {
        video: StockVideo {
            page_id: page["pageid"].as_i64()?,
            title: page["title"]
                .as_str()?
                .trim_start_matches("File:")
                .to_string(),
            thumbnail_url: info["thumburl"].as_str().map(str::to_string),
            source_url: info["descriptionurl"].as_str()?.to_string(),
            size_bytes: size,
            creator: info["extmetadata"]["Artist"]["value"]
                .as_str()
                .map(str::to_string),
            license: "CC0".into(),
            license_url: info["extmetadata"]["LicenseUrl"]["value"]
                .as_str()
                .map(str::to_string),
        },
        download_url,
        extension,
    })
}

async fn commons_page(
    state: &AppState,
    page_id: Option<i64>,
    search: Option<&str>,
) -> Result<Vec<StockEntry>> {
    let mut url = reqwest::Url::parse("https://commons.wikimedia.org/w/api.php")?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("action", "query");
        query.append_pair("format", "json");
        query.append_pair("prop", "imageinfo");
        query.append_pair("iiprop", "url|mime|size|extmetadata");
        query.append_pair("iiurlwidth", "320");
        if let Some(page_id) = page_id {
            query.append_pair("pageids", &page_id.to_string());
        } else if let Some(search) = search {
            query.append_pair("generator", "search");
            query.append_pair("gsrsearch", &format!("filetype:video {search}"));
            query.append_pair("gsrnamespace", "6");
            query.append_pair("gsrlimit", "25");
        }
    }
    let response = state.client.get(url).send().await?.error_for_status()?;
    let data: serde_json::Value = response.json().await?;
    let Some(pages) = data["query"]["pages"].as_object() else {
        return Ok(Vec::new());
    };
    Ok(pages.values().filter_map(stock_entry).collect())
}

pub async fn search(state: &AppState, query: &str) -> ApiResult<Vec<StockVideo>> {
    let query = query.trim();
    if query.chars().count() < 2 || query.chars().count() > 80 {
        return Err(crate::error::ApiError::bad_request(
            "Search with 2 to 80 characters.",
        ));
    }
    Ok(commons_page(state, None, Some(query))
        .await?
        .into_iter()
        .map(|entry| entry.video)
        .collect())
}

pub async fn list(state: &AppState, project_id: &str) -> ApiResult<Vec<BrollAsset>> {
    let project = db::project(&state.db, project_id).await?;
    let mut assets = vec![BrollAsset {
        asset_id: project.asset_id,
        preview_asset_id: project.preview_asset_id,
        name: project.name,
        thumbnail_id: project.thumbnail_id,
        duration_ms: project.duration_ms,
        width: project.width,
        height: project.height,
        origin: "project".into(),
        source_url: project.source_url,
        license: None,
        license_url: None,
        creator: None,
    }];
    let rows = sqlx::query(
        "SELECT media.asset_id, assets.name, media.thumbnail_id, media.preview_asset_id, media.duration_ms, media.width, media.height, media.origin, media.source_url, media.license, media.license_url, media.creator FROM project_media AS media JOIN assets ON assets.id = media.asset_id WHERE media.project_id = ? ORDER BY media.created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    assets.extend(rows.into_iter().map(|row| BrollAsset {
        asset_id: row.get("asset_id"),
        preview_asset_id: row.get("preview_asset_id"),
        name: row.get("name"),
        thumbnail_id: row.get("thumbnail_id"),
        duration_ms: row.get("duration_ms"),
        width: row.get::<i64, _>("width") as u32,
        height: row.get::<i64, _>("height") as u32,
        origin: row.get("origin"),
        source_url: row.get("source_url"),
        license: row.get("license"),
        license_url: row.get("license_url"),
        creator: row.get("creator"),
    }));
    Ok(assets)
}

async fn download_stock(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
    project_id: &str,
) -> Result<(String, String, StockVideo)> {
    let page_id = job.payload["page_id"]
        .as_i64()
        .context("Missing stock video ID")?;
    let entry = commons_page(state, Some(page_id), None)
        .await?
        .into_iter()
        .find(|entry| entry.video.page_id == page_id)
        .context("This stock video is no longer available as CC0.")?;
    let relative = format!("broll/{project_id}/{}.{}", job.id, entry.extension);
    let destination = state.root.join(&relative);
    tokio::fs::create_dir_all(destination.parent().context("B-roll directory")?).await?;
    if !destination.is_file() {
        let temporary = destination.with_extension(format!("{}.part", entry.extension));
        let policy = reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5
                || attempt.url().scheme() != "https"
                || attempt.url().host_str() != Some("upload.wikimedia.org")
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        });
        let client = reqwest::Client::builder()
            .redirect(policy)
            .connect_timeout(std::time::Duration::from_secs(15))
            .read_timeout(std::time::Duration::from_secs(30))
            .build()?;
        let response = client
            .get(&entry.download_url)
            .send()
            .await?
            .error_for_status()?;
        let mut file = tokio::fs::File::create(&temporary).await?;
        let mut stream = response.bytes_stream();
        let mut size = 0_u64;
        let mut last_report = std::time::Instant::now();
        let result = async {
            while let Some(chunk) = stream.next().await {
                ensure!(!cancellation.is_cancelled(), "Job cancelled.");
                let chunk = chunk?;
                size += chunk.len() as u64;
                ensure!(size <= STOCK_LIMIT, "Stock video exceeds 250 MiB.");
                file.write_all(&chunk).await?;
                if last_report.elapsed() >= std::time::Duration::from_millis(250)
                    || size == entry.video.size_bytes
                {
                    state
                        .progress(
                            job,
                            "downloading",
                            (size as f64 / entry.video.size_bytes as f64).min(1.0) * 0.7,
                            "Downloading selected CC0 video.",
                        )
                        .await?;
                    last_report = std::time::Instant::now();
                }
            }
            ensure!(
                size == entry.video.size_bytes,
                "Stock video size changed during download."
            );
            file.sync_all().await?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        drop(file);
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        result?;
        tokio::fs::rename(&temporary, &destination).await?;
    }
    Ok((relative, entry.video.title.clone(), entry.video))
}

pub async fn import(
    state: &AppState,
    job: &mut Job,
    cancellation: &CancellationToken,
) -> Result<()> {
    let project_id = job
        .project_id
        .as_deref()
        .context("Missing B-roll project")?
        .to_string();
    db::project(&state.db, &project_id).await?;
    let existing: Option<(String,)> =
        sqlx::query_as("SELECT asset_id FROM project_media WHERE job_id = ?")
            .bind(&job.id)
            .fetch_optional(&state.db)
            .await?;
    if let Some((asset_id,)) = existing {
        job.payload["asset_id"] = serde_json::json!(asset_id);
        return Ok(());
    }
    let (relative, name, stock) = if job.payload["page_id"].as_i64().is_some() {
        let (relative, name, stock) = download_stock(state, job, cancellation, &project_id).await?;
        (relative, name, Some(stock))
    } else {
        let relative = job.payload["relative_path"]
            .as_str()
            .context("Missing local B-roll file")?
            .to_string();
        ensure!(relative.starts_with(&format!("broll/{project_id}/")) && !relative.contains(".."));
        let name = job.payload["name"]
            .as_str()
            .context("Missing B-roll name")?
            .to_string();
        (relative, name, None)
    };
    let path = state.root.join(&relative);
    let metadata = tokio::fs::metadata(&path).await?;
    ensure!(
        metadata.len() <= 2 * 1024 * 1024 * 1024,
        "B-roll exceeds 2 GiB."
    );
    let probe = tools::probe(state, &path, cancellation).await?;
    ensure!(
        probe.duration_ms > 0 && probe.duration_ms <= 600_000,
        "B-roll must be at most ten minutes."
    );
    let preview_relative = format!("broll/{project_id}/{}-preview.mp4", job.id);
    let preview = state.root.join(&preview_relative);
    if !preview.is_file() {
        let temporary = preview.with_extension("part.mp4");
        let result = tools::ffmpeg_progress(
            state,
            job,
            &[
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-y".into(),
                "-i".into(),
                path.to_string_lossy().into_owned(),
                "-map".into(),
                "0:v:0".into(),
                "-vf".into(),
                "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1".into(),
                "-an".into(),
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "ultrafast".into(),
                "-crf".into(),
                "25".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-movflags".into(),
                "+faststart".into(),
                "-progress".into(),
                "pipe:1".into(),
                "-nostats".into(),
                temporary.to_string_lossy().into_owned(),
            ],
            probe.duration_ms,
            cancellation,
        )
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        result?;
        tools::probe(state, &temporary, cancellation).await?;
        tokio::fs::rename(&temporary, &preview).await?;
    }
    state
        .progress(job, "thumbnail", 0.96, "Preparing a B-roll thumbnail.")
        .await?;
    let thumb_relative = format!("thumbnails/broll/{project_id}/{}.jpg", job.id);
    let thumbnail = state.root.join(&thumb_relative);
    tokio::fs::create_dir_all(thumbnail.parent().context("Thumbnail directory")?).await?;
    if !thumbnail.is_file() {
        let temporary = thumbnail.with_extension("part.jpg");
        let result = async {
            tools::capture_managed(
                state,
                "ffmpeg",
                "ffmpeg",
                &[
                    "-hide_banner".into(), "-loglevel".into(), "error".into(), "-y".into(),
                    "-ss".into(), format!("{:.3}", (probe.duration_ms / 2).min(1000) as f64 / 1000.0),
                    "-i".into(), preview.to_string_lossy().into_owned(), "-an".into(),
                    "-frames:v".into(), "1".into(), "-vf".into(),
                    "scale=256:144:force_original_aspect_ratio=decrease,pad=256:144:(ow-iw)/2:(oh-ih)/2".into(),
                    "-q:v".into(), "5".into(), temporary.to_string_lossy().into_owned(),
                ],
                cancellation,
            )
            .await?;
            ensure!(tokio::fs::metadata(&temporary).await?.len() > 0);
            tokio::fs::rename(&temporary, &thumbnail).await?;
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        result?;
    }
    ensure!(!cancellation.is_cancelled(), "Job cancelled.");
    let asset_id = db::register_asset(&state.db, &relative, &name, "video").await?;
    let preview_asset_id =
        db::register_asset(&state.db, &preview_relative, "broll-preview.mp4", "video").await?;
    let thumbnail_id =
        db::register_asset(&state.db, &thumb_relative, "broll-frame.jpg", "image").await?;
    sqlx::query("INSERT INTO project_media(project_id, asset_id, thumbnail_id, preview_asset_id, job_id, origin, source_url, license, license_url, creator, duration_ms, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&project_id)
        .bind(&asset_id)
        .bind(&thumbnail_id)
        .bind(&preview_asset_id)
        .bind(&job.id)
        .bind(if stock.is_some() { "stock" } else { "local" })
        .bind(stock.as_ref().map(|entry| &entry.source_url))
        .bind(stock.as_ref().map(|entry| &entry.license))
        .bind(stock.as_ref().and_then(|entry| entry.license_url.as_ref()))
        .bind(stock.as_ref().and_then(|entry| entry.creator.as_ref()))
        .bind(probe.duration_ms)
        .bind(probe.width)
        .bind(probe.height)
        .bind(crate::models::now_ms())
        .execute(&state.db)
        .await?;
    job.payload["asset_id"] = serde_json::json!(asset_id);
    db::save_job(&state.db, job).await?;
    state
        .progress(job, "registered", 1.0, "B-roll is ready in this project.")
        .await?;
    Ok(())
}

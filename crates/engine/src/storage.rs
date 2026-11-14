use crate::state::AppState;
use anyhow::{Result, ensure};
use serde::Serialize;
use std::{collections::HashSet, path::Path};

#[derive(Serialize)]
pub struct CleanupReport {
    pub cleared: bool,
    pub removed_bytes: u64,
    pub protected_items: usize,
}

async fn safe_size(path: &Path) -> Result<u64> {
    let metadata = tokio::fs::symlink_metadata(path).await?;
    ensure!(
        !metadata.file_type().is_symlink(),
        "Cleanup cannot follow symbolic links."
    );
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut bytes = 0;
    let mut entries = tokio::fs::read_dir(path).await?;
    while let Some(entry) = entries.next_entry().await? {
        bytes += Box::pin(safe_size(&entry.path())).await?;
    }
    Ok(bytes)
}

fn protect_reference(value: &serde_json::Value, protected: &mut HashSet<String>) {
    match value {
        serde_json::Value::String(value) => {
            let normalized = value.replace(char::from(92), "/");
            if let Some(relative) = normalized.strip_prefix("temporary/")
                && let Some(first) = relative.split('/').next()
            {
                protected.insert(first.to_string());
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                protect_reference(value, protected);
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values() {
                protect_reference(value, protected);
            }
        }
        _ => {}
    }
}

pub async fn cleanup(state: &AppState) -> Result<CleanupReport> {
    let mut protected = HashSet::new();
    // Recent-history limits cannot hide a retryable checkpoint from garbage collection.
    let jobs: Vec<(String, String)> =
        sqlx::query_as("SELECT id, data FROM jobs WHERE status != 'completed'")
            .fetch_all(&state.db)
            .await?;
    for (id, data) in jobs {
        protected.insert(id);
        let value: serde_json::Value = serde_json::from_str(&data)?;
        if let Some(project) = value["project_id"].as_str() {
            protected.insert(format!("{project}.wav"));
            protected.insert(format!("{project}-transcript.json"));
        }
        protect_reference(&value, &mut protected);
    }
    let assets: Vec<(String,)> = sqlx::query_as("SELECT relative_path FROM assets")
        .fetch_all(&state.db)
        .await?;
    for (relative,) in assets {
        protect_reference(&serde_json::Value::String(relative), &mut protected);
    }
    let temporary = state.root.join("temporary");
    let root = tokio::fs::canonicalize(&state.root).await?;
    ensure!(
        !tokio::fs::symlink_metadata(&temporary)
            .await?
            .file_type()
            .is_symlink(),
        "Temporary storage cannot be a symbolic link."
    );
    let canonical = tokio::fs::canonicalize(&temporary).await?;
    ensure!(
        canonical.starts_with(&root),
        "Cleanup escaped managed storage."
    );
    let mut report = CleanupReport {
        cleared: true,
        removed_bytes: 0,
        protected_items: 0,
    };
    let mut entries = tokio::fs::read_dir(&temporary).await?;
    while let Some(entry) = entries.next_entry().await? {
        if protected.contains(&entry.file_name().to_string_lossy().into_owned()) {
            report.protected_items += 1;
            continue;
        }
        let path = entry.path();
        let size = match safe_size(&path).await {
            Ok(size) => size,
            Err(_) => {
                report.protected_items += 1;
                continue;
            }
        };
        ensure!(
            tokio::fs::canonicalize(&path)
                .await?
                .starts_with(&canonical),
            "Cleanup target escaped temporary storage."
        );
        if entry.file_type().await?.is_dir() {
            tokio::fs::remove_dir_all(&path).await?;
        } else {
            tokio::fs::remove_file(&path).await?;
        }
        report.removed_bytes += size;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, models::*};

    #[tokio::test]
    async fn cleanup_preserves_failed_checkpoints_and_registered_previews() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState::new(
            directory.path().to_path_buf(),
            directory.path().join("tools"),
        )
        .await
        .unwrap();
        let job = Job {
            id: "retryable".into(),
            project_id: None,
            clip_id: None,
            kind: "captions".into(),
            status: "failed".into(),
            stage: "alignment".into(),
            progress: 0.5,
            message: String::new(),
            error: None,
            payload: serde_json::json!({"audio": "temporary/input.wav"}),
            created_at: 0,
            updated_at: 0,
        };
        db::save_job(&state.db, &job).await.unwrap();
        let root = state.root.join("temporary");
        tokio::fs::create_dir(root.join("retryable")).await.unwrap();
        for name in ["input.wav", "preview.mp4", "orphan.wav"] {
            tokio::fs::write(root.join(name), [1, 2, 3]).await.unwrap();
        }
        db::register_asset(&state.db, "temporary/preview.mp4", "preview", "video")
            .await
            .unwrap();
        let report = cleanup(&state).await.unwrap();
        assert_eq!(report.removed_bytes, 3);
        assert_eq!(report.protected_items, 3);
        assert!(root.join("retryable").exists());
        assert!(root.join("input.wav").exists());
        assert!(root.join("preview.mp4").exists());
        assert!(!root.join("orphan.wav").exists());
    }
}

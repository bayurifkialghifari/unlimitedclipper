CREATE TABLE project_media (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    thumbnail_id TEXT REFERENCES assets(id),
    job_id TEXT NOT NULL UNIQUE,
    origin TEXT NOT NULL,
    source_url TEXT,
    license TEXT,
    license_url TEXT,
    creator TEXT,
    duration_ms INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, asset_id)
);

CREATE INDEX project_media_recent ON project_media(project_id, created_at DESC);

CREATE TABLE asset_waveforms (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    bucket_ms INTEGER NOT NULL,
    peaks BLOB NOT NULL
);

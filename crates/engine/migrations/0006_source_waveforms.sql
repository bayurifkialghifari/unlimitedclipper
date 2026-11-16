CREATE TABLE source_waveforms (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    bucket_ms INTEGER NOT NULL,
    peaks BLOB NOT NULL
);

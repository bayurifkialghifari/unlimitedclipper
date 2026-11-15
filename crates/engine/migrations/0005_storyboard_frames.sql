CREATE TABLE storyboard_frames (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_time_ms INTEGER NOT NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id),
    accessed_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, source_time_ms)
);

CREATE INDEX storyboard_frames_accessed ON storyboard_frames(project_id, accessed_at);

CREATE TABLE caption_presets (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE clip_assessments (
    clip_id TEXT PRIMARY KEY REFERENCES clips(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE hook_proposals (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX hook_proposals_clip_created ON hook_proposals(clip_id, created_at DESC);

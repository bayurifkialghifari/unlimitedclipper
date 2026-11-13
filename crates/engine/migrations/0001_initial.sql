CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE clips (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE exports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

CREATE INDEX clips_project ON clips(project_id, created_at);
CREATE INDEX jobs_status ON jobs(status, created_at);
CREATE INDEX exports_project ON exports(project_id, created_at);

ALTER TABLE project_media ADD COLUMN preview_asset_id TEXT REFERENCES assets(id);

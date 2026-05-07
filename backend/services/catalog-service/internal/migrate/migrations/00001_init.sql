-- +goose Up
CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source_obj_path TEXT NOT NULL,
    source_mtl_path TEXT NOT NULL DEFAULT '',
    source_texture_path TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE model_artifacts (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    lod INTEGER NOT NULL,
    hash TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    vertices BIGINT NOT NULL,
    faces BIGINT NOT NULL,
    bbox_min_x DOUBLE PRECISION NOT NULL,
    bbox_min_y DOUBLE PRECISION NOT NULL,
    bbox_min_z DOUBLE PRECISION NOT NULL,
    bbox_max_x DOUBLE PRECISION NOT NULL,
    bbox_max_y DOUBLE PRECISION NOT NULL,
    bbox_max_z DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, lod)
);

CREATE INDEX idx_artifacts_hash ON model_artifacts(hash);

-- +goose Down
DROP TABLE IF EXISTS model_artifacts;
DROP TABLE IF EXISTS projects;

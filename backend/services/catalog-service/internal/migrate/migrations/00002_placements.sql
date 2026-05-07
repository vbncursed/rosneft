-- +goose Up
CREATE TABLE placements (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    asset_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_z DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_z DOUBLE PRECISION NOT NULL DEFAULT 0,
    scale_x DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_y DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_z DOUBLE PRECISION NOT NULL DEFAULT 1,
    label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT placements_no_self CHECK (parent_id <> asset_id),
    CONSTRAINT placements_scale_positive CHECK (scale_x > 0 AND scale_y > 0 AND scale_z > 0)
);

CREATE INDEX idx_placements_parent ON placements(parent_id);
CREATE INDEX idx_placements_asset  ON placements(asset_id);

-- +goose Down
DROP TABLE IF EXISTS placements;

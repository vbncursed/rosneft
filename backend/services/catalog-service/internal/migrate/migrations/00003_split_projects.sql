-- +goose Up
-- +goose StatementBegin
-- Splits the previous single-table "projects" model into two separate
-- domain entities: territories (parent scenes) and models (placeable
-- assets). Placements now FK each side to a different table, making
-- the relationship structurally typed instead of conventional.
--
-- Source files (OBJ + MTL + textures) are no longer kept on the host
-- filesystem; instead the upload-service stores a ZIP archive in
-- BlobStore and the catalog references it by content hash. The mesh
-- worker fetches the archive, extracts to a tmp dir, and converts.
--
-- Safety guard: the migration aborts if the legacy placements table
-- already has rows. The current dataset is seeded from a YAML file
-- and contains no placements, so the drop-and-rebuild path is safe.
-- If a deployment ever has real placement data we'd need a separate
-- data-migration step before this DDL.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM placements LIMIT 1) THEN
        RAISE EXCEPTION 'placements table has rows; manual data migration required before 00003';
    END IF;
END$$;
-- +goose StatementEnd

DROP TABLE IF EXISTS placements;
DROP TABLE IF EXISTS model_artifacts;
DROP TABLE IF EXISTS projects;

CREATE TABLE territories (
    id               BIGSERIAL PRIMARY KEY,
    slug             TEXT UNIQUE NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE territory_artifacts (
    id           BIGSERIAL PRIMARY KEY,
    territory_id BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    lod          INTEGER NOT NULL,
    hash         TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    vertices     BIGINT NOT NULL,
    faces        BIGINT NOT NULL,
    bbox_min_x   DOUBLE PRECISION NOT NULL,
    bbox_min_y   DOUBLE PRECISION NOT NULL,
    bbox_min_z   DOUBLE PRECISION NOT NULL,
    bbox_max_x   DOUBLE PRECISION NOT NULL,
    bbox_max_y   DOUBLE PRECISION NOT NULL,
    bbox_max_z   DOUBLE PRECISION NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(territory_id, lod)
);

CREATE INDEX idx_territory_artifacts_hash ON territory_artifacts(hash);

CREATE TABLE models (
    id               BIGSERIAL PRIMARY KEY,
    slug             TEXT UNIQUE NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE model_artifacts (
    id           BIGSERIAL PRIMARY KEY,
    model_id     BIGINT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    lod          INTEGER NOT NULL,
    hash         TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    vertices     BIGINT NOT NULL,
    faces        BIGINT NOT NULL,
    bbox_min_x   DOUBLE PRECISION NOT NULL,
    bbox_min_y   DOUBLE PRECISION NOT NULL,
    bbox_min_z   DOUBLE PRECISION NOT NULL,
    bbox_max_x   DOUBLE PRECISION NOT NULL,
    bbox_max_y   DOUBLE PRECISION NOT NULL,
    bbox_max_z   DOUBLE PRECISION NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model_id, lod)
);

CREATE INDEX idx_model_artifacts_hash ON model_artifacts(hash);

CREATE TABLE placements (
    id           BIGSERIAL PRIMARY KEY,
    territory_id BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    model_id     BIGINT NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
    label        TEXT NOT NULL DEFAULT '',
    position_x   DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y   DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_z   DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_x   DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_y   DOUBLE PRECISION NOT NULL DEFAULT 0,
    rotation_z   DOUBLE PRECISION NOT NULL DEFAULT 0,
    scale_x      DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_y      DOUBLE PRECISION NOT NULL DEFAULT 1,
    scale_z      DOUBLE PRECISION NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT placements_scale_positive CHECK (scale_x > 0 AND scale_y > 0 AND scale_z > 0)
);

CREATE INDEX idx_placements_territory ON placements(territory_id);
CREATE INDEX idx_placements_model     ON placements(model_id);

-- +goose Down
DROP TABLE IF EXISTS placements;
DROP TABLE IF EXISTS model_artifacts;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS territory_artifacts;
DROP TABLE IF EXISTS territories;

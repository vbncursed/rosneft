-- +goose Up
-- +goose StatementBegin
-- content-service adopts the existing territory_documents + panoramas tables in
-- the shared `andrey` DB. IF NOT EXISTS makes this a no-op on a DB where catalog
-- already created them, and a clean create on a fresh DB. Schema MUST match the
-- catalog originals (00004_panoramas.sql, 00010_territory_documents.sql).
CREATE TABLE IF NOT EXISTS territories (
    id   BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS territory_documents (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_territory_documents_territory ON territory_documents(territory_id);
CREATE TABLE IF NOT EXISTS panoramas (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    slug             TEXT NOT NULL,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    position_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    yaw_offset       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(territory_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_panoramas_territory ON panoramas(territory_id);
CREATE INDEX IF NOT EXISTS idx_panoramas_blob      ON panoramas(source_blob_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- No-op: content-service never owned these tables exclusively; dropping them
-- would break catalog. Down is intentionally empty.
SELECT 1;
-- +goose StatementEnd

-- +goose Up
-- Panoramas are equirectangular images (Insta360 Pro source) anchored to
-- a point in a territory's normalized scene-units coordinate space. They
-- are an alternative camera/scene composition: when the viewer "enters"
-- a panorama, the camera teleports to the anchor and an inverted sphere
-- skybox is rendered around it. Placements stay identical — same FK to
-- territory, same scene-units coordinates — so equipment placed in 3D
-- view appears at the same world position when seen from a panorama,
-- and vice versa.
--
-- yaw_offset rotates the sphere around its Y axis so the panorama's
-- "north" aligns with the territory's axes (cameras don't capture
-- magnetic north; this is a manual calibration knob).
--
-- source_blob_hash is the BlobStore key for the equirect JPG/PNG. The
-- frontend fetches it via /api/assets/{hash}. No conversion pipeline
-- in MVP — KTX2 re-encoding can be added later as an optional artifact
-- table alongside this one.
CREATE TABLE panoramas (
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

CREATE INDEX idx_panoramas_territory ON panoramas(territory_id);
CREATE INDEX idx_panoramas_blob      ON panoramas(source_blob_hash);

-- +goose Down
DROP TABLE IF EXISTS panoramas;

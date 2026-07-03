-- +goose Up
-- +goose StatementBegin
-- Adds an optional per-model thumbnail image. Stored as the content-addressed
-- hash of an uploaded image blob (served via /api/assets/{hash}) — mirroring
-- the source_blob_hash convention. A plain NOT NULL DEFAULT '' TEXT ('' =
-- "no thumbnail") matches the existing description / external_panorama_url
-- pattern, so no NULL handling is needed in scans.
ALTER TABLE models
    ADD COLUMN thumbnail_blob_hash TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE models
    DROP COLUMN thumbnail_blob_hash;
-- +goose StatementEnd

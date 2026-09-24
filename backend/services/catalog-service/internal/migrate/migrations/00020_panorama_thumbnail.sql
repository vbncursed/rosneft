-- +goose Up
-- +goose StatementBegin
-- A 256×128 JPEG that content-service makes from the panorama's equirect, so
-- the View tab's 44×34 row no longer downloads and decodes the whole original.
-- '' means "not made yet": content-service's startup backfill fills it. This is
-- the models.thumbnail_blob_hash convention (00012). The DDL is catalog's
-- although content-service writes the column, like every panoramas change.
--
-- The index serves ResolveBlobAccess, which looks every asset hash up in this
-- column. Without it the new predicate is a sequential scan per request (00014).
ALTER TABLE panoramas
    ADD COLUMN thumbnail_blob_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_panoramas_thumbnail_blob ON panoramas(thumbnail_blob_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_panoramas_thumbnail_blob;
ALTER TABLE panoramas
    DROP COLUMN thumbnail_blob_hash;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- ResolveBlobAccess looks a content hash up across six tables. Three already had
-- an index on the hash column (territory_artifacts, model_artifacts, panoramas);
-- without these four the remaining branches are sequential scans on every single
-- asset request, and a scene issues one per placement.
CREATE INDEX idx_territories_source_blob  ON territories(source_blob_hash);
CREATE INDEX idx_models_source_blob       ON models(source_blob_hash);
CREATE INDEX idx_models_thumbnail_blob    ON models(thumbnail_blob_hash);
CREATE INDEX idx_territory_documents_blob ON territory_documents(source_blob_hash);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_territories_source_blob;
DROP INDEX IF EXISTS idx_models_source_blob;
DROP INDEX IF EXISTS idx_models_thumbnail_blob;
DROP INDEX IF EXISTS idx_territory_documents_blob;
-- +goose StatementEnd

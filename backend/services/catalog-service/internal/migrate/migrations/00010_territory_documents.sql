-- +goose Up
-- +goose StatementBegin
CREATE TABLE territory_documents (
    id               BIGSERIAL PRIMARY KEY,
    territory_id     BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    source_blob_hash TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_territory_documents_territory ON territory_documents(territory_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE territory_documents;
-- +goose StatementEnd

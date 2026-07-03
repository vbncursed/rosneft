-- +goose Up
-- +goose StatementBegin
-- No-op. Under the B1-lite design (see the extraction spec) content-service
-- READS AND WRITES the `panoramas` and `territory_documents` tables in the
-- shared `andrey` DB, but catalog-service owns their DDL (created by catalog
-- migrations 00004 / 00010). content deliberately creates NOTHING so it can
-- never race catalog on a fresh database (catalog's `CREATE TABLE territories`
-- is not IF NOT EXISTS — a duplicate create here would break catalog boot).
-- If content ever moves to its own physical DB (design's B2 upgrade path),
-- replace this with the real CREATE TABLE statements.
SELECT 1;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd

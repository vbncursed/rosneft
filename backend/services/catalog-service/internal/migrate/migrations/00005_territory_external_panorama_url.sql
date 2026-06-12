-- +goose Up
-- +goose StatementBegin
-- Adds an optional per-territory link to an externally-hosted panorama
-- tour (e.g. a third-party 360° viewer). It is purely a presentation
-- affordance — the viewer renders a button that opens this URL in a new
-- tab — so the column is a plain nullable-equivalent TEXT mirroring the
-- existing `description` convention (NOT NULL DEFAULT '' = "unset").
ALTER TABLE territories
    ADD COLUMN external_panorama_url TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE territories
    DROP COLUMN external_panorama_url;
-- +goose StatementEnd

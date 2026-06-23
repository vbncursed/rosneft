-- +goose Up
-- +goose StatementBegin
-- Per-panorama names were replaced by the placement's single territory-level
-- label (placements.label), so the same object reads the same everywhere.
-- Drop the now-unused per-(placement, panorama) name table.
DROP TABLE IF EXISTS placement_panorama_label;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TABLE placement_panorama_label (
    placement_id BIGINT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    panorama_id  BIGINT NOT NULL REFERENCES panoramas(id) ON DELETE CASCADE,
    label        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (placement_id, panorama_id)
);
-- +goose StatementEnd

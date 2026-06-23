-- +goose Up
-- +goose StatementBegin
-- Per-(placement, panorama) name. The same placement can read differently in
-- each panorama, so the label is keyed on the pair rather than the placement.
-- Independent of visibility (placements.visible_panorama_ids) — a name set
-- here survives toggling the placement out of the panorama. ON DELETE CASCADE
-- on both FKs keeps the table free of dangling rows when either side is
-- removed.
CREATE TABLE placement_panorama_label (
    placement_id BIGINT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    panorama_id  BIGINT NOT NULL REFERENCES panoramas(id) ON DELETE CASCADE,
    label        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (placement_id, panorama_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_ppl_panorama ON placement_panorama_label(panorama_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS placement_panorama_label;
-- +goose StatementEnd

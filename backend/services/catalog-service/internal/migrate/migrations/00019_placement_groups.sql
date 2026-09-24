-- +goose Up
-- +goose StatementBegin
-- User-made groups of placements, and a shared hidden flag on every placement.
-- A placement sits in at most one group. The composite FK makes a group of
-- another territory unrepresentable; the column-list SET NULL (Postgres 15+)
-- clears only group_id when its group is deleted, so the placements stay.
-- UNIQUE (territory_id, id) is what that FK references, and it doubles as the
-- territory index. hidden and group_id are not in audit_capture()'s ignore
-- list: hiding and grouping are shared, so they are journalled like any edit.
CREATE TABLE placement_groups (
    id           BIGSERIAL PRIMARY KEY,
    territory_id BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT placement_groups_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    CONSTRAINT placement_groups_territory_id UNIQUE (territory_id, id)
);

ALTER TABLE placements
    ADD COLUMN hidden   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN group_id BIGINT,
    ADD CONSTRAINT placements_group_fk
        FOREIGN KEY (territory_id, group_id)
        REFERENCES placement_groups (territory_id, id)
        ON DELETE SET NULL (group_id);

CREATE INDEX placements_group_id ON placements (group_id) WHERE group_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Dropping group_id takes placements_group_id with it.
ALTER TABLE placements
    DROP CONSTRAINT placements_group_fk,
    DROP COLUMN group_id,
    DROP COLUMN hidden;
DROP TABLE placement_groups;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- Panorama phases and shared group visibility (spec 2026-09-29). Every
-- panorama belongs to one of three fixed phases of the job — prior, current,
-- post — and the rows that exist when this runs land in prior through the
-- default. panoramas.hidden, the per-phase flag and placement_groups.hidden are
-- shared by every reader, like placements.hidden (00019). An item is drawn only
-- when neither it nor its group is hidden, so hiding a group never rewrites its
-- members. A phase with no row in panorama_phase_visibility is shown; setting
-- one is an upsert on the primary key, and a territory delete cascades to it.
-- The DDL is catalog's although content-service writes the panorama half, like
-- every panoramas change. None of the new columns is on audit_capture()'s
-- ignore list: hiding and moving are journalled like any edit, and audit's
-- 00008 registers panorama_phase_visibility.
ALTER TABLE panoramas
    ADD COLUMN phase  TEXT    NOT NULL DEFAULT 'prior'
        CONSTRAINT panoramas_phase_valid CHECK (phase IN ('prior', 'current', 'post')),
    ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE panorama_phase_visibility (
    territory_id BIGINT  NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    phase        TEXT    NOT NULL
        CONSTRAINT panorama_phase_visibility_phase_valid CHECK (phase IN ('prior', 'current', 'post')),
    hidden       BOOLEAN NOT NULL,
    PRIMARY KEY (territory_id, phase)
);

ALTER TABLE placement_groups ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Dropping phase takes panoramas_phase_valid with it.
ALTER TABLE placement_groups DROP COLUMN hidden;
DROP TABLE panorama_phase_visibility;
ALTER TABLE panoramas
    DROP COLUMN hidden,
    DROP COLUMN phase;
-- +goose StatementEnd

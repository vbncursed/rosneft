-- +goose Up
-- +goose StatementBegin
-- A group title is unique on its territory, compared the way a person reads
-- it: case-insensitively and ignoring surrounding spaces, so "North" and
-- " north " cannot both exist. Storage maps a breach to ErrInvalidInput (400).
CREATE UNIQUE INDEX placement_groups_territory_title ON placement_groups (territory_id, lower(btrim(title)));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS placement_groups_territory_title;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- A group title is unique on its territory, compared the way a person reads
-- it: case-insensitively and ignoring surrounding spaces, so "North" and
-- " north " cannot both exist. Storage maps a breach to ErrInvalidInput (400).
-- btrim strips ASCII spaces only; the service already trims Unicode
-- whitespace (strings.TrimSpace) before a title gets here, so this is the
-- backstop, not the rule.
CREATE UNIQUE INDEX placement_groups_territory_title ON placement_groups (territory_id, lower(btrim(title)));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS placement_groups_territory_title;
-- +goose StatementEnd

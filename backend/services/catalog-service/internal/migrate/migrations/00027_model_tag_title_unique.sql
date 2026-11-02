-- +goose Up
-- +goose StatementBegin
-- Root now creates and renames tags (spec 2026-10-26 §8.1): a title must stay
-- unique, compared like a placement group's, or two tags read the same in the
-- picker. Additive: the previous release never writes model_tags.
CREATE UNIQUE INDEX model_tags_title ON model_tags (lower(btrim(title)));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS model_tags_title;
-- +goose StatementEnd

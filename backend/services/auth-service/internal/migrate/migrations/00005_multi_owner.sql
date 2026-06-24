-- +goose Up
-- +goose StatementBegin
-- Owners are no longer limited to one: an owner may promote other main accounts
-- to owner too. Drop the single-owner unique index.
DROP INDEX IF EXISTS users_single_owner;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Reverting requires at most one owner; keep the earliest, demote the rest.
UPDATE users SET is_owner = false
WHERE is_owner AND id <> (
    SELECT id FROM users WHERE is_owner ORDER BY created_at ASC LIMIT 1
);
CREATE UNIQUE INDEX users_single_owner ON users (is_owner) WHERE is_owner;
-- +goose StatementEnd

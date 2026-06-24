-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT false;

-- Existing installs: promote the earliest-created (non-deleted) admin to owner
-- so the "only the owner manages admins" rule has a holder after this migration.
UPDATE users SET is_owner = true
WHERE id = (
    SELECT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.slug = 'admin' AND u.status <> 'deleted'
    ORDER BY u.created_at ASC
    LIMIT 1
);

-- There is at most one owner.
CREATE UNIQUE INDEX users_single_owner ON users (is_owner) WHERE is_owner;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS users_single_owner;
ALTER TABLE users DROP COLUMN is_owner;
-- +goose StatementEnd

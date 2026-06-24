-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX users_created_by_idx ON users(created_by);

INSERT INTO permissions (slug, description)
VALUES ('users:read_all', 'see and manage all users, not only those you created');

-- admin already holds every permission; grant the new one explicitly so the
-- admin role keeps "see everything" after this migration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug = 'admin' AND p.slug = 'users:read_all';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id = (SELECT id FROM permissions WHERE slug = 'users:read_all');
DELETE FROM permissions WHERE slug = 'users:read_all';
DROP INDEX users_created_by_idx;
ALTER TABLE users DROP COLUMN created_by;
-- +goose StatementEnd

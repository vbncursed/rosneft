-- +goose Up
-- +goose StatementBegin
INSERT INTO permissions (slug, description)
VALUES ('audit:read', 'read the audit journal');

-- Company Owner reads its own company's history. Root needs no grant: the
-- gateway lets an owner bypass every route permission, and the journal's scope
-- resolver keys off the owner flag rather than a permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'audit:read'
WHERE r.slug = 'admin';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id =
    (SELECT id FROM permissions WHERE slug = 'audit:read');
DELETE FROM permissions WHERE slug = 'audit:read';
-- +goose StatementEnd

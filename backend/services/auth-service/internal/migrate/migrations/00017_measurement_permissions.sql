-- +goose Up
-- +goose StatementBegin
-- Saved ruler chains are a shared annotation on a territory, gated like
-- placements: everyone who opens the territory reads them, the scene roles
-- (Company Owner, Scene Editor) create, change and delete them. Custom roles
-- get nothing automatically, as with every earlier grant.
INSERT INTO permissions (slug, description) VALUES
    ('measurement:read',   'read measurements'),
    ('measurement:create', 'create measurements'),
    ('measurement:write',  'update measurements'),
    ('measurement:delete', 'delete measurements');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'measurement:read'
WHERE r.slug IN ('admin', 'owner', 'editor', 'viewer', 'guest');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('measurement:create', 'measurement:write', 'measurement:delete')
WHERE r.slug IN ('admin', 'editor');

-- Creation has been territory:create's since 00007; the description still
-- claimed it for territory:write.
UPDATE permissions SET description = 'update territories' WHERE slug = 'territory:write';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
UPDATE permissions SET description = 'create/update territories' WHERE slug = 'territory:write';
DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug LIKE 'measurement:%');
DELETE FROM permissions WHERE slug LIKE 'measurement:%';
-- +goose StatementEnd

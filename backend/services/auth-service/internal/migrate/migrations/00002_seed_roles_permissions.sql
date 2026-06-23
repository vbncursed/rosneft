-- +goose Up
-- +goose StatementBegin
INSERT INTO permissions (slug, description) VALUES
    ('territory:read','read territories'),
    ('territory:write','create/update territories'),
    ('territory:delete','delete territories'),
    ('model:read','read models'),
    ('model:write','create/update models'),
    ('model:delete','delete models'),
    ('placement:read','read placements'),
    ('placement:write','create/update placements'),
    ('placement:delete','delete placements'),
    ('panorama:read','read panoramas'),
    ('panorama:write','create/update panoramas'),
    ('panorama:delete','delete panoramas'),
    ('upload:create','create chunked uploads'),
    ('users:read','read users'),
    ('users:write','create/update users'),
    ('users:freeze','freeze/unfreeze users'),
    ('users:delete','soft-delete/restore users'),
    ('roles:read','read roles'),
    ('roles:manage','create/update/delete roles and their permissions'),
    ('permissions:read','read the permission catalog');

INSERT INTO roles (slug, title, is_system) VALUES
    ('admin','Administrator',TRUE),
    ('owner','People & Roles Manager',TRUE),
    ('editor','Scene Editor',TRUE),
    ('viewer','Viewer',TRUE);

-- admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'admin';

-- owner: people + roles + all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('users:read','users:write','users:freeze','users:delete',
               'roles:read','roles:manage','permissions:read',
               'territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'owner';

-- editor: scene work + all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('placement:write','placement:delete','panorama:write','panorama:delete',
               'territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'editor';

-- viewer: all reads.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'viewer';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions;
DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE is_system);
DELETE FROM roles WHERE is_system;
DELETE FROM permissions;
-- +goose StatementEnd

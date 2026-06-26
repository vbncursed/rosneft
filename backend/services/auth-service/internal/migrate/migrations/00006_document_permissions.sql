-- +goose Up
-- +goose StatementBegin
INSERT INTO permissions (slug, description) VALUES
    ('document:read','read documents'),
    ('document:write','create/update documents'),
    ('document:delete','delete documents');

-- admin + editor get full document control. admin's permission set was a
-- one-time snapshot in 00002, so new permissions must be granted explicitly.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('document:read','document:write','document:delete')
WHERE r.slug IN ('admin','editor');

-- owner + viewer get read-only, matching their content access.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug = 'document:read'
WHERE r.slug IN ('owner','viewer');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug LIKE 'document:%');
DELETE FROM permissions WHERE slug LIKE 'document:%';
-- +goose StatementEnd

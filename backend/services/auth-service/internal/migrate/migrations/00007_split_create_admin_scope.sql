-- +goose Up
-- +goose StatementBegin
-- Split "create" from "edit" for the resources that have both a create (POST)
-- and an edit (PUT/PATCH) route. After this, ':write' gates only edits and the
-- new ':create' gates creation. model/document have no edit route, so their
-- ':write' stays the create gate and is left untouched.
INSERT INTO permissions (slug, description) VALUES
    ('territory:create','create territories'),
    ('placement:create','create placements'),
    ('panorama:create','create panoramas');

-- Preserve current creation ability: every role that could create via ':write'
-- keeps it via ':create'. Only admin is held back from 'territory:create' —
-- territory/model creation becomes owner-only (owners create via the gateway's
-- owner bypass, not via any role permission).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('placement:create','panorama:create')
WHERE r.slug IN ('admin','editor');

-- admin becomes "Company Owner": keeps edit/delete on every resource, but loses
-- creation of territories (withheld above) and models, and is scoped to the
-- users it created (loses users:read_all).
UPDATE roles SET title = 'Company Owner' WHERE slug = 'admin';
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE slug = 'admin')
  AND permission_id IN (SELECT id FROM permissions WHERE slug IN ('model:write','users:read_all'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
UPDATE roles SET title = 'Administrator' WHERE slug = 'admin';
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
    ON p.slug IN ('model:write','users:read_all')
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug IN ('territory:create','placement:create','panorama:create'));
DELETE FROM permissions WHERE slug IN ('territory:create','placement:create','panorama:create');
-- +goose StatementEnd

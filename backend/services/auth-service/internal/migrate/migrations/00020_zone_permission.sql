-- +goose Up
-- +goose StatementBegin
-- Site zones and site-plan calibration are written by the scene roles only:
-- Company Owner (admin) and Scene Editor (editor), as measurement writes are.
-- Custom roles get nothing automatically, as with every earlier grant.
INSERT INTO permissions (slug, description) VALUES
    ('zone:write', 'create, change and delete site zones and calibrate site plans');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'zone:write'
WHERE r.slug IN ('admin', 'editor');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id IN
    (SELECT id FROM permissions WHERE slug = 'zone:write');
DELETE FROM permissions WHERE slug = 'zone:write';
-- +goose StatementEnd

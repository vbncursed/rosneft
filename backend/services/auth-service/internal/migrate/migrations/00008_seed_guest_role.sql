-- +goose Up
-- +goose StatementBegin
-- Guest: a view-only role (same reads as viewer) whose visibility is scoped to
-- territories assigned directly to the guest, not inherited from a tenant admin.
-- The login flow keys a guest's territory scope to their own user id.
INSERT INTO roles (slug, title, is_system) VALUES ('guest','Guest',TRUE);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
    p.slug IN ('territory:read','model:read','placement:read','panorama:read')
WHERE r.slug = 'guest';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE slug = 'guest');
DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE slug = 'guest');
DELETE FROM roles WHERE slug = 'guest';
-- +goose StatementEnd

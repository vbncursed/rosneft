-- +goose Up
-- +goose StatementBegin
-- Seeing what was done under your own account is not the same authority as
-- reading the company's history: audit:read stays with the Company Owner, this
-- one narrows the journal to the caller's own actions. The gateway's AuditScope
-- pins the actor; the permission only opens the door.
--
-- guest is deliberately left out: a guest barely acts, and the page would be
-- empty for them.
INSERT INTO permissions (slug, description)
VALUES ('audit:read_own', 'read your own actions in the audit journal');

-- admin and owner get it too, and not for their own sake: both manage users, and
-- the no-privilege-escalation rule refuses to let anyone grant a permission they
-- do not hold. Without this a Company Owner could no longer create a viewer at
-- all — "you cannot grant access you do not have yourself: audit:read_own".
--
-- It costs them nothing either way: audit:read already shows them their own
-- actions among the company's, and AuditScope prefers the wider grant.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'audit:read_own'
WHERE r.slug IN ('editor', 'viewer', 'admin', 'owner');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM role_permissions WHERE permission_id =
    (SELECT id FROM permissions WHERE slug = 'audit:read_own');
DELETE FROM permissions WHERE slug = 'audit:read_own';
-- +goose StatementEnd

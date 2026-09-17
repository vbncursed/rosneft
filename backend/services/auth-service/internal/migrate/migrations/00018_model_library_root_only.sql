-- +goose Up
-- +goose StatementBegin
-- The model library is shared by every tenant, so changing it is Root's alone,
-- through the owner bypass rather than any role grant. 00007 already took
-- model:write from the Company Owner; model:delete stayed, and with it the
-- power to remove a model other companies use (a model still placed is refused
-- by the foreign key, an unused one was not). Company Owners keep model:read
-- and keep placing models.
--
-- After this no system role holds model:write or model:delete, and neither does
-- a custom role a tenant made (owner_admin_id set): a Company Owner could hand
-- model:delete to one while they still held it. Roles Root made carry no
-- owner_admin_id and keep what Root gave them.
--
-- role_permissions carries the audit trigger, so each removed grant files an
-- entry with no actor, like every seed change made by a migration.
DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE slug IN ('model:write', 'model:delete'))
  AND role_id IN (
      SELECT id FROM roles WHERE slug = 'admin' OR owner_admin_id IS NOT NULL
  );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Restores the Company Owner's grant only: which tenant roles held the model
-- grants is not recorded anywhere but the audit journal.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug = 'model:delete'
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;
-- +goose StatementEnd

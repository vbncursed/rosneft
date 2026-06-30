-- +goose Up
-- +goose StatementBegin
-- Scope custom roles to the group that created them. owner_admin_id holds the
-- creator's owning admin (tenant). System roles and Root-created roles keep it
-- NULL, meaning "global — visible to everyone".
ALTER TABLE roles ADD COLUMN owner_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX roles_owner_admin_idx ON roles(owner_admin_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX roles_owner_admin_idx;
ALTER TABLE roles DROP COLUMN owner_admin_id;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- When the password last changed, NULL for one never changed since creation.
--
-- It exists so the journal can see a password change at all: audit_capture()
-- redacts password_hash and ignores updated_at, so an UPDATE touching only
-- those two compared equal and was dropped as a no-op. This column is neither
-- redacted nor ignored, so the change is recorded as a user.update.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN password_changed_at;
-- +goose StatementEnd

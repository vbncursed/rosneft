-- +goose Up
-- 2FA state moved to twofa-service. Assumes no enrolled users on this deploy
-- (confirmed); no data copy. Run AFTER twofa-service is up + migrated.
ALTER TABLE users DROP COLUMN totp_enabled;
ALTER TABLE users DROP COLUMN totp_secret;
DROP TABLE recovery_codes;

-- +goose Down
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_secret BYTEA;
CREATE TABLE recovery_codes (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at   TIMESTAMPTZ
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

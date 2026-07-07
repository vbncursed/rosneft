-- +goose Up
-- WebAuthn login rejects an assertion whose Backup Eligible flag differs from
-- the stored credential, so BE (fixed for life) and BS (mutable) must persist.
ALTER TABLE passkey_credentials
    ADD COLUMN backup_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN backup_state    BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE passkey_credentials
    DROP COLUMN backup_eligible,
    DROP COLUMN backup_state;

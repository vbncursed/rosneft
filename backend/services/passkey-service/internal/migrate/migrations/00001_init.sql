-- +goose Up
-- passkey-service owns WebAuthn credentials; user_id is auth's id (no FK).
CREATE TABLE passkey_credentials (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        TEXT NOT NULL,
    credential_id  BYTEA NOT NULL UNIQUE,
    public_key     BYTEA NOT NULL,
    sign_count     BIGINT NOT NULL DEFAULT 0,
    transports     TEXT NOT NULL DEFAULT '',
    aaguid         BYTEA,
    name           TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at   TIMESTAMPTZ
);
CREATE INDEX passkey_credentials_user_idx ON passkey_credentials (user_id);

-- +goose Down
DROP TABLE passkey_credentials;

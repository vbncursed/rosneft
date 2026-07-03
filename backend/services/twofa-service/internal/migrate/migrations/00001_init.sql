-- +goose Up
-- twofa-service owns 2FA state; user_id is auth's user id (no cross-context FK).
CREATE TABLE twofa_credentials (
    user_id    TEXT PRIMARY KEY,
    secret     BYTEA,
    enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE twofa_recovery_codes (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at   TIMESTAMPTZ
);
CREATE INDEX twofa_recovery_codes_user_idx ON twofa_recovery_codes (user_id);

-- +goose Down
DROP TABLE twofa_recovery_codes;
DROP TABLE twofa_credentials;

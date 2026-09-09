-- +goose Up
-- When 2FA actually went on, so the account screen can say "added <date>".
-- Rows enrolled before this migration keep NULL: the moment was never recorded
-- and a guessed date is worse than a missing line.
ALTER TABLE twofa_credentials ADD COLUMN enabled_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE twofa_credentials DROP COLUMN enabled_at;

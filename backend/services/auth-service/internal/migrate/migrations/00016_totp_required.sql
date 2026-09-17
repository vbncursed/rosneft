-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN totp_required BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN totp_required;
-- +goose StatementEnd

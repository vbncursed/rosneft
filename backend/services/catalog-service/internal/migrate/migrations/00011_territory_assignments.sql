-- +goose Up
-- +goose StatementBegin
CREATE TABLE territory_assignments (
    territory_id  BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    admin_user_id UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (territory_id, admin_user_id)
);
CREATE INDEX idx_territory_assignments_admin ON territory_assignments(admin_user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE territory_assignments;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- Per-panorama default camera yaw (radians, world-space atan2(dirX, dirZ);
-- 0 = +Z = current hardcoded look direction). The viewer faces this heading
-- when the panorama opens. NOT NULL DEFAULT 0 keeps existing panoramas facing
-- +Z exactly as before, so no scan NULL-handling is needed. Table DDL is owned
-- by catalog-service even though content-service owns the read/write SQL.
ALTER TABLE panoramas
    ADD COLUMN default_yaw DOUBLE PRECISION NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE panoramas
    DROP COLUMN default_yaw;
-- +goose StatementEnd

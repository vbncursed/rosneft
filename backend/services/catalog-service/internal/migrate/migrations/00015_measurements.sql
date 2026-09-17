-- +goose Up
-- +goose StatementBegin
-- Saved ruler chains. Points live in the territory's normalised scene space,
-- like placement positions, and are flat (x0,y0,z0,x1,…) so the source-replace
-- rescale can multiply every element by one factor and the CHECK can enforce
-- the shape: whole points, at least two, at least three when closed.
CREATE TABLE measurements (
    id            BIGSERIAL PRIMARY KEY,
    territory_id  BIGINT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
    points        DOUBLE PRECISION[] NOT NULL,
    closed        BOOLEAN NOT NULL DEFAULT FALSE,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT measurements_points_shape CHECK (
        cardinality(points) >= 6 AND cardinality(points) % 3 = 0
        AND (NOT closed OR cardinality(points) >= 9)
    )
);
CREATE INDEX idx_measurements_territory ON measurements(territory_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS measurements;
-- +goose StatementEnd

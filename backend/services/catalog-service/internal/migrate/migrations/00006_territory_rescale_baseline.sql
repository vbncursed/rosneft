-- +goose Up
-- +goose StatementBegin
-- Bridges the async gap when a territory's 3D source is replaced. On replace,
-- the gateway records the OLD source-mesh max-dimension here before clearing
-- the artifacts; once the new mesh converts, the worker reads it to rescale
-- existing placements 1:1 against the new normalization, then clears it.
-- NULL = no rescale pending (the steady state).
ALTER TABLE territories
    ADD COLUMN rescale_baseline_max DOUBLE PRECISION;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE territories
    DROP COLUMN rescale_baseline_max;
-- +goose StatementEnd

-- +goose Up
-- +goose StatementBegin
-- The old source mesh's bbox center, recorded beside rescale_baseline_max when
-- a source is replaced. Normalization is s = (p - c)·2/M, so a replacement
-- whose bbox center moved shifts every scene-space coordinate by (c - c')·2/M'
-- on top of the M/M' scale; with M alone the rescale kept sizes but let
-- positions drift. NULL (a baseline captured before this column existed)
-- reads as "no shift", which completes such a replace scale-only, as before.
ALTER TABLE territories
    ADD COLUMN rescale_baseline_center_x DOUBLE PRECISION,
    ADD COLUMN rescale_baseline_center_y DOUBLE PRECISION,
    ADD COLUMN rescale_baseline_center_z DOUBLE PRECISION;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE territories
    DROP COLUMN rescale_baseline_center_x,
    DROP COLUMN rescale_baseline_center_y,
    DROP COLUMN rescale_baseline_center_z;
-- +goose StatementEnd

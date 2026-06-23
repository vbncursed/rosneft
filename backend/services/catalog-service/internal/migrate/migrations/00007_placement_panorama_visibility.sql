-- +goose Up
-- +goose StatementBegin
-- Per-placement panorama allowlist. A placement is shown in panorama mode
-- only for the panorama ids listed here; the 3D view always shows every
-- placement regardless. Empty = hidden in all panoramas. Stored as an array
-- column (not a join table) because it is a small display-preference set
-- read inline on the SceneBundle hot path and written in one statement.
ALTER TABLE placements
    ADD COLUMN visible_panorama_ids BIGINT[] NOT NULL DEFAULT '{}';
-- +goose StatementEnd

-- +goose StatementBegin
-- Backfill preserves the pre-feature behaviour where every placement was
-- visible in every panorama: each existing placement becomes visible in all
-- panoramas of its own territory, so nothing disappears on deploy. Placements
-- whose territory has no panoramas keep the empty default.
UPDATE placements pl
SET visible_panorama_ids = sub.ids
FROM (
    SELECT pl2.id AS placement_id,
           array_agg(pa.id) AS ids
    FROM placements pl2
    JOIN panoramas pa ON pa.territory_id = pl2.territory_id
    GROUP BY pl2.id
) sub
WHERE pl.id = sub.placement_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE placements
    DROP COLUMN visible_panorama_ids;
-- +goose StatementEnd

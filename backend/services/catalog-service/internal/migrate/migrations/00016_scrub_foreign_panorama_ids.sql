-- +goose Up
-- +goose StatementBegin
-- Until c5ec5e1d, POST .../placements accepted any panorama ids, so an
-- allowlist could name another territory's panoramas — or ids that no longer
-- exist at all, since the panorama delete scrubs only its own territory. Keep,
-- in their original order, only the ids of panoramas on the placement's own
-- territory.
--
-- The WHERE clause is an audit constraint, as in auth's 00014: placements
-- carries audit_capture(), so only rows that actually change are rewritten,
-- and each files one placement.update entry with no actor — this runs outside
-- audittx.Run. That attribution to nobody is the right one: no user made the
-- change. No migration here disables the trigger to stay quiet: a journal
-- with a silent gap is worse than entries attributed to nobody.
--
-- Idempotent: a second run finds nothing to change.
UPDATE placements pl
SET visible_panorama_ids = ARRAY(
    SELECT v.id
    FROM unnest(pl.visible_panorama_ids) WITH ORDINALITY AS v(id, ord)
    JOIN panoramas pa ON pa.id = v.id AND pa.territory_id = pl.territory_id
    ORDER BY v.ord
)
WHERE EXISTS (
    SELECT 1
    FROM unnest(pl.visible_panorama_ids) AS v(id)
    LEFT JOIN panoramas pa ON pa.id = v.id AND pa.territory_id = pl.territory_id
    WHERE pa.id IS NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1; -- irreversible: the removed ids pointed at nothing this placement can show
-- +goose StatementEnd

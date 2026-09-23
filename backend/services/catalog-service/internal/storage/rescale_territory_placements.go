package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RescaleTerritoryPlacements applies a pending rescale baseline in one atomic
// statement. The converter normalizes s = (p − c)·2/M (c = bbox center, M =
// max axis), so old scene space maps to the new one by
// s' = s·(M/M') + (c − c')·2/M'. That is applied to every placement position,
// measurement point (flat x,y,z triples) and panorama anchor; placement scale
// takes the factor alone; rotations and yaw do not change (normalization does
// not rotate). The baseline is cleared in the same statement, so a retried
// call finds nothing pending and cannot apply twice. The name predates
// measurements and panoramas; mesh-worker calls it, so it stays.
//
// Assumes the old and new sources share one coordinate frame (a re-scan of
// the same site in the same georeference). A NULL baseline center — captured
// before the center columns existed — shifts nothing, which completes that
// replace scale-only, as it was captured to be.
//
// When no baseline is pending it matches no rows and returns 0. The epsilon
// guard skips the writes when the factor is indistinguishable from 1 and the
// shift from 0 (an identical re-scan) while still clearing the baseline via
// the always-executed `cleared` CTE. A non-positive newMax is a defensive
// no-op that leaves the baseline intact for a later valid conversion. Returns
// the number of placements changed.
//
// Wrapped in audittx.Run because it writes placements, measurements,
// panoramas and territories, all audited. mesh-worker calls it with no actor
// on ctx, so the entries are attributed to the system — correct, since no
// human moved anything. panoramas is content-service's to write, but its DDL
// is catalog's and the database is shared; doing it here keeps the whole
// mapping in one transaction.
func (r *PG) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64, newCenter domain.Vec3) (int, error) {
	if newMax <= 0 {
		return 0, nil
	}
	const q = `
		WITH base AS (
			SELECT id,
			       rescale_baseline_max / $2 AS k,
			       (COALESCE(rescale_baseline_center_x, $3) - $3) * 2 / $2 AS ox,
			       (COALESCE(rescale_baseline_center_y, $4) - $4) * 2 / $2 AS oy,
			       (COALESCE(rescale_baseline_center_z, $5) - $5) * 2 / $2 AS oz
			FROM territories
			WHERE slug = $1 AND rescale_baseline_max IS NOT NULL
			FOR UPDATE
		),
		moved AS (
			SELECT * FROM base
			WHERE abs(k - 1) >= 1e-9 OR abs(ox) >= 1e-9 OR abs(oy) >= 1e-9 OR abs(oz) >= 1e-9
		),
		upd AS (
			UPDATE placements p SET
				position_x = p.position_x * b.k + b.ox,
				position_y = p.position_y * b.k + b.oy,
				position_z = p.position_z * b.k + b.oz,
				scale_x    = p.scale_x * b.k,
				scale_y    = p.scale_y * b.k,
				scale_z    = p.scale_z * b.k,
				updated_at = NOW()
			FROM moved b
			WHERE p.territory_id = b.id
			RETURNING p.id
		),
		measured AS (
			UPDATE measurements m SET
				points = ARRAY(
					SELECT v * b.k + CASE (i - 1) % 3 WHEN 0 THEN b.ox WHEN 1 THEN b.oy ELSE b.oz END
					FROM unnest(m.points) WITH ORDINALITY AS u(v, i)
					ORDER BY i
				),
				updated_at = NOW()
			FROM moved b
			WHERE m.territory_id = b.id
		),
		panned AS (
			UPDATE panoramas pn SET
				position_x = pn.position_x * b.k + b.ox,
				position_y = pn.position_y * b.k + b.oy,
				position_z = pn.position_z * b.k + b.oz,
				updated_at = NOW()
			FROM moved b
			WHERE pn.territory_id = b.id
		),
		cleared AS (
			UPDATE territories t SET
				rescale_baseline_max      = NULL,
				rescale_baseline_center_x = NULL,
				rescale_baseline_center_y = NULL,
				rescale_baseline_center_z = NULL
			FROM base b
			WHERE t.id = b.id
		)
		SELECT count(*) FROM upd`

	var updated int
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, q, slug, newMax, newCenter.X, newCenter.Y, newCenter.Z).Scan(&updated)
	})
	if err != nil {
		return 0, fmt.Errorf("storage.RescaleTerritoryPlacements: %w", err)
	}
	return updated, nil
}

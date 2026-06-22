package storage

import (
	"context"
	"fmt"
)

// RescaleTerritoryPlacements applies a pending rescale baseline in one atomic
// statement: it multiplies every placement's position and scale by
// old_max / newMax and clears the baseline. Position and scale are both linear
// in the territory's normalization, so the single factor keeps each placed
// object 1:1 (same real-world size and location) against the freshly converted
// mesh.
//
// When no baseline is pending (first conversions, re-runs) it matches no rows
// and returns 0. The epsilon guard skips the placement write when the factor is
// indistinguishable from 1 (an identical re-scan) while still clearing the
// baseline via the always-executed `cleared` CTE. A non-positive newMax is a
// defensive no-op that leaves the baseline intact for a later valid conversion.
// Returns the number of placements changed.
func (r *PG) RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64) (int, error) {
	if newMax <= 0 {
		return 0, nil
	}
	const q = `
		WITH base AS (
			SELECT id, rescale_baseline_max AS old_max
			FROM territories
			WHERE slug = $1
			FOR UPDATE
		),
		upd AS (
			UPDATE placements p SET
				position_x = p.position_x * (b.old_max / $2),
				position_y = p.position_y * (b.old_max / $2),
				position_z = p.position_z * (b.old_max / $2),
				scale_x    = p.scale_x    * (b.old_max / $2),
				scale_y    = p.scale_y    * (b.old_max / $2),
				scale_z    = p.scale_z    * (b.old_max / $2),
				updated_at = NOW()
			FROM base b
			WHERE p.territory_id = b.id
			  AND b.old_max IS NOT NULL
			  AND abs(b.old_max / $2 - 1) >= 1e-9
			RETURNING p.id
		),
		cleared AS (
			UPDATE territories t SET rescale_baseline_max = NULL
			FROM base b
			WHERE t.id = b.id AND b.old_max IS NOT NULL
			RETURNING t.id
		)
		SELECT count(*) FROM upd`

	var updated int
	if err := r.pool.QueryRow(ctx, q, slug, newMax).Scan(&updated); err != nil {
		return 0, fmt.Errorf("storage.RescaleTerritoryPlacements: %w", err)
	}
	return updated, nil
}

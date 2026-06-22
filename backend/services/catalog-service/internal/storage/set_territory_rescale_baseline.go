package storage

import (
	"context"
	"fmt"
)

// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension so a post-replacement re-conversion can rescale placements to
// the new normalization. It writes only when no baseline is already pending,
// so a chain of replaces (each clearing artifacts before the next lands)
// preserves the earliest pre-replacement dimension. An unknown slug matches no
// rows and is a no-op.
func (r *PG) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64) error {
	const q = `
		UPDATE territories
		SET rescale_baseline_max = $2
		WHERE slug = $1 AND rescale_baseline_max IS NULL`

	if _, err := r.pool.Exec(ctx, q, slug, sourceMax); err != nil {
		return fmt.Errorf("storage.SetTerritoryRescaleBaseline: %w", err)
	}
	return nil
}

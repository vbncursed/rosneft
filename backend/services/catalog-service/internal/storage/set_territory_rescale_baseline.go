package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension and bbox center so a post-replacement re-conversion can map
// placements onto the new normalization. It writes only when no baseline is
// already pending, so a chain of replaces (each clearing artifacts before the
// next lands) preserves the earliest pre-replacement mesh — all four values
// together. An unknown slug matches no rows and is a no-op.
//
// Wrapped in audittx.Run because it writes to territories, an audited table;
// audit_capture() ignores these columns, so it files no entry of its own.
func (r *PG) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64, center domain.Vec3) error {
	const q = `
		UPDATE territories
		SET rescale_baseline_max      = $2,
		    rescale_baseline_center_x = $3,
		    rescale_baseline_center_y = $4,
		    rescale_baseline_center_z = $5
		WHERE slug = $1 AND rescale_baseline_max IS NULL`

	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		_, execErr := tx.Exec(ctx, q, slug, sourceMax, center.X, center.Y, center.Z)
		return execErr
	})
	if err != nil {
		return fmt.Errorf("storage.SetTerritoryRescaleBaseline: %w", err)
	}
	return nil
}

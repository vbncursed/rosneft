package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// SetPlacementPanoramaLabel upserts (or, when label is empty, removes) a
// placement's name within one panorama, then returns the placement scoped to
// its territory with labels attached. The write is scoped to the territory so
// a placement id from elsewhere can't be labelled; an unknown placement yields
// ErrPlacementNotFound from the final read.
func (r *PG) SetPlacementPanoramaLabel(ctx context.Context, territorySlug string, placementID, panoramaID int64, label string) (domain.Placement, error) {
	if err := r.writePanoramaLabel(ctx, territorySlug, placementID, panoramaID, label); err != nil {
		return domain.Placement{}, err
	}
	return r.getPlacementInTerritory(ctx, territorySlug, placementID)
}

func (r *PG) writePanoramaLabel(ctx context.Context, territorySlug string, placementID, panoramaID int64, label string) error {
	if label == "" {
		const del = `
			DELETE FROM placement_panorama_label ppl
			USING placements pl, territories t
			WHERE ppl.placement_id = $2 AND ppl.panorama_id = $3
				AND pl.id = ppl.placement_id AND t.id = pl.territory_id AND t.slug = $1`
		if _, err := r.pool.Exec(ctx, del, territorySlug, placementID, panoramaID); err != nil {
			return fmt.Errorf("storage.SetPlacementPanoramaLabel: delete: %w", err)
		}
		return nil
	}

	const up = `
		INSERT INTO placement_panorama_label (placement_id, panorama_id, label)
		SELECT pl.id, $3, $4
		FROM placements pl
		JOIN territories t ON t.id = pl.territory_id
		WHERE pl.id = $2 AND t.slug = $1
		ON CONFLICT (placement_id, panorama_id) DO UPDATE SET label = EXCLUDED.label`
	if _, err := r.pool.Exec(ctx, up, territorySlug, placementID, panoramaID, label); err != nil {
		return fmt.Errorf("storage.SetPlacementPanoramaLabel: upsert: %w", err)
	}
	return nil
}

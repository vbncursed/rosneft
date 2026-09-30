package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// ListPanoramaPhases answers the three phases of territorySlug in display
// order, prior → current → post, each with its hidden flag; a phase with no
// stored row is shown. It does not ask whether the territory exists: the
// gateway's gate and the scene bundle's own territory read answer "not
// found", so an unknown one reads as three shown phases.
func (r *PG) ListPanoramaPhases(ctx context.Context, territorySlug string) ([]domain.PanoramaPhaseVisibility, error) {
	const q = `
		SELECT v.phase, v.hidden
		FROM panorama_phase_visibility v JOIN territories t ON t.id = v.territory_id
		WHERE t.slug = $1`

	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramaPhases: query: %w", err)
	}
	stored, err := pgx.CollectRows(rows, pgx.RowToStructByPos[domain.PanoramaPhaseVisibility])
	if err != nil {
		return nil, fmt.Errorf("storage.ListPanoramaPhases: scan: %w", err)
	}

	out := make([]domain.PanoramaPhaseVisibility, len(domain.PanoramaPhases))
	for i, phase := range domain.PanoramaPhases {
		out[i].Phase = phase
		for _, v := range stored {
			if v.Phase == phase {
				out[i].Hidden = v.Hidden
			}
		}
	}
	return out, nil
}

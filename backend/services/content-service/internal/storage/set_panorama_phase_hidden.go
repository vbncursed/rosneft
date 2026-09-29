package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// SetPanoramaPhaseHidden sets phase's shared hidden flag on territorySlug, an
// upsert on (territory_id, phase), and answers the stored flag. An unknown
// territory inserts nothing and is ErrTerritoryNotFound.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) SetPanoramaPhaseHidden(ctx context.Context, territorySlug string, phase domain.PanoramaPhase, hidden bool) (domain.PanoramaPhaseVisibility, error) {
	const q = `
		INSERT INTO panorama_phase_visibility (territory_id, phase, hidden)
		SELECT t.id, $2, $3 FROM territories t WHERE t.slug = $1
		ON CONFLICT (territory_id, phase) DO UPDATE SET hidden = EXCLUDED.hidden
		RETURNING phase, hidden`

	var out domain.PanoramaPhaseVisibility
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, q, territorySlug, string(phase), hidden).Scan(&out.Phase, &out.Hidden)
	})
	switch {
	case err == nil:
		return out, nil
	case errors.Is(err, pgx.ErrNoRows):
		return domain.PanoramaPhaseVisibility{}, domain.ErrTerritoryNotFound
	}
	return domain.PanoramaPhaseVisibility{}, fmt.Errorf("storage.SetPanoramaPhaseHidden: %w", err)
}

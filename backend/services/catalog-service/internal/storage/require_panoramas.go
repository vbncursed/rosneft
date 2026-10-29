package storage

import (
	"context"
	"fmt"
	"maps"
	"slices"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// requirePanoramas fails with ErrInvalidInput unless every panorama the batch
// names is anchored to its territory, and keeps those rows from being deleted
// until tx ends (FOR SHARE).
//
// The service checks the same allowlists before the write, but a panorama can
// go in between and the delete's scrub (content-service) cannot reach a
// placement that is not committed yet, so the id would stay in
// visible_panorama_ids for good, and the SPA sends it back with every later
// visibility edit, which the service then refuses. A delete already running
// holds its row: this waits for it and finds the panorama gone.
//
// shortcut: a delete that starts after this lock but whose scrub statement
// snapshot predates the commit still misses the new rows; closing that needs
// content-service's DeletePanorama to take the lock first.
func requirePanoramas(ctx context.Context, tx pgx.Tx, territorySlug string, ps []domain.Placement) error {
	named := map[int64]struct{}{}
	for _, p := range ps {
		for _, id := range p.VisiblePanoramaIDs {
			named[id] = struct{}{}
		}
	}
	if len(named) == 0 {
		return nil
	}
	want := slices.Sorted(maps.Keys(named))
	rows, err := tx.Query(ctx, `SELECT pa.id FROM panoramas pa JOIN territories t ON t.id = pa.territory_id
		WHERE t.slug = $1 AND pa.id = ANY($2) FOR SHARE OF pa`, territorySlug, want)
	if err != nil {
		return fmt.Errorf("lock panoramas: %w", err)
	}
	have, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return fmt.Errorf("lock panoramas: %w", err)
	}
	for _, id := range want {
		if !slices.Contains(have, id) {
			return fmt.Errorf("%w: panorama %d is not on territory %q", domain.ErrInvalidInput, id, territorySlug)
		}
	}
	return nil
}

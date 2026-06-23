package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// placementLabels returns one placement's per-panorama names, ordered by
// panorama id for a stable response.
func (r *PG) placementLabels(ctx context.Context, placementID int64) ([]domain.PanoramaLabel, error) {
	const q = `SELECT panorama_id, label
		FROM placement_panorama_label
		WHERE placement_id = $1
		ORDER BY panorama_id`
	rows, err := r.pool.Query(ctx, q, placementID)
	if err != nil {
		return nil, fmt.Errorf("storage.placementLabels: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.PanoramaLabel, 0, 4)
	for rows.Next() {
		var l domain.PanoramaLabel
		if err := rows.Scan(&l.PanoramaID, &l.Label); err != nil {
			return nil, fmt.Errorf("storage.placementLabels: scan: %w", err)
		}
		out = append(out, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.placementLabels: iter: %w", err)
	}
	return out, nil
}

// attachLabels fills a single placement's PanoramaLabels in place. Used by the
// single-return mutation paths so an optimistic client never wipes existing
// names when it swaps in the server-acknowledged placement.
func (r *PG) attachLabels(ctx context.Context, p *domain.Placement) error {
	labels, err := r.placementLabels(ctx, p.ID)
	if err != nil {
		return err
	}
	p.PanoramaLabels = labels
	return nil
}

// labelsByTerritory batch-fetches every placement's labels on a territory in
// one round-trip, keyed by placement id — the ListPlacements stitch avoids an
// N+1 on the SceneBundle hot path.
func (r *PG) labelsByTerritory(ctx context.Context, territorySlug string) (map[int64][]domain.PanoramaLabel, error) {
	const q = `SELECT ppl.placement_id, ppl.panorama_id, ppl.label
		FROM placement_panorama_label ppl
		JOIN placements pl  ON pl.id = ppl.placement_id
		JOIN territories t  ON t.id = pl.territory_id
		WHERE t.slug = $1
		ORDER BY ppl.placement_id, ppl.panorama_id`
	rows, err := r.pool.Query(ctx, q, territorySlug)
	if err != nil {
		return nil, fmt.Errorf("storage.labelsByTerritory: query: %w", err)
	}
	defer rows.Close()

	out := map[int64][]domain.PanoramaLabel{}
	for rows.Next() {
		var pid int64
		var l domain.PanoramaLabel
		if err := rows.Scan(&pid, &l.PanoramaID, &l.Label); err != nil {
			return nil, fmt.Errorf("storage.labelsByTerritory: scan: %w", err)
		}
		out[pid] = append(out[pid], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.labelsByTerritory: iter: %w", err)
	}
	return out, nil
}

// getPlacementInTerritory loads a single placement scoped to its territory
// (ErrPlacementNotFound when the id is absent or belongs elsewhere), with its
// per-panorama labels attached.
func (r *PG) getPlacementInTerritory(ctx context.Context, territorySlug string, placementID int64) (domain.Placement, error) {
	const q = `SELECT ` + placementSelectCols + `
		FROM ` + placementJoin + `
		WHERE t.slug = $1 AND pl.id = $2`
	row := r.pool.QueryRow(ctx, q, territorySlug, placementID)
	out, err := scanPlacement(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Placement{}, domain.ErrPlacementNotFound
		}
		return domain.Placement{}, fmt.Errorf("storage.getPlacementInTerritory: %w", err)
	}
	if err := r.attachLabels(ctx, &out); err != nil {
		return domain.Placement{}, err
	}
	return out, nil
}

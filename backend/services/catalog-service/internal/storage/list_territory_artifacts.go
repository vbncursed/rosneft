package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListTerritoryArtifacts returns every artifact for a territory ordered by
// LOD ascending. An unknown territory yields ErrTerritoryNotFound rather
// than an empty list.
func (r *PG) ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if _, err := r.GetTerritory(ctx, slug); err != nil {
		return nil, err
	}

	const q = `SELECT ` + artifactSelectCols + `
		FROM territory_artifacts a
		JOIN territories t ON t.id = a.territory_id
		WHERE t.slug = $1
		ORDER BY a.lod`

	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryArtifacts: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Artifact, 0)
	for rows.Next() {
		a, err := scanArtifact(rows, slug)
		if err != nil {
			return nil, fmt.Errorf("storage.ListTerritoryArtifacts: scan: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListTerritoryArtifacts: iter: %w", err)
	}
	return out, nil
}

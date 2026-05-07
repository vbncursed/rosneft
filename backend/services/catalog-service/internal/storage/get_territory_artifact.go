package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetTerritoryArtifact returns a single territory artifact at the given LOD.
func (r *PG) GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if _, err := r.GetTerritory(ctx, slug); err != nil {
		return domain.Artifact{}, err
	}

	const q = `SELECT ` + artifactSelectCols + `
		FROM territory_artifacts a
		JOIN territories t ON t.id = a.territory_id
		WHERE t.slug = $1 AND a.lod = $2`

	row := r.pool.QueryRow(ctx, q, slug, lod)
	a, err := scanArtifact(row, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Artifact{}, domain.ErrArtifactNotFound
		}
		return domain.Artifact{}, fmt.Errorf("storage.GetTerritoryArtifact: %w", err)
	}
	return a, nil
}

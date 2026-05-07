package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetModelArtifact returns a single model artifact at the given LOD.
func (r *PG) GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	if _, err := r.GetModel(ctx, slug); err != nil {
		return domain.Artifact{}, err
	}

	const q = `SELECT ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN models m ON m.id = a.model_id
		WHERE m.slug = $1 AND a.lod = $2`

	row := r.pool.QueryRow(ctx, q, slug, lod)
	a, err := scanArtifact(row, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Artifact{}, domain.ErrArtifactNotFound
		}
		return domain.Artifact{}, fmt.Errorf("storage.GetModelArtifact: %w", err)
	}
	return a, nil
}

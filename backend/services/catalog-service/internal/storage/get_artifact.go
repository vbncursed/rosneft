package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetArtifact returns the artifact for (slug, lod) or domain.ErrArtifactNotFound.
func (r *PG) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	const q = `
		SELECT ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN projects p ON p.id = a.project_id
		WHERE p.slug = $1 AND a.lod = $2`
	row := r.pool.QueryRow(ctx, q, slug, lod)
	out, err := scanArtifact(row, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Artifact{}, domain.ErrArtifactNotFound
		}
		return domain.Artifact{}, fmt.Errorf("storage.GetArtifact: %w", err)
	}
	return out, nil
}

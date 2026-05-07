package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModelArtifacts returns every artifact for a model ordered by LOD.
func (r *PG) ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	if _, err := r.GetModel(ctx, slug); err != nil {
		return nil, err
	}

	const q = `SELECT ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN models m ON m.id = a.model_id
		WHERE m.slug = $1
		ORDER BY a.lod`

	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListModelArtifacts: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Artifact, 0)
	for rows.Next() {
		a, err := scanArtifact(rows, slug)
		if err != nil {
			return nil, fmt.Errorf("storage.ListModelArtifacts: scan: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListModelArtifacts: iter: %w", err)
	}
	return out, nil
}

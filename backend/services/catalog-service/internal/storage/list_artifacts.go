package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListArtifacts returns every artifact for a project, ordered by LOD ascending.
func (r *PG) ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	const q = `
		SELECT ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN projects p ON p.id = a.project_id
		WHERE p.slug = $1
		ORDER BY a.lod`
	rows, err := r.pool.Query(ctx, q, slug)
	if err != nil {
		return nil, fmt.Errorf("storage.ListArtifacts: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Artifact, 0)
	for rows.Next() {
		a, err := scanArtifact(rows, slug)
		if err != nil {
			return nil, fmt.Errorf("storage.ListArtifacts: scan: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListArtifacts: iter: %w", err)
	}
	return out, nil
}

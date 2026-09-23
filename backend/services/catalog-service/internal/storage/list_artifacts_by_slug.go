package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// The list pages' LOD chains: every row of a page in one query, keyed through
// the unique (…_id, lod) index. Matched by slug rather than id because a listed
// row carries no id; the slug is unique and indexed too.
const (
	territoryArtifactsBySlug = `SELECT t.slug, ` + artifactSelectCols + `
		FROM territory_artifacts a
		JOIN territories t ON t.id = a.territory_id
		WHERE t.slug = ANY($1)
		ORDER BY a.lod`
	modelArtifactsBySlug = `SELECT m.slug, ` + artifactSelectCols + `
		FROM model_artifacts a
		JOIN models m ON m.id = a.model_id
		WHERE m.slug = ANY($1)
		ORDER BY a.lod`
)

// artifactsBySlug runs q for every slug at once and groups the rows by owner.
// ORDER BY lod keeps each owner's chain sorted as it is appended.
func (r *PG) artifactsBySlug(ctx context.Context, q string, slugs []string) (map[string][]domain.Artifact, error) {
	rows, err := r.pool.Query(ctx, q, slugs)
	if err != nil {
		return nil, fmt.Errorf("artifacts by slug: query: %w", err)
	}
	defer rows.Close()

	out := make(map[string][]domain.Artifact, len(slugs))
	for rows.Next() {
		var a domain.Artifact
		if err := rows.Scan(&a.Slug,
			&a.LOD, &a.Hash, &a.ContentType, &a.Size, &a.Vertices, &a.Faces,
			&a.BBoxMin.X, &a.BBoxMin.Y, &a.BBoxMin.Z,
			&a.BBoxMax.X, &a.BBoxMax.Y, &a.BBoxMax.Z,
			&a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("artifacts by slug: scan: %w", err)
		}
		out[a.Slug] = append(out[a.Slug], a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("artifacts by slug: iter: %w", err)
	}
	return out, nil
}

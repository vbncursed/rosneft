package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterModelArtifact upserts a model artifact at the given LOD. Re-runs
// of the conversion pipeline overwrite the existing row.
func (r *PG) RegisterModelArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	const q = `
		WITH m AS (SELECT id FROM models WHERE slug = $1)
		INSERT INTO model_artifacts (
			model_id, lod, hash, content_type, size_bytes, vertices, faces,
			bbox_min_x, bbox_min_y, bbox_min_z,
			bbox_max_x, bbox_max_y, bbox_max_z
		)
		SELECT m.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 FROM m
		ON CONFLICT (model_id, lod) DO UPDATE SET
			hash         = EXCLUDED.hash,
			content_type = EXCLUDED.content_type,
			size_bytes   = EXCLUDED.size_bytes,
			vertices     = EXCLUDED.vertices,
			faces        = EXCLUDED.faces,
			bbox_min_x   = EXCLUDED.bbox_min_x,
			bbox_min_y   = EXCLUDED.bbox_min_y,
			bbox_min_z   = EXCLUDED.bbox_min_z,
			bbox_max_x   = EXCLUDED.bbox_max_x,
			bbox_max_y   = EXCLUDED.bbox_max_y,
			bbox_max_z   = EXCLUDED.bbox_max_z,
			created_at   = NOW()
		RETURNING ` + artifactReturningCols

	row := r.pool.QueryRow(ctx, q,
		a.Slug, a.LOD, a.Hash, a.ContentType, a.Size, a.Vertices, a.Faces,
		a.BBoxMin.X, a.BBoxMin.Y, a.BBoxMin.Z,
		a.BBoxMax.X, a.BBoxMax.Y, a.BBoxMax.Z,
	)
	out, err := scanArtifact(row, a.Slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Artifact{}, domain.ErrModelNotFound
		}
		return domain.Artifact{}, fmt.Errorf("storage.RegisterModelArtifact: %w", err)
	}
	return out, nil
}

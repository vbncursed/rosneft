package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterModelArtifact upserts a model artifact at the given LOD. Re-runs
// of the conversion pipeline overwrite the existing row. The plain_artifacts
// mapping is written as in RegisterTerritoryArtifact; the returned PlainHash is
// what this call recorded.
func (r *PG) RegisterModelArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	const q = `
		WITH m AS (SELECT id FROM models WHERE slug = $1),
		ins AS (
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
			RETURNING ` + artifactReturningCols + `
		),
		pl AS (
			INSERT INTO plain_artifacts (lod0_hash, plain_hash)
			SELECT hash, $14::text FROM ins WHERE lod = 0 AND $14::text <> ''
			ON CONFLICT (lod0_hash) DO UPDATE SET plain_hash = EXCLUDED.plain_hash, created_at = now()
			RETURNING plain_hash
		)
		SELECT ` + artifactReturningCols + `, COALESCE((SELECT plain_hash FROM pl), '') FROM ins`

	row := r.pool.QueryRow(ctx, q,
		a.Slug, a.LOD, a.Hash, a.ContentType, a.Size, a.Vertices, a.Faces,
		a.BBoxMin.X, a.BBoxMin.Y, a.BBoxMin.Z,
		a.BBoxMax.X, a.BBoxMax.Y, a.BBoxMax.Z,
		a.PlainHash,
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

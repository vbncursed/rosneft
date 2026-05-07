package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// RegisterArtifact inserts or updates an artifact. Idempotent on (project_slug, lod):
// repeated calls overwrite metadata atomically. Returns domain.ErrProjectNotFound if
// the project does not exist.
func (r *PG) RegisterArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error) {
	// CTE looks up the project ID; an empty CTE causes 0 rows inserted, which
	// surfaces as pgx.ErrNoRows below and maps to ErrProjectNotFound.
	const q = `
		WITH p AS (SELECT id FROM projects WHERE slug = $1)
		INSERT INTO model_artifacts (
			project_id, lod, hash, content_type, size_bytes, vertices, faces,
			bbox_min_x, bbox_min_y, bbox_min_z,
			bbox_max_x, bbox_max_y, bbox_max_z
		)
		SELECT p.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13 FROM p
		ON CONFLICT (project_id, lod) DO UPDATE SET
			hash = EXCLUDED.hash,
			content_type = EXCLUDED.content_type,
			size_bytes = EXCLUDED.size_bytes,
			vertices = EXCLUDED.vertices,
			faces = EXCLUDED.faces,
			bbox_min_x = EXCLUDED.bbox_min_x,
			bbox_min_y = EXCLUDED.bbox_min_y,
			bbox_min_z = EXCLUDED.bbox_min_z,
			bbox_max_x = EXCLUDED.bbox_max_x,
			bbox_max_y = EXCLUDED.bbox_max_y,
			bbox_max_z = EXCLUDED.bbox_max_z
		RETURNING ` + artifactReturningCols
	row := r.pool.QueryRow(ctx, q,
		a.ProjectSlug, a.LOD, a.Hash, a.ContentType, a.Size, a.Vertices, a.Faces,
		a.BBoxMin.X, a.BBoxMin.Y, a.BBoxMin.Z,
		a.BBoxMax.X, a.BBoxMax.Y, a.BBoxMax.Z,
	)
	out, err := scanArtifact(row, a.ProjectSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Artifact{}, domain.ErrProjectNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign_key_violation
			return domain.Artifact{}, domain.ErrProjectNotFound
		}
		return domain.Artifact{}, fmt.Errorf("storage.RegisterArtifact: %w", err)
	}
	return out, nil
}

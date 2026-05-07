package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// UpsertProject inserts or updates a project keyed by slug.
func (r *PG) UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error) {
	const q = `
		INSERT INTO projects (
			slug, title, subtitle, description,
			source_obj_path, source_mtl_path, source_texture_path
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (slug) DO UPDATE SET
			title = EXCLUDED.title,
			subtitle = EXCLUDED.subtitle,
			description = EXCLUDED.description,
			source_obj_path = EXCLUDED.source_obj_path,
			source_mtl_path = EXCLUDED.source_mtl_path,
			source_texture_path = EXCLUDED.source_texture_path,
			updated_at = NOW()
		RETURNING ` + projectColumns
	row := r.pool.QueryRow(ctx, q,
		p.Slug, p.Title, p.Subtitle, p.Description,
		p.SourceObjPath, p.SourceMtlPath, p.SourceTexturePath,
	)
	out, err := scanProject(row)
	if err != nil {
		return domain.Project{}, fmt.Errorf("storage.UpsertProject: %w", err)
	}
	return out, nil
}

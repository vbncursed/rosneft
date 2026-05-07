package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// GetProject returns a project by slug or domain.ErrProjectNotFound.
func (r *PG) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	const q = `SELECT ` + projectColumns + ` FROM projects WHERE slug = $1`
	row := r.pool.QueryRow(ctx, q, slug)
	out, err := scanProject(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Project{}, domain.ErrProjectNotFound
		}
		return domain.Project{}, fmt.Errorf("storage.GetProject: %w", err)
	}
	return out, nil
}

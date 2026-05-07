package storage

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListProjects returns every project, sorted by slug.
func (r *PG) ListProjects(ctx context.Context) ([]domain.Project, error) {
	const q = `SELECT ` + projectColumns + ` FROM projects ORDER BY slug`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("storage.ListProjects: query: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Project, 0)
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, fmt.Errorf("storage.ListProjects: scan: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage.ListProjects: iter: %w", err)
	}
	return out, nil
}

package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// ListModelTags returns the whole fixed tag list in id (seed) order; the
// service orders it for display.
func (r *PG) ListModelTags(ctx context.Context) ([]domain.ModelTag, error) {
	return r.queryTags(ctx, `SELECT id, slug, title FROM model_tags ORDER BY id`)
}

// ResolveModelTags returns the tags whose slug is in slugs. A slug naming no
// tag is absent from the answer, so the caller can tell which one was unknown.
func (r *PG) ResolveModelTags(ctx context.Context, slugs []string) ([]domain.ModelTag, error) {
	return r.queryTags(ctx, `SELECT id, slug, title FROM model_tags WHERE slug = ANY($1) ORDER BY id`, slugs)
}

func (r *PG) queryTags(ctx context.Context, q string, args ...any) ([]domain.ModelTag, error) {
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("storage.queryTags: %w", err)
	}
	tags, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.ModelTag, error) {
		var t domain.ModelTag
		err := row.Scan(&t.ID, &t.Slug, &t.Title)
		return t, err
	})
	if err != nil {
		return nil, fmt.Errorf("storage.queryTags: %w", err)
	}
	return tags, nil
}

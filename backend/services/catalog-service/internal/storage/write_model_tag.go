package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/pkg/audittx"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// CreateModelTag adds a tag. A slug or title another tag already has is
// ErrInvalidInput.
//
// Wrapped in audittx.Run so the audit trigger can attribute the insert.
func (r *PG) CreateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	const q = `INSERT INTO model_tags (slug, title) VALUES ($1, $2) RETURNING id, slug, title`
	tag, err := r.writeModelTag(ctx, q, slug, title)
	if err != nil {
		return domain.ModelTag{}, fmt.Errorf("storage.CreateModelTag: %w", err)
	}
	return tag, nil
}

// UpdateModelTag retitles the tag with slug; the slug itself never changes.
// An unknown slug is ErrModelTagNotFound, a title another tag has is
// ErrInvalidInput.
//
// Wrapped in audittx.Run so the audit trigger can attribute the change.
func (r *PG) UpdateModelTag(ctx context.Context, slug, title string) (domain.ModelTag, error) {
	const q = `UPDATE model_tags SET title = $2, updated_at = NOW() WHERE slug = $1 RETURNING id, slug, title`
	tag, err := r.writeModelTag(ctx, q, slug, title)
	if err != nil {
		return domain.ModelTag{}, fmt.Errorf("storage.UpdateModelTag: %w", err)
	}
	return tag, nil
}

func (r *PG) writeModelTag(ctx context.Context, q, slug, title string) (domain.ModelTag, error) {
	var tag domain.ModelTag
	err := audittx.Run(ctx, r.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, q, slug, title).Scan(&tag.ID, &tag.Slug, &tag.Title)
	})
	if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == pgUniqueViolation {
		return domain.ModelTag{}, fmt.Errorf(
			"%w: a model tag with this slug or title already exists",
			domain.ErrInvalidInput,
		)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ModelTag{}, domain.ErrModelTagNotFound
	}
	return tag, err
}

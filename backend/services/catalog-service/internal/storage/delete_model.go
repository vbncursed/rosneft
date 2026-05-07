package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// DeleteModel removes a model by slug. Refuses to delete a model that is
// still referenced by placements (FK ON DELETE RESTRICT) — callers must
// remove the placements first.
func (r *PG) DeleteModel(ctx context.Context, slug string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM models WHERE slug = $1`, slug)
	if err != nil {
		if pgErr, ok := errors.AsType[*pgconn.PgError](err); ok && pgErr.Code == "23503" { // foreign_key_violation
			return fmt.Errorf("storage.DeleteModel: %w: model is in use by placements", domain.ErrInvalidInput)
		}
		return fmt.Errorf("storage.DeleteModel: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrModelNotFound
	}
	return nil
}

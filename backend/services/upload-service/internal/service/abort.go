package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Abort discards an in-progress session. Idempotent: aborting a non-existent
// session is a no-op (returns nil).
func (u *Upload) Abort(ctx context.Context, id string) error {
	if id == "" {
		return domain.ErrSessionNotFound
	}
	return u.store.Abort(ctx, id)
}

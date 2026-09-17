package service

import (
	"context"
	"errors"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Abort discards owner's in-progress session. Idempotent: aborting a session
// that no longer exists is a no-op (returns nil). Another user's session is
// left alone and reported as not found.
func (u *Upload) Abort(ctx context.Context, owner, id string) error {
	if id == "" {
		return domain.ErrSessionNotFound
	}
	s, err := u.store.GetStatus(ctx, id)
	switch {
	case errors.Is(err, domain.ErrSessionNotFound):
		return nil
	case err != nil:
		return err
	case !owns(s, owner):
		return domain.ErrSessionNotFound
	}
	return u.store.Abort(ctx, id)
}

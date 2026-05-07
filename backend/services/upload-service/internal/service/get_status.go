package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// GetStatus returns the current offset for a session so a client can resume
// after a network failure (tus HEAD).
func (u *Upload) GetStatus(ctx context.Context, id string) (domain.Session, error) {
	if id == "" {
		return domain.Session{}, domain.ErrSessionNotFound
	}
	return u.store.GetStatus(ctx, id)
}

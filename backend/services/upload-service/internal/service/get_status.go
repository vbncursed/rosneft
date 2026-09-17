package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// GetStatus returns the current offset of owner's session so a client can
// resume after a network failure (tus HEAD).
func (u *Upload) GetStatus(ctx context.Context, owner, id string) (domain.Session, error) {
	return u.ownedSession(ctx, owner, id)
}

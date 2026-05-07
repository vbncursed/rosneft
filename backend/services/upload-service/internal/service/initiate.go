package service

import (
	"context"
	"fmt"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Initiate creates a new upload session and returns its server-assigned ID.
// The size cap is enforced here: a request larger than maxUploadBytes is
// rejected before we touch the filesystem.
func (u *Upload) Initiate(ctx context.Context, size int64, contentType string) (domain.Session, error) {
	if size <= 0 {
		return domain.Session{}, fmt.Errorf("%w: size must be positive", domain.ErrInvalidInput)
	}
	if u.maxUploadBytes > 0 && size > u.maxUploadBytes {
		return domain.Session{}, fmt.Errorf("%w: size %d exceeds max %d", domain.ErrInvalidInput, size, u.maxUploadBytes)
	}
	id := u.idGen()
	return u.store.Initiate(ctx, id, size, contentType)
}

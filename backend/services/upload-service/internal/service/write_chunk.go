package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// WriteChunk appends data to a session at the given offset and returns the
// new total. Out-of-order writes and writes beyond the declared size are
// rejected by the underlying store.
func (u *Upload) WriteChunk(ctx context.Context, id string, offset int64, data []byte) (int64, error) {
	if id == "" {
		return 0, domain.ErrSessionNotFound
	}
	return u.store.AppendChunk(ctx, id, offset, data)
}

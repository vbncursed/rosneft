package service

import (
	"context"
	"fmt"
	"io"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Finalize closes a session, hashes the bytes, and moves them into BlobStore.
// Refuses to finalize a session whose Offset != Size (caller is expected to
// finish the upload first via WriteChunk).
func (u *Upload) Finalize(ctx context.Context, id string) (domain.FinalizedBlob, error) {
	if id == "" {
		return domain.FinalizedBlob{}, domain.ErrSessionNotFound
	}
	s, err := u.store.GetStatus(ctx, id)
	if err != nil {
		return domain.FinalizedBlob{}, err
	}
	if s.Offset != s.Size {
		return domain.FinalizedBlob{}, fmt.Errorf("%w: offset=%d, size=%d", domain.ErrInvalidInput, s.Offset, s.Size)
	}
	hash, size, err := u.store.Finalize(ctx, id, func(ctx context.Context, hash string, r io.Reader) error {
		_, err := u.blobs.Put(ctx, hash, s.ContentType, r)
		return err
	})
	if err != nil {
		return domain.FinalizedBlob{}, err
	}
	return domain.FinalizedBlob{Hash: hash, Size: size}, nil
}

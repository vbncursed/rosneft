package service

import (
	"bufio"
	"context"
	"fmt"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/fileheader"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Finalize closes a session, hashes the bytes, and moves them into BlobStore.
// Refuses to finalize a session whose Offset != Size (caller is expected to
// finish the upload first via WriteChunk). When the session declared
// application/pdf, the blob's leading bytes must be the PDF magic number — this
// is the only content type we hard-validate, so ZIP/image uploads are
// unaffected.
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
		if s.ContentType == "application/pdf" {
			br := bufio.NewReader(r)
			head, _ := br.Peek(5) // Peek never consumes; short reads return what's available.
			if !fileheader.IsPDF(head) {
				return fmt.Errorf("%w: not a PDF", domain.ErrInvalidInput)
			}
			r = br
		}
		_, err := u.blobs.Put(ctx, hash, s.ContentType, r)
		return err
	})
	if err != nil {
		return domain.FinalizedBlob{}, err
	}
	return domain.FinalizedBlob{Hash: hash, Size: size}, nil
}

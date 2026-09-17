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
// unaffected. The hash is then recorded for owner, which is what lets owner —
// and nobody who merely learned the hash — attach it to a territory or model.
func (u *Upload) Finalize(ctx context.Context, owner, id string) (domain.FinalizedBlob, error) {
	s, err := u.ownedSession(ctx, owner, id)
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
	// The marker is written after the blob is published and after the store
	// has removed the session directory. If writing it fails, the bytes are
	// safe in BlobStore but the session is gone: a retried finalize answers
	// 404 and the client uploads the file again. Nothing is lost; the author
	// just cannot attach the hash until an upload records it.
	if err == nil {
		err = u.store.RecordUpload(ctx, hash, owner)
	}
	if err != nil {
		metricUploads.WithLabelValues("failed").Inc()
		return domain.FinalizedBlob{}, err
	}
	metricUploads.WithLabelValues("succeeded").Inc()
	metricUploadBytes.Add(float64(size))
	return domain.FinalizedBlob{Hash: hash, Size: size}, nil
}

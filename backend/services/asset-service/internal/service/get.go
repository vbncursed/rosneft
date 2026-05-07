package service

import (
	"context"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

// Get returns a reader for the blob's content along with metadata.
// Caller MUST close the reader.
func (a *Asset) Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error) {
	return a.store.Get(ctx, hash)
}

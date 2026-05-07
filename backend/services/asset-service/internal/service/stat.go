package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

// Stat returns metadata for the blob with the given hash.
func (a *Asset) Stat(ctx context.Context, hash string) (blobstore.Blob, error) {
	return a.store.Stat(ctx, hash)
}

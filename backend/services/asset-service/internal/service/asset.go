// Package service is the asset business layer. One method per file —
// this file holds the Store contract and the Asset constructor.
package service

import (
	"context"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

//go:generate minimock -i Store -o ./mocks -s _mock.go

// Store is what the asset service needs from the BlobStore.
type Store interface {
	Stat(ctx context.Context, hash string) (blobstore.Blob, error)
	Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error)
}

// Asset is the asset service.
type Asset struct {
	store Store
}

// New wraps a Store.
func New(store Store) *Asset {
	return &Asset{store: store}
}

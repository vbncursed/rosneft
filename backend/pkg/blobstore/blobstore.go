// Package blobstore is a content-addressed binary store used by mesh-worker
// to write artifacts (GLB, JPG previews) and by asset-service to serve them.
//
// The Store interface is satisfied by FS (local filesystem) today. An S3
// implementation can be added without touching callers.
package blobstore

import (
	"context"
	"errors"
	"io"
)

// ErrNotFound is returned when the blob does not exist.
var ErrNotFound = errors.New("blobstore: blob not found")

// Blob carries metadata about a stored binary artifact.
type Blob struct {
	Hash        string `json:"hash"`         // content hash (caller-provided, hex), used as cache key
	ContentType string `json:"content_type"` // e.g. "model/gltf-binary"
	Size        int64  `json:"size"`         // bytes
}

// Store is a content-addressed binary store.
type Store interface {
	// Put writes content from r and returns the resulting blob. Hash MUST be
	// a non-empty hex string; the caller is responsible for computing it.
	Put(ctx context.Context, hash, contentType string, r io.Reader) (Blob, error)

	// Get returns a reader for the blob's content along with metadata.
	// Caller MUST close the reader. Returns ErrNotFound if missing.
	Get(ctx context.Context, hash string) (io.ReadCloser, Blob, error)

	// Stat returns metadata only. Returns ErrNotFound if missing.
	Stat(ctx context.Context, hash string) (Blob, error)

	// Exists is a fast existence check.
	Exists(ctx context.Context, hash string) (bool, error)

	// Delete removes a blob. Returns nil if the blob did not exist.
	Delete(ctx context.Context, hash string) error
}

// Package service is the upload-service business layer. The gRPC transport
// translates each tus operation into one of these methods. One method per
// file — this file holds the contracts and the constructor.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// SessionStore is what Upload needs from the on-disk session manager.
type SessionStore interface {
	Initiate(ctx context.Context, id string, size int64, contentType string) (domain.Session, error)
	AppendChunk(ctx context.Context, id string, offset int64, data []byte) (int64, error)
	GetStatus(ctx context.Context, id string) (domain.Session, error)
	Finalize(ctx context.Context, id string, putBlob func(ctx context.Context, hash string, r io.Reader) error) (string, int64, error)
	Abort(ctx context.Context, id string) error
}

// Blobs is what Finalize uses to publish the finalized bytes into the
// content-addressed store.
type Blobs interface {
	Put(ctx context.Context, hash, contentType string, r io.Reader) (blobstore.Blob, error)
}

// Upload is the upload service.
type Upload struct {
	store          SessionStore
	blobs          Blobs
	maxUploadBytes int64
	idGen          func() string
}

// Config wires Upload's dependencies.
type Config struct {
	Store          SessionStore
	Blobs          Blobs
	MaxUploadBytes int64
	IDGen          func() string
}

// New constructs an Upload service. IDGen defaults to a 128-bit hex
// generator when nil is passed.
func New(cfg Config) *Upload {
	gen := cfg.IDGen
	if gen == nil {
		gen = newSessionID
	}
	return &Upload{
		store:          cfg.Store,
		blobs:          cfg.Blobs,
		maxUploadBytes: cfg.MaxUploadBytes,
		idGen:          gen,
	}
}

// newSessionID returns a 128-bit hex ID.
func newSessionID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

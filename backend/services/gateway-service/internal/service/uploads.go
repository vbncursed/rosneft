package service

import (
	"context"
	"fmt"
	"io"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// InitiateUpload starts a new chunked-upload session.
func (g *Gateway) InitiateUpload(ctx context.Context, size int64, contentType string) (domain.UploadSession, error) {
	if size <= 0 {
		return domain.UploadSession{}, fmt.Errorf("%w: size must be positive", domain.ErrInvalidInput)
	}
	return g.upload.Initiate(ctx, size, contentType)
}

// AppendUploadChunk forwards a tus PATCH body to the upload-service.
func (g *Gateway) AppendUploadChunk(ctx context.Context, id string, offset int64, body io.Reader) (int64, error) {
	if id == "" {
		return 0, fmt.Errorf("%w: empty upload id", domain.ErrInvalidInput)
	}
	if offset < 0 {
		return 0, fmt.Errorf("%w: negative offset", domain.ErrInvalidInput)
	}
	return g.upload.WriteChunk(ctx, id, offset, body)
}

// GetUploadStatus reports the current offset and declared size.
func (g *Gateway) GetUploadStatus(ctx context.Context, id string) (domain.UploadSession, error) {
	if id == "" {
		return domain.UploadSession{}, fmt.Errorf("%w: empty upload id", domain.ErrInvalidInput)
	}
	return g.upload.GetStatus(ctx, id)
}

// FinalizeUpload closes the session and publishes the bytes to BlobStore.
func (g *Gateway) FinalizeUpload(ctx context.Context, id string) (domain.FinalizedBlob, error) {
	if id == "" {
		return domain.FinalizedBlob{}, fmt.Errorf("%w: empty upload id", domain.ErrInvalidInput)
	}
	return g.upload.Finalize(ctx, id)
}

// AbortUpload discards an in-progress session. Idempotent.
func (g *Gateway) AbortUpload(ctx context.Context, id string) error {
	if id == "" {
		return nil // tus DELETE is idempotent — empty id is just a no-op
	}
	return g.upload.Abort(ctx, id)
}

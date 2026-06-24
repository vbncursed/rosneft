package upload

import (
	"context"
	"errors"
	"fmt"
	"io"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Initiate creates a new session for the given size and content type.
func (c *Client) Initiate(ctx context.Context, size int64, contentType string) (domain.UploadSession, error) {
	resp, err := c.cc.Initiate(ctx, &uploadv1.InitiateRequest{Size: size, ContentType: contentType})
	if err != nil {
		return domain.UploadSession{}, fmt.Errorf("upload.Initiate: %w", err)
	}
	return domain.UploadSession{ID: resp.GetUploadId(), Size: size, ContentType: contentType}, nil
}

// WriteChunk pushes one tus PATCH body up to the upload-service as a
// client-streaming gRPC, splitting the input into ~64KB proto messages.
const chunkChunkSize = 64 * 1024

// WriteChunk streams body to the upload-service and returns the new total
// offset reported by the server.
func (c *Client) WriteChunk(ctx context.Context, id string, offset int64, body io.Reader) (int64, error) {
	stream, err := c.cc.WriteChunk(ctx)
	if err != nil {
		return 0, fmt.Errorf("upload.WriteChunk: open stream: %w", err)
	}

	cur := offset
	buf := make([]byte, chunkChunkSize)
	for {
		n, readErr := body.Read(buf)
		if n > 0 {
			payload := make([]byte, n)
			copy(payload, buf[:n])
			if err := stream.Send(&uploadv1.WriteChunkRequest{
				UploadId: id,
				Offset:   cur,
				Data:     payload,
			}); err != nil {
				return 0, fmt.Errorf("upload.WriteChunk: send: %w", err)
			}
			cur += int64(n)
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			return 0, fmt.Errorf("upload.WriteChunk: read: %w", readErr)
		}
	}
	resp, err := stream.CloseAndRecv()
	if err != nil {
		return 0, fmt.Errorf("upload.WriteChunk: close: %w", grpcerr.MapStatus(err, domain.ErrUploadNotFound))
	}
	return resp.GetOffset(), nil
}

// GetStatus returns the current offset for the session.
func (c *Client) GetStatus(ctx context.Context, id string) (domain.UploadSession, error) {
	resp, err := c.cc.GetStatus(ctx, &uploadv1.GetStatusRequest{UploadId: id})
	if err != nil {
		return domain.UploadSession{}, fmt.Errorf("upload.GetStatus: %w", grpcerr.MapStatus(err, domain.ErrUploadNotFound))
	}
	return domain.UploadSession{ID: id, Size: resp.GetSize(), Offset: resp.GetOffset()}, nil
}

// Finalize closes the session and returns the published blob hash.
func (c *Client) Finalize(ctx context.Context, id string) (domain.FinalizedBlob, error) {
	resp, err := c.cc.Finalize(ctx, &uploadv1.FinalizeRequest{UploadId: id})
	if err != nil {
		return domain.FinalizedBlob{}, fmt.Errorf("upload.Finalize: %w", grpcerr.MapStatus(err, domain.ErrUploadNotFound))
	}
	return domain.FinalizedBlob{Hash: resp.GetBlobHash(), Size: resp.GetSize()}, nil
}

// Abort discards an in-progress session.
func (c *Client) Abort(ctx context.Context, id string) error {
	_, err := c.cc.Abort(ctx, &uploadv1.AbortRequest{UploadId: id})
	if err != nil {
		return fmt.Errorf("upload.Abort: %w", err)
	}
	return nil
}

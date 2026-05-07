package grpcapi

import (
	"errors"
	"io"

	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
)

// WriteChunk consumes a client-streaming RPC: each ChunkRequest carries an
// upload_id, the absolute offset at which it starts, and a payload of bytes.
// All chunks in one stream must target the same upload_id; switching mid-
// stream is rejected. Returns the total bytes received after the final
// chunk so the gateway can drive the tus Upload-Offset response.
func (s *Server) WriteChunk(stream uploadv1.UploadService_WriteChunkServer) error {
	var (
		uploadID string
		offset   int64
	)
	for {
		req, err := stream.Recv()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return stream.SendAndClose(&uploadv1.WriteChunkResponse{Offset: offset})
			}
			return mapError(err)
		}
		if uploadID == "" {
			uploadID = req.GetUploadId()
		} else if req.GetUploadId() != uploadID {
			return mapError(errMixedUploadIDs)
		}
		newOffset, err := s.svc.WriteChunk(stream.Context(), req.GetUploadId(), req.GetOffset(), req.GetData())
		if err != nil {
			return mapError(err)
		}
		offset = newOffset
	}
}

var errMixedUploadIDs = errors.New("upload: mixed upload_id within one stream")

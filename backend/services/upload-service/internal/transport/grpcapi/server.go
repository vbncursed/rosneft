// Package grpcapi exposes the upload service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper.
package grpcapi

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
	uploadv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/upload/v1"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// Service is the upload-service surface this transport calls. owner is the
// caller's user id, taken from the x-actor-id metadata the gateway sends.
type Service interface {
	Initiate(ctx context.Context, owner string, size int64, contentType string) (domain.Session, error)
	WriteChunk(ctx context.Context, owner, id string, offset int64, data []byte) (int64, error)
	GetStatus(ctx context.Context, owner, id string) (domain.Session, error)
	Finalize(ctx context.Context, owner, id string) (domain.FinalizedBlob, error)
	Abort(ctx context.Context, owner, id string) error
	HasUploaded(ctx context.Context, owner, hash string) (bool, error)
}

// Server implements uploadv1.UploadServiceServer over a Service.
type Server struct {
	uploadv1.UnimplementedUploadServiceServer
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// Register registers the server on the provided grpc.Server.
func (s *Server) Register(srv *grpc.Server) {
	uploadv1.RegisterUploadServiceServer(srv, s)
}

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput, domain.ErrOffsetMismatch, domain.ErrSizeExceeded},
	codes.NotFound:        {domain.ErrSessionNotFound},
}

// callerID is the user behind the request. The actor interceptor lifted it
// from metadata; empty when the caller sent none, which the service refuses.
func callerID(ctx context.Context) string { return grpcutil.ActorFromContext(ctx).ID }

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }

// Package grpcapi exposes the audit service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper. Proto<->domain converters
// live in converters.go.
package grpcapi

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Service is the audit surface this transport calls.
type Service interface {
	List(ctx context.Context, f domain.Filter) ([]domain.Entry, int64, error)
	Actors(ctx context.Context, f domain.Filter) ([]string, error)
	Record(ctx context.Context, e domain.Entry) (int64, error)
}

// Server implements auditv1.AuditServiceServer over a Service.
type Server struct {
	auditv1.UnimplementedAuditServiceServer
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server { return &Server{svc: svc} }

// Register registers the server on the provided grpc.Server.
func (s *Server) Register(srv *grpc.Server) {
	auditv1.RegisterAuditServiceServer(srv, s)
}

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput},
}

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }

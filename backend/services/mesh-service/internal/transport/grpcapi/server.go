// Package grpcapi exposes the mesh service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper. Proto<->domain converters
// live in converters.go.
package grpcapi

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// Service is the mesh-service surface this transport calls. ProcessJob is
// driven by the worker, not the API, so it is intentionally absent here.
type Service interface {
	SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)
}

// Server implements meshv1.MeshServiceServer over a Service.
type Server struct {
	meshv1.UnimplementedMeshServiceServer
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// Register registers the server on the provided grpc.Server.
func (s *Server) Register(srv *grpc.Server) {
	meshv1.RegisterMeshServiceServer(srv, s)
}

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput},
	codes.NotFound:        {domain.ErrJobNotFound, domain.ErrTargetNotFound},
}

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }

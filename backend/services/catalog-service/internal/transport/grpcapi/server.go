// Package grpcapi exposes the catalog service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper. Proto<->domain converters
// live in converters.go.
package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Service is the catalog surface this transport calls.
type Service interface {
	UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error)
	GetProject(ctx context.Context, slug string) (domain.Project, error)
	ListProjects(ctx context.Context) ([]domain.Project, error)

	RegisterArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)

	ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error
}

// Server implements catalogv1.CatalogServiceServer over a Service.
type Server struct {
	catalogv1.UnimplementedCatalogServiceServer
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// Register registers the server on the provided grpc.Server.
func (s *Server) Register(srv *grpc.Server) {
	catalogv1.RegisterCatalogServiceServer(srv, s)
}

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, domain.ErrInvalidInput), errors.Is(err, domain.ErrSelfPlacement):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, domain.ErrProjectNotFound),
		errors.Is(err, domain.ErrArtifactNotFound),
		errors.Is(err, domain.ErrPlacementNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Errorf(codes.Internal, "internal: %v", err)
	}
}

// Package grpcapi exposes the catalog service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper. Proto<->domain converters
// live in converters.go.
package grpcapi

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Service is the catalog surface this transport calls.
type Service interface {
	UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error)
	GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error)
	ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error)
	DeleteTerritory(ctx context.Context, slug string) error
	SetTerritoryAdmins(ctx context.Context, slug string, adminIDs []string) error
	GetTerritoryAdmins(ctx context.Context, slug string) ([]string, error)
	RegisterTerritoryArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	DeleteTerritoryArtifacts(ctx context.Context, slug string) error
	SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64) error
	RescaleTerritoryPlacements(ctx context.Context, slug string, newMax float64) (int, error)

	UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error)
	GetModel(ctx context.Context, slug string) (domain.Model, error)
	ListModels(ctx context.Context) ([]domain.Model, error)
	DeleteModel(ctx context.Context, slug string) error
	RegisterModelArtifact(ctx context.Context, a domain.Artifact) (domain.Artifact, error)
	GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)

	ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error)
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

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput},
	codes.NotFound: {
		domain.ErrTerritoryNotFound,
		domain.ErrModelNotFound,
		domain.ErrArtifactNotFound,
		domain.ErrPlacementNotFound,
	},
}

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }

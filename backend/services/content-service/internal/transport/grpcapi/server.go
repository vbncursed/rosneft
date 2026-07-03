// Package grpcapi exposes the content service over gRPC. One method per file.
// This file holds only the Service contract, the Server struct, gRPC
// registration, and the centralized error mapper. Proto<->domain converters
// live in converters.go.
package grpcapi

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// Service is the content surface this transport calls.
type Service interface {
	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error

	ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error)
	CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error)
	DeleteDocument(ctx context.Context, id int64) error
}

// Server implements contentv1.ContentServiceServer over a Service.
type Server struct {
	contentv1.UnimplementedContentServiceServer
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// Register registers the server on the provided grpc.Server.
func (s *Server) Register(srv *grpc.Server) {
	contentv1.RegisterContentServiceServer(srv, s)
}

// statusByCode lists, per gRPC code, the domain sentinels that surface as it.
var statusByCode = map[codes.Code][]error{
	codes.InvalidArgument: {domain.ErrInvalidInput},
	codes.NotFound: {
		domain.ErrTerritoryNotFound,
		domain.ErrPanoramaNotFound,
		domain.ErrDocumentNotFound,
	},
}

// mapError translates service-layer errors to gRPC status codes.
func mapError(err error) error { return apperr.ToStatus(err, statusByCode) }

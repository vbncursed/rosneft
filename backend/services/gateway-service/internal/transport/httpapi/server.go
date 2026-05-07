// Package httpapi implements the HTTP surface of the gateway. The OpenAPI
// codegen produces ServerInterface / StrictServerInterface in openapi_gen.go;
// this file holds the Service contract and the Server struct + constructor.
// One handler method per file.
package httpapi

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Service is the gateway surface this transport calls.
type Service interface {
	ListProjects(ctx context.Context) ([]domain.Project, error)
	ListProjectsPage(ctx context.Context, limit int32, cursor string) (domain.ProjectPage, error)
	GetProject(ctx context.Context, slug string) (domain.Project, error)
	GetSceneBundle(ctx context.Context, slug string) (domain.SceneBundle, error)
	ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	SubmitConversion(ctx context.Context, slug string) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)

	ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error
}

// Server implements the oapi-codegen StrictServerInterface over a Service.
type Server struct {
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

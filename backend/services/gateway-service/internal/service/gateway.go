// Package service is the gateway business layer. It validates inputs and
// delegates outbound calls to the catalog/mesh clients. One method per file.
package service

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Catalog is the catalog client surface this service calls.
type Catalog interface {
	ListProjects(ctx context.Context) ([]domain.Project, error)
	GetProject(ctx context.Context, slug string) (domain.Project, error)
	ListArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)

	ListPlacements(ctx context.Context, parentSlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error
}

// Mesh is the mesh client surface this service calls.
type Mesh interface {
	SubmitConversion(ctx context.Context, slug string) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)
}

// Gateway is the gateway service.
type Gateway struct {
	catalog Catalog
	mesh    Mesh
}

// New constructs a Gateway.
func New(catalog Catalog, mesh Mesh) *Gateway {
	return &Gateway{catalog: catalog, mesh: mesh}
}

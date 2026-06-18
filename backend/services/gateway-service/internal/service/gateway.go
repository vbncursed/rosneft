// Package service is the gateway business layer. It validates inputs and
// delegates outbound calls to the catalog/mesh/upload clients. One method
// per file — this file holds the contracts and the constructor.
package service

import (
	"context"
	"io"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Catalog is the catalog client surface this service calls.
type Catalog interface {
	ListTerritories(ctx context.Context) ([]domain.Territory, error)
	GetTerritory(ctx context.Context, slug string) (domain.Territory, error)
	UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error)
	DeleteTerritory(ctx context.Context, slug string) error
	ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	DeleteTerritoryArtifacts(ctx context.Context, slug string) error

	ListModels(ctx context.Context) ([]domain.Model, error)
	GetModel(ctx context.Context, slug string) (domain.Model, error)
	UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error)
	DeleteModel(ctx context.Context, slug string) error
	ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)

	ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error

	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error
}

// Mesh is the mesh client surface this service calls.
type Mesh interface {
	SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)
}

// Upload is the upload-service client surface this service calls.
type Upload interface {
	Initiate(ctx context.Context, size int64, contentType string) (domain.UploadSession, error)
	WriteChunk(ctx context.Context, id string, offset int64, body io.Reader) (int64, error)
	GetStatus(ctx context.Context, id string) (domain.UploadSession, error)
	Finalize(ctx context.Context, id string) (domain.FinalizedBlob, error)
	Abort(ctx context.Context, id string) error
}

// Gateway is the gateway service.
type Gateway struct {
	catalog Catalog
	mesh    Mesh
	upload  Upload
}

// New constructs a Gateway.
func New(catalog Catalog, mesh Mesh, upload Upload) *Gateway {
	return &Gateway{catalog: catalog, mesh: mesh, upload: upload}
}

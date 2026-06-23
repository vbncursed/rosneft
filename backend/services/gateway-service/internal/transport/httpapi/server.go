// Package httpapi implements the HTTP surface of the gateway. The OpenAPI
// codegen produces ServerInterface / StrictServerInterface in openapi_gen.go;
// this file holds the Service contract and the Server struct + constructor.
// Strict handlers are grouped by domain in territories.go, models.go,
// placements.go, and uploads.go. Translation between domain types and
// the generated DTOs lives in converters.go.
package httpapi

import (
	"context"
	"io"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Service is the gateway surface this transport calls.
type Service interface {
	ListTerritories(ctx context.Context) ([]domain.Territory, error)
	GetTerritory(ctx context.Context, slug string) (domain.Territory, error)
	CreateTerritory(ctx context.Context, t domain.Territory) (domain.Territory, domain.Job, error)
	ReplaceTerritorySource(ctx context.Context, slug, sourceBlobHash string) (domain.Territory, domain.Job, error)
	UpdateTerritory(ctx context.Context, slug string, update domain.TerritoryUpdate) (domain.Territory, error)
	DeleteTerritory(ctx context.Context, slug string) error
	ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	GetSceneBundle(ctx context.Context, slug string) (domain.SceneBundle, error)

	ListModels(ctx context.Context) ([]domain.Model, error)
	GetModel(ctx context.Context, slug string) (domain.Model, error)
	CreateModel(ctx context.Context, m domain.Model) (domain.Model, domain.Job, error)
	DeleteModel(ctx context.Context, slug string) error
	ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error)
	GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)

	ListPlacements(ctx context.Context, territorySlug string) ([]domain.Placement, error)
	CreatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	UpdatePlacement(ctx context.Context, p domain.Placement) (domain.Placement, error)
	SetPlacementVisibility(ctx context.Context, territorySlug string, placementID int64, panoramaIDs []int64) (domain.Placement, error)
	DeletePlacement(ctx context.Context, id int64) error

	ListPanoramas(ctx context.Context, territorySlug string) ([]domain.Panorama, error)
	CreatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	UpdatePanorama(ctx context.Context, p domain.Panorama) (domain.Panorama, error)
	DeletePanorama(ctx context.Context, id int64) error

	GetJob(ctx context.Context, id string) (domain.Job, error)

	InitiateUpload(ctx context.Context, size int64, contentType string) (domain.UploadSession, error)
	AppendUploadChunk(ctx context.Context, id string, offset int64, body io.Reader) (int64, error)
	GetUploadStatus(ctx context.Context, id string) (domain.UploadSession, error)
	FinalizeUpload(ctx context.Context, id string) (domain.FinalizedBlob, error)
	AbortUpload(ctx context.Context, id string) error
}

// Server implements the oapi-codegen StrictServerInterface over a Service.
type Server struct {
	svc Service
}

// New constructs a Server.
func New(svc Service) *Server {
	return &Server{svc: svc}
}

// codeOf returns a stable string code for the public Error envelope.
// Domain sentinels keep their natural string form; unrecognised errors
// become "internal".
func codeOf(err error) string {
	if err == nil {
		return ""
	}
	switch {
	case isInvalid(err):
		return "invalid_input"
	case isNotFound(err):
		return "not_found"
	default:
		return "internal"
	}
}

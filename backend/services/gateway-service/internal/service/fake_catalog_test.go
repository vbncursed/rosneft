package service_test

import (
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// fakeCatalog is an in-memory implementation of service.Catalog. Method
// bodies live in fake_catalog_*.go split by domain area to stay under the
// 200-line file cap. Programmable error fields let tests inject failures
// without writing a custom catalog per test case.
type fakeCatalog struct {
	mu sync.Mutex

	territories map[string]domain.Territory
	models      map[string]domain.Model
	terrArts    map[string][]domain.Artifact
	modelArts   map[string][]domain.Artifact
	placements  map[int64]domain.Placement
	panoramas   map[int64]domain.Panorama
	nextID      int64

	ErrUpsertTerritory          error
	ErrUpsertModel              error
	ErrListPlacements           error
	ErrListModels               error
	ErrListTerrArts             error
	ErrCreatePlacement          error
	ErrUpdatePlacement          error
	ErrListPanoramas            error
	ErrCreatePanorama           error
	ErrUpdatePanorama           error
	ErrDeleteTerritoryArtifacts error

	LastUpsertTerritory          domain.Territory
	LastUpsertModel              domain.Model
	LastCreatePlacement          domain.Placement
	LastUpdatePlacement          domain.Placement
	LastCreatePanorama           domain.Panorama
	LastUpdatePanorama           domain.Panorama
	LastDeleteTerritoryArtifacts string
}

func newFakeCatalog() *fakeCatalog {
	return &fakeCatalog{
		territories: map[string]domain.Territory{},
		models:      map[string]domain.Model{},
		terrArts:    map[string][]domain.Artifact{},
		modelArts:   map[string][]domain.Artifact{},
		placements:  map[int64]domain.Placement{},
		panoramas:   map[int64]domain.Panorama{},
	}
}

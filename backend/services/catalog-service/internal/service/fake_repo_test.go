package service_test

import (
	"sync"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// fakeRepo is an in-memory implementation of service.Repository used by every
// suite in this package. Method bodies live in fake_repo_*.go split by domain
// area to stay under the 200-line file cap.
//
// Programmable error fields let tests inject failures without writing a custom
// repo per test case; Last* fields capture the args of the most recent call so
// tests can verify the service forwarded the validated input verbatim.
type fakeRepo struct {
	mu sync.Mutex

	territories map[string]domain.Territory
	models      map[string]domain.Model
	terrArts    map[string][]domain.Artifact
	modelArts   map[string][]domain.Artifact
	placements  map[int64]domain.Placement
	nextID      int64

	ErrUpsertTerritory           error
	ErrCreatePlacement           error
	ErrUpdatePlacement           error
	ErrRegisterTerritoryArtifact error
	ErrRegisterModelArtifact     error

	LastUpsertTerritory           domain.Territory
	LastUpsertModel               domain.Model
	LastCreatePlacement           domain.Placement
	LastUpdatePlacement           domain.Placement
	LastRegisterTerritoryArtifact domain.Artifact
	LastRegisterModelArtifact     domain.Artifact
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		territories: map[string]domain.Territory{},
		models:      map[string]domain.Model{},
		terrArts:    map[string][]domain.Artifact{},
		modelArts:   map[string][]domain.Artifact{},
		placements:  map[int64]domain.Placement{},
	}
}

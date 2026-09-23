//go:build integration

package storage_test

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// PartialUpdateSuite checks UpdateTerritory/UpdateModel against a real
// Postgres: "absent keeps, empty clears" is the COALESCE in the statement, and
// a mock would only prove that pointers were passed along.
type PartialUpdateSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG
}

func TestPartialUpdateSuite(t *testing.T) { suite.Run(t, new(PartialUpdateSuite)) }

func (s *PartialUpdateSuite) SetupSuite() {
	s.ctr, s.pool = startCatalogDB(&s.Suite)
	s.pg = storage.New(s.pool)
}

func (s *PartialUpdateSuite) TearDownSuite() { stopCatalogDB(s.ctr, s.pool) }

var (
	seedTerritory = domain.Territory{
		Slug: "site", Title: "Site", Description: "desc",
		ExternalPanoramaURL: "https://tour", SourceBlobHash: "old-source",
	}
	seedModel = domain.Model{
		Slug: "box", Title: "Box", Description: "desc",
		SourceBlobHash: "model-source", ThumbnailBlobHash: "thumb",
	}
)

// SetupTest and SetupSubTest put both rows back as seeded before every test
// and every case: each edits them, and the next expects the seed.
func (s *PartialUpdateSuite) SetupTest() { s.reseed() }

func (s *PartialUpdateSuite) SetupSubTest() { s.reseed() }

func (s *PartialUpdateSuite) reseed() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `DELETE FROM territories WHERE slug = $1`, seedTerritory.Slug)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx, `DELETE FROM models WHERE slug = $1`, seedModel.Slug)
	assert.NilError(s.T(), err)
	_, err = s.pg.CreateTerritory(ctx, seedTerritory)
	assert.NilError(s.T(), err)
	_, err = s.pg.CreateModel(ctx, seedModel)
	assert.NilError(s.T(), err)
}

func (s *PartialUpdateSuite) TestUpdateTerritoryWritesOnlyTheFieldsItCarries() {
	cases := []struct {
		name  string
		patch domain.TerritoryPatch
		apply func(*domain.Territory)
	}{
		{
			name:  "title only",
			patch: domain.TerritoryPatch{Title: new("North site")},
			apply: func(t *domain.Territory) { t.Title = "North site" },
		},
		{
			name:  "empty description clears it",
			patch: domain.TerritoryPatch{Description: new("")},
			apply: func(t *domain.Territory) { t.Description = "" },
		},
		{
			name:  "source hash only",
			patch: domain.TerritoryPatch{SourceBlobHash: new("new-source")},
			apply: func(t *domain.Territory) { t.SourceBlobHash = "new-source" },
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			want := seedTerritory
			tc.apply(&want)

			out, err := s.pg.UpdateTerritory(ctx, "site", tc.patch)
			assert.NilError(s.T(), err)
			stored, err := s.pg.GetTerritory(ctx, "site", "")
			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(), bareTerritory(out), want)
			assert.DeepEqual(s.T(), bareTerritory(stored), want)
		})
	}
}

func (s *PartialUpdateSuite) TestUpdateTerritoryOfAnUnknownSlugIsNotFound() {
	_, err := s.pg.UpdateTerritory(s.T().Context(), "nowhere", domain.TerritoryPatch{Title: new("x")})
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *PartialUpdateSuite) TestUpdateModelWritesOnlyTheFieldsItCarries() {
	cases := []struct {
		name  string
		patch domain.ModelPatch
		apply func(*domain.Model)
	}{
		{
			name:  "title only",
			patch: domain.ModelPatch{Title: new("Crate")},
			apply: func(m *domain.Model) { m.Title = "Crate" },
		},
		{
			name:  "empty description clears it",
			patch: domain.ModelPatch{Description: new("")},
			apply: func(m *domain.Model) { m.Description = "" },
		},
		{
			name:  "thumbnail only",
			patch: domain.ModelPatch{ThumbnailBlobHash: new("new-thumb")},
			apply: func(m *domain.Model) { m.ThumbnailBlobHash = "new-thumb" },
		},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			ctx := s.T().Context()
			want := seedModel
			tc.apply(&want)

			out, err := s.pg.UpdateModel(ctx, "box", tc.patch)
			assert.NilError(s.T(), err)
			stored, err := s.pg.GetModel(ctx, "box")
			assert.NilError(s.T(), err)
			assert.DeepEqual(s.T(), bareModel(out), want)
			assert.DeepEqual(s.T(), bareModel(stored), want)
		})
	}
}

func (s *PartialUpdateSuite) TestUpdateModelOfAnUnknownSlugIsNotFound() {
	_, err := s.pg.UpdateModel(s.T().Context(), "nowhere", domain.ModelPatch{Title: new("x")})
	assert.ErrorIs(s.T(), err, domain.ErrModelNotFound)
}

// bareTerritory drops what the database assigns, leaving the edited columns.
func bareTerritory(t domain.Territory) domain.Territory {
	t.CreatedAt, t.UpdatedAt, t.PlacementCount = time.Time{}, time.Time{}, 0
	return t
}

func bareModel(m domain.Model) domain.Model {
	m.CreatedAt, m.UpdatedAt, m.UsageCount = time.Time{}, time.Time{}, 0
	return m
}

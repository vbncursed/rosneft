package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

type TerritoriesSuite struct {
	suite.Suite
	cat  *fakeCatalog
	mesh *fakeMesh
	svc  *service.Gateway
}

func TestTerritoriesSuite(t *testing.T) {
	suite.Run(t, new(TerritoriesSuite))
}

func (s *TerritoriesSuite) SetupTest() {
	s.cat = newFakeCatalog()
	s.mesh = newFakeMesh()
	s.mesh.NextJob = domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.svc = service.New(s.cat, s.mesh, &fakeUpload{})
}

func (s *TerritoriesSuite) TestGetRejectsEmptySlug() {
	_, err := s.svc.GetTerritory(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyTitle() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{SourceBlobHash: "h"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateRejectsEmptyHash() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Title: "x"})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestCreateUpsertsAndSubmitsJob() {
	in := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "h"}
	saved, job, err := s.svc.CreateTerritory(s.T().Context(), in)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.Slug, "t1")
	assert.Equal(s.T(), job.ID, "job-1")
	assert.Equal(s.T(), s.mesh.LastSubmitKind, domain.KindTerritory)
	assert.Equal(s.T(), s.mesh.LastSubmitSlug, "t1")
}

func (s *TerritoriesSuite) TestCreateReturnsCatalogError() {
	s.cat.ErrUpsertTerritory = errors.New("db down")
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "x", SourceBlobHash: "h"})
	assert.ErrorContains(s.T(), err, "db down")
}

func (s *TerritoriesSuite) TestCreateSurfaceMeshErrorWithSavedTerritory() {
	// If the catalog upsert succeeded but the mesh queue is down, the
	// gateway must still return the persisted territory so the user can
	// retry the conversion later — losing the save would re-trigger the
	// upload flow for nothing.
	s.mesh.ErrSubmit = errors.New("redis down")
	saved, job, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "x", SourceBlobHash: "h"})
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), saved.Slug, "t1")
	assert.Equal(s.T(), job.ID, "")
}

func (s *TerritoriesSuite) TestReplaceSourceRejectsEmptyInputs() {
	_, _, err := s.svc.ReplaceTerritorySource(s.T().Context(), "", "h")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, _, err = s.svc.ReplaceTerritorySource(s.T().Context(), "t1", "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestReplaceSourceReturnsNotFoundForUnknown() {
	_, _, err := s.svc.ReplaceTerritorySource(s.T().Context(), "missing", "h2")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestReplaceSourceSwapsHashClearsArtifactsAndQueues() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"})
	assert.NilError(s.T(), err)
	s.cat.terrArts["t1"] = []domain.Artifact{{Slug: "t1", LOD: 0, Hash: "oldglb"}}

	saved, job, err := s.svc.ReplaceTerritorySource(s.T().Context(), "t1", "new")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), saved.SourceBlobHash, "new")
	assert.Equal(s.T(), s.cat.LastDeleteTerritoryArtifacts, "t1")
	assert.Equal(s.T(), job.ID, "job-1")
	assert.Equal(s.T(), s.mesh.LastSubmitKind, domain.KindTerritory)
	assert.Equal(s.T(), s.mesh.LastSubmitSlug, "t1")
}

func (s *TerritoriesSuite) TestReplaceSourceSetsRescaleBaselineFromOldLOD0() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"})
	assert.NilError(s.T(), err)
	// Old LOD0 source bbox: longest axis = 10 (the converter's pre-normalize max).
	s.cat.terrArts["t1"] = []domain.Artifact{{
		Slug: "t1", LOD: 0,
		BBoxMin: domain.Vec3{X: 0, Y: 0, Z: 0},
		BBoxMax: domain.Vec3{X: 10, Y: 3, Z: 4},
	}}

	_, _, err = s.svc.ReplaceTerritorySource(s.T().Context(), "t1", "new")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cat.LastRescaleBaselineSlug, "t1")
	assert.Equal(s.T(), s.cat.LastRescaleBaselineMax, 10.0)
}

func (s *TerritoriesSuite) TestReplaceSourceSkipsBaselineWhenNoLOD0() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"})
	assert.NilError(s.T(), err)
	// No artifacts yet (territory still pending) → nothing to anchor a rescale to.

	_, _, err = s.svc.ReplaceTerritorySource(s.T().Context(), "t1", "new")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cat.LastRescaleBaselineSlug, "")
}

func (s *TerritoriesSuite) TestReplaceSourceSurfacesMeshErrorWithSavedTerritory() {
	_, _, err := s.svc.CreateTerritory(s.T().Context(),
		domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"})
	assert.NilError(s.T(), err)
	s.mesh.ErrSubmit = errors.New("redis down")

	saved, job, err := s.svc.ReplaceTerritorySource(s.T().Context(), "t1", "new")
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), saved.SourceBlobHash, "new")
	assert.Equal(s.T(), job.ID, "")
}

func (s *TerritoriesSuite) TestDeleteRejectsEmptySlug() {
	err := s.svc.DeleteTerritory(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestArtifactsRejectEmptySlug() {
	_, err := s.svc.ListTerritoryArtifacts(s.T().Context(), "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.GetTerritoryArtifact(s.T().Context(), "", 0)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

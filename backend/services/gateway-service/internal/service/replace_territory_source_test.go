package service_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// These tests extend TerritoriesSuite (defined in territories_test.go) with the
// multi-step ReplaceTerritorySource flow: get → upsert(new hash) → capture
// rescale baseline from the old LOD0 → clear artifacts → re-queue conversion.

func (s *TerritoriesSuite) TestReplaceSourceRejectsEmptyInputs() {
	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "", "h")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, _, err = s.svc.ReplaceTerritorySource(s.ctx, "t1", "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestReplaceSourceReturnsNotFoundForUnknown() {
	s.cat.GetTerritoryMock.Expect(s.ctx, "missing").Return(domain.Territory{}, domain.ErrTerritoryNotFound)
	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "missing", "h2")
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestReplaceSourceSwapsHashClearsArtifactsAndQueues() {
	current := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"}
	saved := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1").Return(current, nil)
	s.cat.UpsertTerritoryMock.Expect(s.ctx, saved).Return(saved, nil)
	// LOD0 exists but has no bbox → maxAxis 0 → no rescale baseline written.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{Slug: "t1", LOD: 0, Hash: "oldglb"}, nil)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Expect(s.ctx, domain.KindTerritory, "t1").
		Return(domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1"}, nil)

	out, job, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.SourceBlobHash, "new")
	assert.Equal(s.T(), job.ID, "job-1")
}

func (s *TerritoriesSuite) TestReplaceSourceSetsRescaleBaselineFromOldLOD0() {
	current := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"}
	saved := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1").Return(current, nil)
	s.cat.UpsertTerritoryMock.Expect(s.ctx, saved).Return(saved, nil)
	// Old LOD0 source bbox: longest axis = 10 (the converter's pre-normalize max).
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).Return(domain.Artifact{
		Slug: "t1", LOD: 0,
		BBoxMin: domain.Vec3{X: 0, Y: 0, Z: 0},
		BBoxMax: domain.Vec3{X: 10, Y: 3, Z: 4},
	}, nil)
	s.cat.SetTerritoryRescaleBaselineMock.Expect(s.ctx, "t1", 10.0).Return(nil)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{ID: "job-1"}, nil)

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new")
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestReplaceSourceSkipsBaselineWhenNoLOD0() {
	current := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"}
	saved := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1").Return(current, nil)
	s.cat.UpsertTerritoryMock.Expect(s.ctx, saved).Return(saved, nil)
	// No LOD0 yet → nothing to anchor a rescale to; SetTerritoryRescaleBaseline
	// is intentionally left unmocked, so any call would fail the test.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{ID: "job-1"}, nil)

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new")
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestReplaceSourceSurfacesMeshErrorWithSavedTerritory() {
	current := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "old"}
	saved := domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}
	s.cat.GetTerritoryMock.Expect(s.ctx, "t1").Return(current, nil)
	s.cat.UpsertTerritoryMock.Expect(s.ctx, saved).Return(saved, nil)
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{}, errors.New("redis down"))

	out, job, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new")
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), out.SourceBlobHash, "new")
	assert.Equal(s.T(), job.ID, "")
}

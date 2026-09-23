package service_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// These tests extend TerritoriesSuite (defined in territories_test.go) with the
// multi-step ReplaceTerritorySource flow: capture rescale baseline from the old
// LOD0 → update(new hash only) → clear artifacts → re-queue conversion.
// No GetTerritory/UpsertTerritory is expected: a replace that wrote the whole
// row back would revert a title edit made since it read it.

// expectSourceSwap expects the one catalog write a replace makes: the source
// hash of t1, and nothing else.
func (s *TerritoriesSuite) expectSourceSwap() {
	s.cat.UpdateTerritoryMock.Expect(s.ctx, "t1", domain.TerritoryUpdate{SourceBlobHash: new("new")}).
		Return(domain.Territory{Slug: "t1", Title: "Site", SourceBlobHash: "new"}, nil)
}

func (s *TerritoriesSuite) TestReplaceSourceRejectsEmptyInputs() {
	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "", "h", rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, _, err = s.svc.ReplaceTerritorySource(s.ctx, "t1", "", rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *TerritoriesSuite) TestReplaceSourceReturnsNotFoundForUnknown() {
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "missing", uint32(0)).
		Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	s.cat.UpdateTerritoryMock.Expect(s.ctx, "missing", domain.TerritoryUpdate{SourceBlobHash: new("h2")}).
		Return(domain.Territory{}, domain.ErrTerritoryNotFound)
	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "missing", "h2", rootScope)
	assert.Assert(s.T(), errors.Is(err, domain.ErrTerritoryNotFound))
}

func (s *TerritoriesSuite) TestReplaceSourceSwapsHashClearsArtifactsAndQueues() {
	s.expectSourceSwap()
	// LOD0 exists but has no bbox → maxAxis 0 → no rescale baseline written.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{Slug: "t1", LOD: 0, Hash: "oldglb"}, nil)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Expect(s.ctx, domain.KindTerritory, "t1").
		Return(domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1"}, nil)

	out, job, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.SourceBlobHash, "new")
	assert.Equal(s.T(), job.ID, "job-1")
}

func (s *TerritoriesSuite) TestReplaceSourceSetsRescaleBaselineFromOldLOD0() {
	s.expectSourceSwap()
	// Old LOD0 source bbox: longest axis 10 (the converter's pre-normalize max),
	// center (7, 1, 2) — the point the converter moved to the origin.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).Return(domain.Artifact{
		Slug: "t1", LOD: 0,
		BBoxMin: domain.Vec3{X: 2, Y: -1, Z: 0},
		BBoxMax: domain.Vec3{X: 12, Y: 3, Z: 4},
	}, nil)
	s.cat.SetTerritoryRescaleBaselineMock.Expect(s.ctx, "t1", 10.0, domain.Vec3{X: 7, Y: 1, Z: 2}).Return(nil)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{ID: "job-1"}, nil)

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestReplaceSourceSkipsBaselineWhenNoLOD0() {
	s.expectSourceSwap()
	// No LOD0 yet → nothing to anchor a rescale to; SetTerritoryRescaleBaseline
	// is intentionally left unmocked, so any call would fail the test.
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{ID: "job-1"}, nil)

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.NilError(s.T(), err)
}

func (s *TerritoriesSuite) TestReplaceSourceSurfacesMeshErrorWithSavedTerritory() {
	s.expectSourceSwap()
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).
		Return(domain.Artifact{}, domain.ErrArtifactNotFound)
	s.cat.DeleteTerritoryArtifactsMock.Expect(s.ctx, "t1").Return(nil)
	s.mesh.SubmitConversionMock.Return(domain.Job{}, errors.New("redis down"))

	out, job, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), out.SourceBlobHash, "new")
	assert.Equal(s.T(), job.ID, "")
}

// The baseline is captured before the hash is swapped: a failure there must
// leave the territory on its old source rather than on a new hash with the old
// artifacts and no job. UpdateTerritory is left unmocked, so any call fails.
func (s *TerritoriesSuite) TestReplaceSourceBaselineFailureLeavesTheSourceAlone() {
	s.cat.GetTerritoryArtifactMock.Expect(s.ctx, "t1", uint32(0)).Return(domain.Artifact{
		BBoxMin: domain.Vec3{X: 2, Y: -1, Z: 0},
		BBoxMax: domain.Vec3{X: 12, Y: 3, Z: 4},
	}, nil)
	s.cat.SetTerritoryRescaleBaselineMock.Return(errors.New("catalog down"))

	_, _, err := s.svc.ReplaceTerritorySource(s.ctx, "t1", "new", rootScope)
	assert.ErrorContains(s.T(), err, "catalog down")
}

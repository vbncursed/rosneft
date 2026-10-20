package service_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// A converted target whose LOD0 has no plain copy (everything converted
// before the compatible export shipped) is queued once more to backfill it.
func (s *ReconcileSuite) TestQueuesTargetWhoseLOD0HasNoPlain() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, false, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t2").Then(true, true, nil)
	s.allowSubmit()

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	assert.Equal(s.T(), len(s.queue.TryLockTargetMock.Calls()), 1)
}

// The backfill obeys the same input-failure rule as a missing LOD0: a source
// that no longer converts must not be re-run on every tick.
func (s *ReconcileSuite) TestSkipsPlainBackfillWhoseLatestJobFailedOnItsInput() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed, FailedOnSource: true,
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

func (s *ReconcileSuite) TestPlainBackfillAlreadyInFlightIsNotCounted() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning},
	}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

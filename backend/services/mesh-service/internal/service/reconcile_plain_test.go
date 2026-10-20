package service_test

import (
	"context"
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
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

// The backfill yields to any live job — a user's upload must not wait behind
// a reconversion of the whole catalog — and queues one target per tick, so
// the stream never holds more backfill work than one conversion.
func (s *ReconcileSuite) TestPlainBackfillWaitsForALiveJob() {
	now := time.Now()
	for _, live := range []domain.Job{
		{Kind: domain.KindModel, Slug: "upload", Status: domain.JobStatusPending, CreatedAt: now},
		{Kind: domain.KindModel, Slug: "upload", Status: domain.JobStatusRunning, UpdatedAt: now},
	} {
		s.SetupTest()
		s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
			{Kind: domain.KindModel, Slug: "upload", SourceBlobHash: "h"},
			{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		}, nil)
		s.catalog.HasLOD0Mock.When(s.ctx, domain.KindModel, "upload").Then(true, true, nil)
		s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, false, nil)
		s.queue.ListTargetJobsMock.Return([]domain.Job{live}, nil)

		n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

		assert.NilError(s.T(), err)
		assert.Equal(s.T(), n, 0, "live %v job", live.Status)
	}
}

func (s *ReconcileSuite) TestQueuesOnePlainBackfillPerTick() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.allowSubmit()

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

// A job that stopped being live (queued past MaxQueueWait, or Running with no
// write inside TargetLockTTL: its worker is gone) does not hold the backfill.
func (s *ReconcileSuite) TestAbandonedJobDoesNotHoldThePlainBackfill() {
	old := time.Now().Add(-service.MaxQueueWait)
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.allowSubmit()
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{Kind: domain.KindModel, Slug: "a", Status: domain.JobStatusPending, CreatedAt: old},
		{Kind: domain.KindModel, Slug: "b", Status: domain.JobStatusRunning, UpdatedAt: old},
	}, nil)
	s.queue.ForgetTargetMock.Return(nil) // a and b are not catalog targets: the sweep drops them

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

// The reconciler marks only the plain backfill (the target has a LOD0); a
// target with no LOD0 is a first conversion and its failure must stay visible.
func (s *ReconcileSuite) TestMarksThePlainBackfillJobButNotAFirstConversion() {
	for _, tc := range []struct {
		name          string
		has, hasPlain bool
		backfill      bool
	}{
		{"no plain copy", true, false, true},
		{"no lod0", false, false, false},
	} {
		s.SetupTest()
		var saved []domain.Job
		s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}}, nil)
		s.catalog.HasLOD0Mock.Return(tc.has, tc.hasPlain, nil)
		s.queue.TryLockTargetMock.Return(true, nil)
		s.queue.SaveJobMock.Set(func(_ context.Context, j domain.Job) error { saved = append(saved, j); return nil })
		s.queue.EnqueueJobMock.Return(nil)
		s.queue.GetJobMock.Return(domain.Job{}, nil)
		s.queue.ListTargetJobsMock.Return(nil, nil)

		n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

		assert.NilError(s.T(), err)
		assert.Equal(s.T(), n, 1, tc.name)
		assert.Equal(s.T(), len(saved), 1, tc.name)
		assert.Equal(s.T(), saved[0].Backfill, tc.backfill, tc.name)
	}
}

// A backfill that failed on its source is still left alone, so hiding it from
// the list cannot start a requeue loop.
func (s *ReconcileSuite) TestSkipsABackfillThatFailedOnItsSource() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed, FailedOnSource: true, Backfill: true,
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

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
	s.catalog.ListTargetsMock.Return(
		[]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}},
		nil,
	)
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

// The reconciler marks only the plain backfill: the target has a LOD0 and
// nothing a user caused is outstanding on it. A first conversion (no LOD0) is
// unmarked, and so is a retry of a user's job that failed or was abandoned — a
// replace-source whose retry converts the new bytes must fail visibly, not
// erase the user's failure from the list.
func (s *ReconcileSuite) TestMarksThePlainBackfillJobButNotAFirstConversion() {
	job := func(st domain.JobStatus, backfill bool) []domain.Job {
		return []domain.Job{{ID: "old", Kind: domain.KindTerritory, Slug: "t1", Status: st, Backfill: backfill}}
	}
	for _, tc := range []struct {
		name          string
		has, hasPlain bool
		latest        []domain.Job
		backfill      bool
	}{
		{"no plain copy", true, false, nil, true},
		{"no lod0", false, false, nil, false},
		{"after a success", true, false, job(domain.JobStatusSucceeded, false), true},
		{"after a failed backfill", true, false, job(domain.JobStatusFailed, true), true},
		{"after a user's failure", true, false, job(domain.JobStatusFailed, false), false},
		{"after a user's abandoned run", true, false, job(domain.JobStatusRunning, false), false},
		{"after a user's abandoned queue", true, false, job(domain.JobStatusPending, false), false},
	} {
		s.SetupTest()
		var saved []domain.Job
		s.catalog.ListTargetsMock.Return(
			[]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}},
			nil,
		)
		s.catalog.HasLOD0Mock.Return(tc.has, tc.hasPlain, nil)
		s.queue.TryLockTargetMock.Return(true, nil)
		s.queue.SaveJobMock.Set(func(_ context.Context, j domain.Job) error { saved = append(saved, j); return nil })
		s.queue.EnqueueJobMock.Return(nil)
		s.queue.GetJobMock.Return(domain.Job{}, nil)
		s.queue.ListTargetJobsMock.Return(tc.latest, nil)

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
	s.catalog.ListTargetsMock.Return(
		[]domain.ConversionTarget{{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"}},
		nil,
	)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{
			ID:             "j1",
			Kind:           domain.KindTerritory,
			Slug:           "t1",
			Status:         domain.JobStatusFailed,
			FailedOnSource: true,
			Backfill:       true,
		},
	}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
}

// A backfill that just failed (infrastructure, not its source) is not retried
// at once: the signal-driven passes would otherwise put one poison target in
// front of the rest of the backlog. The pass moves on to the next target; the
// failed one is retried once BackfillRetryAfter has passed.
func (s *ReconcileSuite) TestPlainBackfillBacksOffFromARecentFailure() {
	for _, tc := range []struct {
		name      string
		updatedAt time.Time
		want      string // the one target queued
	}{
		{"just failed", time.Now(), "t2"},
		{"failed long ago", time.Now().Add(-service.BackfillRetryAfter), "t1"},
	} {
		s.SetupTest()
		s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
			{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
			{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
		}, nil)
		s.catalog.HasLOD0Mock.Return(true, false, nil)
		var locked []string
		s.queue.TryLockTargetMock.Set(
			func(_ context.Context, _ domain.Kind, slug string, _ time.Duration) (bool, error) {
				locked = append(locked, slug)
				return true, nil
			},
		)
		s.queue.SaveJobMock.Return(nil)
		s.queue.EnqueueJobMock.Return(nil)
		s.queue.GetJobMock.Return(domain.Job{}, nil)
		s.queue.ListTargetJobsMock.Return([]domain.Job{{
			ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed,
			Backfill: true, UpdatedAt: tc.updatedAt,
		}}, nil)

		n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

		assert.NilError(s.T(), err)
		assert.Equal(s.T(), n, 1, tc.name)
		assert.DeepEqual(s.T(), locked, []string{tc.want})
	}
}

// A conversion that succeeded moments ago yet left no plain copy means the
// catalog drops plain_hash (an older image). Its success signal must not
// reconvert the next target back to back: the pass queues nothing, so the
// drain stops and the skew costs one reconversion per tick, as before it.
func (s *ReconcileSuite) TestPlainBackfillStopsWhenARecentSuccessLeftNoPlain() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(true, false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusSucceeded,
		Backfill: true, UpdatedAt: time.Now(),
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
	assert.Equal(s.T(), len(s.queue.TryLockTargetMock.Calls()), 0)
}

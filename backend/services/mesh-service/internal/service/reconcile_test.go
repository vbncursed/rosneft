package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

type ReconcileSuite struct {
	suite.Suite
	queue   *mocks.QueueMock
	catalog *mocks.CatalogMock
	svc     *service.Mesh
	ctx     context.Context
}

func TestReconcileSuite(t *testing.T) {
	suite.Run(t, new(ReconcileSuite))
}

func (s *ReconcileSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.catalog = mocks.NewCatalogMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: s.catalog,
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "id" },
	})
	s.ctx = s.T().Context()
}

// allowSubmit stubs SubmitConversion's fan-out (lock → save → enqueue → get)
// so reconcile can queue missing targets; reconcile only counts the submits.
func (s *ReconcileSuite) allowSubmit() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{}, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
}

func (s *ReconcileSuite) TestNothingToReconcileWhenAllHaveLOD0() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindModel, "m1").Then(true, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestQueuesOnlyMissingTargets() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t1").Then(true, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindTerritory, "t2").Then(false, nil)
	s.catalog.HasLOD0Mock.When(s.ctx, domain.KindModel, "m1").Then(false, nil)
	s.allowSubmit()

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 2)
}

func (s *ReconcileSuite) TestStopsOnListTargetsError() {
	s.catalog.ListTargetsMock.Return(nil, errors.New("catalog down"))
	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "catalog down")
}

func (s *ReconcileSuite) TestSurfaceLOD0CheckErrorOnFirstFailure() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, errors.New("db blip"))
	_, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "db blip")
}

// A submit failure stops the tick with nothing counted, and releases the
// claim: without the release a failed submit would block this target for the
// whole TargetLockTTL, and the reconciler's whole job is to retry.
func (s *ReconcileSuite) TestStopsOnSubmitFailureAndReleasesTheLock() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	queued, err := s.svc.ReconcileMissingArtifacts(s.ctx)
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestRespectsCancelledContext() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}, nil)
	ctx, cancel := context.WithCancel(s.ctx)
	cancel()
	_, err := s.svc.ReconcileMissingArtifacts(ctx)
	assert.Assert(s.T(), err != nil)
}

func (s *ReconcileSuite) TestDoesNotCountATargetAlreadyInFlight() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning},
	}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 0, n)
	// SaveJob is not configured on the mock: the controller fails the test if
	// the reconciler reaches it, which is exactly the regression we guard.
}

func (s *ReconcileSuite) TestQueuesTargetWhenLockIsFree() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{ID: "j1"}, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 1, n)
}

// The claim is re-taken as a job starts (markRunning), so it bounds one run:
// at most three passes, none larger than LOD0 of a 3 × 8192² territory
// (357 s with textures encoded one at a time, 2026-09-29).
func (s *ReconcileSuite) TestTargetLockOutlivesOneSerialTextureConversion() {
	const measuredLOD0 = 357 * time.Second
	assert.Assert(s.T(), service.TargetLockTTL >= 3*measuredLOD0,
		"TargetLockTTL %v expires under one serial conversion", service.TargetLockTTL)
	assert.Assert(s.T(), service.TargetLockTTL <= 30*time.Minute,
		"TargetLockTTL %v keeps a dead worker's target waiting too long", service.TargetLockTTL)
}

// A conversion that failed on its input (an archive past the extraction cap)
// fails the same way on every retry, so the tick leaves it alone. Submit's
// mocks are unconfigured: reaching them fails the test.
func (s *ReconcileSuite) TestSkipsTargetWhoseLatestJobFailedOnItsInput() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed,
		ErrorMessage: "service.runConversion: extract: invalid input: archive expands past 8.0 GiB",
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
	assert.Equal(s.T(), len(s.queue.ListTargetJobsMock.Calls()), 1, "one index read per tick")
}

// A failure that is not the input's fault (worker killed, Redis blip) may
// succeed next time, so it is still retried.
func (s *ReconcileSuite) TestRetriesTargetWhoseLatestJobFailedOnInfrastructure() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{}, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed,
		ErrorMessage: "service.runConversion: store artifact: connection reset",
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

// Only the failed target is skipped; its neighbour is still queued.
func (s *ReconcileSuite) TestSkipIsPerTarget() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "bad", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "new", SourceBlobHash: "h"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{}, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "j1", Kind: domain.KindTerritory, Slug: "bad", Status: domain.JobStatusFailed,
		ErrorMessage: "invalid input: no .obj in source archive",
	}}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.ctx)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

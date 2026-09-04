package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service/mocks"
)

type SubmitConversionSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestSubmitConversionSuite(t *testing.T) {
	suite.Run(t, new(SubmitConversionSuite))
}

func (s *SubmitConversionSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: mocks.NewCatalogMock(mc),
		Blobs:   mocks.NewBlobStoreMock(mc),
		IDGen:   func() string { return "fixed-id" },
	})
	s.ctx = s.T().Context()
}

func (s *SubmitConversionSuite) TestRejectsUnspecifiedKind() {
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindUnspecified, "t1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestRejectsEmptySlug() {
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestSavesPendingJobAndEnqueues() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ID, "fixed-id")
	assert.Equal(s.T(), got.Status, domain.JobStatusPending)
	assert.Equal(s.T(), got.Kind, domain.KindTerritory)
	assert.Equal(s.T(), got.Slug, "t1")
}

func (s *SubmitConversionSuite) TestModelKindIsForwarded() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, _, err := s.svc.SubmitConversion(s.ctx, domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Kind, domain.KindModel)
}

func (s *SubmitConversionSuite) TestSaveFailureSurfaces() {
	// Save fails first → enqueue is never reached (EnqueueJobMock unmocked).
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Return(nil)
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestEnqueueFailureSurfaces() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(errors.New("redis full"))
	s.queue.UnlockTargetMock.Return(nil)
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis full")
}

func (s *SubmitConversionSuite) TestTakesTheTargetLockBeforeQueueing() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1", service.TargetLockTTL).Return(true, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
	assert.Equal(s.T(), got.ID, "fixed-id")
}

func (s *SubmitConversionSuite) TestReturnsTheRunningJobWhenTheTargetIsHeld() {
	running := domain.Job{ID: "older", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "other", Kind: domain.KindModel, Slug: "t1", Status: domain.JobStatusPending},
		running,
	}, nil)
	// SaveJob and EnqueueJob are unmocked: reaching them fails the test.

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !created)
	assert.DeepEqual(s.T(), got, running)
}

func (s *SubmitConversionSuite) TestQueuesAnewWhenTheHeldTargetsJobIsTerminal() {
	// A lock with a finished job behind it is stale: the worker died between
	// its terminal write and the unlock. Nothing is running, so submit.
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "older", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusFailed},
	}, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
	assert.Equal(s.T(), got.ID, "fixed-id")
}

func (s *SubmitConversionSuite) TestQueuesAnewWhenTheHeldTargetHasNoIndexEntry() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	_, created, err := s.svc.SubmitConversion(s.ctx, domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
}

func (s *SubmitConversionSuite) TestReleasesTheLockWhenSaveFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestReleasesTheLockWhenEnqueueFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(errors.New("redis full"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis full")
}

func (s *SubmitConversionSuite) TestSurfacesALockError() {
	s.queue.TryLockTargetMock.Return(false, errors.New("redis down"))
	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

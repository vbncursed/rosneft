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

var submitNow = time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)

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
		Now:     func() time.Time { return submitNow },
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
	s.queue.ListTargetJobsMock.Return(nil, nil)
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
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, _, err := s.svc.SubmitConversion(s.ctx, domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Kind, domain.KindModel)
}

func (s *SubmitConversionSuite) TestTakesTheTargetLockBeforeQueueing() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1", service.TargetLockTTL).Return(true, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
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
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestReleasesTheLockWhenEnqueueFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
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

// A submitter that fell through a stale lock never took it, so releasing it
// on a save failure would hand back a claim another submitter took inside the
// TOCTOU window the doc comment bounds — leaving that submitter's job running
// unprotected. UnlockTarget is unmocked: reaching it fails the test.
func (s *SubmitConversionSuite) TestDoesNotReleaseALockItNeverTookWhenSaveFails() {
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return(nil, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestSurfacesAnIndexReadErrorWhenTheTargetIsHeld() {
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return(nil, errors.New("redis down"))

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

// A queued job whose claim lapsed while it waited is still queued: returning
// it, not queueing a duplicate, is the whole point of the claim.
func (s *SubmitConversionSuite) TestReturnsAQueuedJobEvenWhenItsClaimLapsed() {
	queued := domain.Job{
		ID: "older", Kind: domain.KindTerritory, Slug: "t1",
		Status: domain.JobStatusPending, CreatedAt: submitNow.Add(-time.Hour),
	}
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{queued}, nil)
	// SaveJob and EnqueueJob are unmocked: reaching them fails the test.

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !created)
	assert.DeepEqual(s.T(), got, queued)
}

// Pending past MaxQueueWait is a job nobody will start (a worker that died
// between delivery and markRunning): queue a fresh one.
func (s *SubmitConversionSuite) TestQueuesAnewWhenAPendingJobOutlivedTheQueue() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "older", Kind: domain.KindTerritory, Slug: "t1",
		Status: domain.JobStatusPending, CreatedAt: submitNow.Add(-service.MaxQueueWait),
	}}, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	_, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
}

// A running job whose claim lapsed ran past TargetLockTTL from its own start:
// its worker is gone (the memory cap kills it without a word). Retry.
func (s *SubmitConversionSuite) TestQueuesAnewWhenARunningJobsClaimLapsed() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{{
		ID: "older", Kind: domain.KindTerritory, Slug: "t1",
		Status: domain.JobStatusRunning, CreatedAt: submitNow.Add(-time.Minute),
	}}, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	_, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
}

// The claim just taken is released when the index cannot be read, or the
// target would sit claimed with no job behind it for the whole TTL.
func (s *SubmitConversionSuite) TestReleasesTheLockWhenTheIndexReadFails() {
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.ListTargetJobsMock.Return(nil, errors.New("redis down"))
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	_, _, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

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

// A user's submit that lands on a live backfill adopts it: the user is handed
// that job, so its failure is theirs to see. The mark is cleared field-wise —
// a whole-job save here could rewind a worker that marked it Running meanwhile.
func (s *SubmitConversionSuite) TestUserSubmitAdoptsALiveBackfill() {
	for _, tc := range []struct {
		name   string
		locked bool
		live   domain.Job
	}{
		{"queued", true, domain.Job{ID: "bf", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending, Backfill: true, CreatedAt: submitNow}},
		{"running", false, domain.Job{ID: "bf", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning, Backfill: true}},
	} {
		s.SetupTest()
		adopted := tc.live
		adopted.Backfill = false
		s.queue.TryLockTargetMock.Return(tc.locked, nil)
		s.queue.ListTargetJobsMock.Return([]domain.Job{tc.live}, nil)
		s.queue.ClearBackfillMock.Expect(s.ctx, "bf").Return(nil)

		got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")

		assert.NilError(s.T(), err, tc.name)
		assert.Assert(s.T(), !created, tc.name)
		assert.DeepEqual(s.T(), got, adopted)
	}
}

// A failed adoption is the caller's error and releases nothing: the live job
// is being looked after, and any claim here is either not ours or still needed.
// UnlockTarget is unmocked: reaching it fails the test.
func (s *SubmitConversionSuite) TestAdoptFailureSurfacesAndKeepsTheClaim() {
	for _, locked := range []bool{true, false} {
		s.SetupTest()
		live := domain.Job{
			ID: "bf", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending,
			Backfill: true, CreatedAt: submitNow,
		}
		s.queue.TryLockTargetMock.Return(locked, nil)
		s.queue.ListTargetJobsMock.Return([]domain.Job{live}, nil)
		s.queue.ClearBackfillMock.Return(errors.New("redis down"))

		got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")

		assert.ErrorContains(s.T(), err, "adopt: redis down")
		assert.Assert(s.T(), !created)
		assert.DeepEqual(s.T(), got, domain.Job{})
	}
}

// A queued job is returned whether or not the claim was free, untouched when
// the caller is not the reconciler's backfill and the job is not a backfill.
func (s *SubmitConversionSuite) TestReturnsAQueuedJobWhenTheClaimIsHeldByAnother() {
	queued := domain.Job{
		ID: "older", Kind: domain.KindTerritory, Slug: "t1",
		Status: domain.JobStatusPending, CreatedAt: submitNow.Add(-time.Second),
	}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{queued}, nil)

	got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !created)
	assert.DeepEqual(s.T(), got, queued)
}

// The index holds the target's latest job first; a terminal one decides, even
// if an older live entry follows it.
func (s *SubmitConversionSuite) TestFirstIndexEntryOfTheTargetDecidesLiveness() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.TryLockTargetMock.Return(false, nil)
	s.queue.ListTargetJobsMock.Return([]domain.Job{
		{ID: "newer", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusSucceeded},
		{ID: "older", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning},
	}, nil)
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	_, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), created)
}

// Every step's failure is named in its error. Only a claim this call took is
// released, and only by the steps before the job is queued: once it is saved
// and enqueued the claim stays (markRunning re-takes it), so a failed read-back
// releases nothing. UnlockTarget is unmocked where it must not be reached.
func (s *SubmitConversionSuite) TestFailureAtEachStepNamesItAndReleasesOnlyAnOwnedClaim() {
	boom := errors.New("redis down")
	steps := []struct {
		name         string
		wantErr      string
		releasesLock bool // when the claim is ours
		arrange      func(locked bool)
	}{
		{"lock", "lock: redis down", false, func(bool) {
			s.queue.TryLockTargetMock.Return(false, boom)
		}},
		{"index", "index: redis down", true, func(locked bool) {
			s.queue.TryLockTargetMock.Return(locked, nil)
			s.queue.ListTargetJobsMock.Return(nil, boom)
		}},
		{"save", "save: redis down", true, func(locked bool) {
			s.queue.TryLockTargetMock.Return(locked, nil)
			s.queue.ListTargetJobsMock.Return(nil, nil)
			s.queue.SaveJobMock.Return(boom)
		}},
		{"enqueue", "enqueue: redis down", true, func(locked bool) {
			s.queue.TryLockTargetMock.Return(locked, nil)
			s.queue.ListTargetJobsMock.Return(nil, nil)
			s.queue.SaveJobMock.Return(nil)
			s.queue.EnqueueJobMock.Return(boom)
		}},
		{"get", "get: redis down", false, func(locked bool) {
			s.queue.TryLockTargetMock.Return(locked, nil)
			s.queue.ListTargetJobsMock.Return(nil, nil)
			s.queue.SaveJobMock.Return(nil)
			s.queue.EnqueueJobMock.Return(nil)
			s.queue.GetJobMock.Return(domain.Job{}, boom)
		}},
	}
	for _, st := range steps {
		for _, locked := range []bool{true, false} {
			s.SetupTest()
			st.arrange(locked)
			if locked && st.releasesLock {
				s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)
			}

			got, created, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")

			assert.ErrorContains(s.T(), err, st.wantErr)
			assert.Assert(s.T(), !created, st.name)
			assert.DeepEqual(s.T(), got, domain.Job{})
		}
	}
}

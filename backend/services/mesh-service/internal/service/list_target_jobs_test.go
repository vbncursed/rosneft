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

type ListTargetJobsSuite struct {
	suite.Suite
	queue *mocks.QueueMock
	svc   *service.Mesh
	ctx   context.Context
}

func TestListTargetJobsSuite(t *testing.T) { suite.Run(t, new(ListTargetJobsSuite)) }

func (s *ListTargetJobsSuite) SetupTest() {
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

func (s *ListTargetJobsSuite) TestReturnsWhatTheQueueIndexed() {
	jobs := []domain.Job{{ID: "j1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusRunning}}
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(jobs, nil)
	got, err := s.svc.ListTargetJobs(s.ctx)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, jobs)
}

func (s *ListTargetJobsSuite) TestPassesTheQueueErrorThrough() {
	boom := errors.New("redis down")
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(nil, boom)
	_, err := s.svc.ListTargetJobs(s.ctx)
	assert.ErrorIs(s.T(), err, boom)
}

// A failed backfill is the reconciler's own housekeeping on a target whose
// viewer works: it must not read as a failed conversion in the job list.
// Everything else stays: a backfill that is queued or running ("converting"),
// and a failed job a user caused (first conversion, replace-source).
func (s *ListTargetJobsSuite) TestHidesOnlyAFailedBackfill() {
	jobs := []domain.Job{
		{ID: "bf-failed", Kind: domain.KindTerritory, Slug: "a", Status: domain.JobStatusFailed, Backfill: true},
		{
			ID:             "bf-onsource",
			Kind:           domain.KindTerritory,
			Slug:           "b",
			Status:         domain.JobStatusFailed,
			Backfill:       true,
			FailedOnSource: true,
		},
		{ID: "bf-pending", Kind: domain.KindTerritory, Slug: "c", Status: domain.JobStatusPending, Backfill: true},
		{ID: "bf-running", Kind: domain.KindModel, Slug: "d", Status: domain.JobStatusRunning, Backfill: true},
		{ID: "user-failed", Kind: domain.KindModel, Slug: "e", Status: domain.JobStatusFailed},
	}
	s.queue.ListTargetJobsMock.Expect(s.ctx).Return(jobs, nil)

	got, err := s.svc.ListTargetJobs(s.ctx)

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, jobs[2:])
}

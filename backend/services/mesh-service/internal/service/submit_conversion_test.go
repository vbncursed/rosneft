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
	_, err := s.svc.SubmitConversion(s.ctx, domain.KindUnspecified, "t1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestRejectsEmptySlug() {
	_, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestSavesPendingJobAndEnqueues() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ID, "fixed-id")
	assert.Equal(s.T(), got.Status, domain.JobStatusPending)
	assert.Equal(s.T(), got.Kind, domain.KindTerritory)
	assert.Equal(s.T(), got.Slug, "t1")
}

func (s *SubmitConversionSuite) TestModelKindIsForwarded() {
	job := domain.Job{ID: "fixed-id", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending}
	s.queue.SaveJobMock.Expect(s.ctx, job).Return(nil)
	s.queue.EnqueueJobMock.Expect(s.ctx, "fixed-id").Return(nil)
	s.queue.GetJobMock.Expect(s.ctx, "fixed-id").Return(job, nil)

	got, err := s.svc.SubmitConversion(s.ctx, domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Kind, domain.KindModel)
}

func (s *SubmitConversionSuite) TestSaveFailureSurfaces() {
	// Save fails first → enqueue is never reached (EnqueueJobMock unmocked).
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	_, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
}

func (s *SubmitConversionSuite) TestEnqueueFailureSurfaces() {
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(errors.New("redis full"))
	_, err := s.svc.SubmitConversion(s.ctx, domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis full")
}

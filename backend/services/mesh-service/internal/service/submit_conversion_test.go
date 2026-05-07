package service_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

type SubmitConversionSuite struct {
	suite.Suite
	queue *fakeQueue
	svc   *service.Mesh
}

func TestSubmitConversionSuite(t *testing.T) {
	suite.Run(t, new(SubmitConversionSuite))
}

func (s *SubmitConversionSuite) SetupTest() {
	s.queue = newFakeQueue()
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: newFakeCatalog(),
		Blobs:   &fakeBlobs{},
		IDGen:   func() string { return "fixed-id" },
	})
}

func (s *SubmitConversionSuite) TestRejectsUnspecifiedKind() {
	_, err := s.svc.SubmitConversion(s.T().Context(), domain.KindUnspecified, "t1")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestRejectsEmptySlug() {
	_, err := s.svc.SubmitConversion(s.T().Context(), domain.KindTerritory, "")
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *SubmitConversionSuite) TestSavesPendingJobAndEnqueues() {
	job, err := s.svc.SubmitConversion(s.T().Context(), domain.KindTerritory, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), job.ID, "fixed-id")
	assert.Equal(s.T(), job.Status, domain.JobStatusPending)
	assert.Equal(s.T(), job.Kind, domain.KindTerritory)
	assert.Equal(s.T(), job.Slug, "t1")
	assert.Equal(s.T(), len(s.queue.enqueued), 1)
	assert.Equal(s.T(), s.queue.enqueued[0], "fixed-id")
}

func (s *SubmitConversionSuite) TestModelKindIsForwarded() {
	job, err := s.svc.SubmitConversion(s.T().Context(), domain.KindModel, "m1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), job.Kind, domain.KindModel)
}

func (s *SubmitConversionSuite) TestSaveFailureSurfaces() {
	s.queue.ErrSave = errors.New("redis down")
	_, err := s.svc.SubmitConversion(s.T().Context(), domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), len(s.queue.enqueued), 0) // never reached enqueue
}

func (s *SubmitConversionSuite) TestEnqueueFailureSurfaces() {
	s.queue.ErrEnqueue = errors.New("redis full")
	_, err := s.svc.SubmitConversion(s.T().Context(), domain.KindTerritory, "t1")
	assert.ErrorContains(s.T(), err, "redis full")
}

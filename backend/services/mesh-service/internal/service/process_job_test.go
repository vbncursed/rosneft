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

type ProcessJobSuite struct {
	suite.Suite
	queue   *mocks.QueueMock
	catalog *mocks.CatalogMock
	svc     *service.Mesh
	ctx     context.Context
}

func TestProcessJobSuite(t *testing.T) { suite.Run(t, new(ProcessJobSuite)) }

func (s *ProcessJobSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.queue = mocks.NewQueueMock(mc)
	s.catalog = mocks.NewCatalogMock(mc)
	s.svc = service.New(service.Config{
		Queue:     s.queue,
		Catalog:   s.catalog,
		Converter: mocks.NewConverterMock(mc),
		Blobs:     mocks.NewBlobStoreMock(mc),
		IDGen:     func() string { return "id" },
	})
	s.ctx = s.T().Context()
}

// TestUnlocksTargetOnConversionFailure is the regression check for the MINOR
// fix in this branch's final review: process_job.go used to release the
// reconciler's target claim only on success, leaving a failed conversion
// holding it for the full TTL — silently disagreeing with
// ReconcileMissingArtifacts, which releases on a submit failure so the
// reconciler can retry right away. ProcessJob must now do the same on a
// conversion failure.
func (s *ProcessJobSuite) TestUnlocksTargetOnConversionFailure() {
	job := domain.Job{ID: "job-1", Kind: domain.KindTerritory, Slug: "t1", Status: domain.JobStatusPending}
	s.queue.GetJobMock.Return(job, nil)

	var saved []domain.Job
	s.queue.SaveJobMock.Set(func(_ context.Context, j domain.Job) error {
		saved = append(saved, j)
		return nil
	})

	s.catalog.GetTargetMock.Return(domain.ConversionTarget{}, errors.New("catalog down"))
	// QueueMock.UnlockTargetMock.Return sets a default expectation the
	// controller requires to be called at least once (see
	// QueueMock.MinimockUnlockTargetInspect) — this is what makes the
	// assertion, not just a stub.
	s.queue.UnlockTargetMock.Expect(s.ctx, domain.KindTerritory, "t1").Return(nil)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.ErrorContains(s.T(), err, "catalog down")
	assert.Assert(s.T(), len(saved) > 0)
	assert.Equal(s.T(), saved[len(saved)-1].Status, domain.JobStatusFailed)
}

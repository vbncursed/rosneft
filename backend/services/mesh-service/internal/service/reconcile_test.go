package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

type ReconcileSuite struct {
	suite.Suite
	queue   *fakeQueue
	catalog *fakeCatalog
	svc     *service.Mesh
	idCalls int
}

func TestReconcileSuite(t *testing.T) {
	suite.Run(t, new(ReconcileSuite))
}

func (s *ReconcileSuite) SetupTest() {
	s.queue = newFakeQueue()
	s.catalog = newFakeCatalog()
	s.idCalls = 0
	s.svc = service.New(service.Config{
		Queue:   s.queue,
		Catalog: s.catalog,
		Blobs:   &fakeBlobs{},
		IDGen: func() string {
			s.idCalls++
			return "id-" + string(rune('0'+s.idCalls))
		},
	})
}

func (s *ReconcileSuite) TestNothingToReconcileWhenAllHaveLOD0() {
	s.catalog.Targets = []domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}
	s.catalog.HasLOD0Set["territory/t1"] = true
	s.catalog.HasLOD0Set["model/m1"] = true

	queued, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 0)
	assert.Equal(s.T(), len(s.queue.enqueued), 0)
}

func (s *ReconcileSuite) TestQueuesOnlyMissingTargets() {
	s.catalog.Targets = []domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
		{Kind: domain.KindModel, Slug: "m1", SourceBlobHash: "h"},
	}
	s.catalog.HasLOD0Set["territory/t1"] = true
	// t2 and m1 are missing — both should be queued.

	queued, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), queued, 2)
	assert.Equal(s.T(), len(s.queue.enqueued), 2)
}

func (s *ReconcileSuite) TestStopsOnListTargetsError() {
	s.catalog.ErrListTargets = errors.New("catalog down")
	_, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.ErrorContains(s.T(), err, "catalog down")
}

func (s *ReconcileSuite) TestSurfaceLOD0CheckErrorOnFirstFailure() {
	s.catalog.Targets = []domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
	}
	s.catalog.ErrHasLOD0 = errors.New("db blip")
	_, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.ErrorContains(s.T(), err, "db blip")
}

func (s *ReconcileSuite) TestStopsOnSubmitFailure() {
	s.catalog.Targets = []domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}
	s.queue.ErrSave = errors.New("redis down")
	queued, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.ErrorContains(s.T(), err, "redis down")
	assert.Equal(s.T(), queued, 0)
}

func (s *ReconcileSuite) TestRespectsCancelledContext() {
	s.catalog.Targets = []domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1", SourceBlobHash: "h"},
		{Kind: domain.KindTerritory, Slug: "t2", SourceBlobHash: "h"},
	}
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()
	_, err := s.svc.ReconcileMissingArtifacts(ctx)
	assert.Assert(s.T(), err != nil)
}

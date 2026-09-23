package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

type CountAuditDaySuite struct {
	suite.Suite
	audit *mocks.AuditMock
	svc   *service.Gateway
	ctx   context.Context
}

func TestCountAuditDaySuite(t *testing.T) { suite.Run(t, new(CountAuditDaySuite)) }

func (s *CountAuditDaySuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.audit = mocks.NewAuditMock(mc)
	s.svc = service.New(mocks.NewCatalogMock(mc), mocks.NewContentMock(mc), mocks.NewMeshMock(mc), mocks.NewUploadMock(mc), s.audit, mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

var now = time.Date(2026, 9, 23, 14, 37, 12, 0, time.UTC)

// The 24 hourly buckets the journal page draws start at the running hour minus
// 23: bucket 0 is 15:00 yesterday when it is 14:37 now.
func (s *CountAuditDaySuite) TestCountsTheBucketsTheJournalDraws() {
	s.audit.ListEntriesMock.Expect(s.ctx, domain.AuditQuery{
		CompanyID: "co-1", From: time.Date(2026, 9, 22, 15, 0, 0, 0, time.UTC), Limit: 1, IncludeTotal: true,
	}).Return(domain.AuditPage{Total: 42}, nil)

	n, err := s.svc.CountAuditDay(s.ctx, domain.AuditScope{Company: "co-1"}, now)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(42))
}

func (s *CountAuditDaySuite) TestRootCountsEveryCompany() {
	s.audit.ListEntriesMock.Expect(s.ctx, domain.AuditQuery{
		AllCompanies: true, From: time.Date(2026, 9, 22, 15, 0, 0, 0, time.UTC), Limit: 1, IncludeTotal: true,
	}).Return(domain.AuditPage{Total: 7}, nil)

	n, err := s.svc.CountAuditDay(s.ctx, domain.AuditScope{All: true}, now)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(7))
}

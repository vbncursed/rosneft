package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// MeasurementsSuite covers the gateway's guards in front of catalog. The chain's
// shape rules (two points, three when closed, at most 1000, finite values) are
// catalog's and come back as InvalidArgument; the gateway only refuses what should never
// cost an RPC.
type MeasurementsSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	svc *service.Gateway
	ctx context.Context
}

func TestMeasurementsSuite(t *testing.T) {
	suite.Run(t, new(MeasurementsSuite))
}

func (s *MeasurementsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), mocks.NewAuditMock(mc), mocks.NewAuthMock(mc))
	s.ctx = s.T().Context()
}

func chainOf(n int) domain.Measurement {
	return domain.Measurement{ID: 3, TerritorySlug: "yard", Points: make([]domain.Vec3, n)}
}

func (s *MeasurementsSuite) TestForwardsEachCallWithItsSlug() {
	m := chainOf(2)
	s.cat.ListMeasurementsMock.Expect(s.ctx, "yard").Return([]domain.Measurement{m}, nil)
	s.cat.CreateMeasurementMock.Expect(s.ctx, m).Return(m, nil)
	s.cat.UpdateMeasurementMock.Expect(s.ctx, m).Return(m, nil)
	s.cat.DeleteMeasurementMock.Expect(s.ctx, "yard", int64(3)).Return(nil)
	s.cat.DeleteMeasurementsMock.Expect(s.ctx, "yard").Return(5, nil)

	list, err := s.svc.ListMeasurements(s.ctx, "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(list), 1)
	_, err = s.svc.CreateMeasurement(s.ctx, m)
	assert.NilError(s.T(), err)
	_, err = s.svc.UpdateMeasurement(s.ctx, m)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.DeleteMeasurement(s.ctx, "yard", 3))
	n, err := s.svc.DeleteMeasurements(s.ctx, "yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 5)
}

// Every call is refused before catalog is reached: the mock has no
// expectations, so a forwarded call fails the test.
func (s *MeasurementsSuite) TestRefusesWhatShouldNeverReachCatalog() {
	noSlug := chainOf(2)
	noSlug.TerritorySlug = ""
	noID := chainOf(2)
	noID.ID = 0
	cases := []struct {
		name string
		call func() error
	}{
		{name: "list without slug", call: func() error {
			_, err := s.svc.ListMeasurements(s.ctx, "")
			return err
		}},
		{name: "create without slug", call: func() error {
			_, err := s.svc.CreateMeasurement(s.ctx, noSlug)
			return err
		}},
		{name: "update without slug", call: func() error {
			_, err := s.svc.UpdateMeasurement(s.ctx, noSlug)
			return err
		}},
		{name: "update without id", call: func() error {
			_, err := s.svc.UpdateMeasurement(s.ctx, noID)
			return err
		}},
		{name: "delete without slug", call: func() error { return s.svc.DeleteMeasurement(s.ctx, "", 3) }},
		{name: "delete without id", call: func() error { return s.svc.DeleteMeasurement(s.ctx, "yard", 0) }},
		{name: "delete all without slug", call: func() error {
			_, err := s.svc.DeleteMeasurements(s.ctx, "")
			return err
		}},
	}
	for _, tc := range cases {
		s.Run(tc.name, func() {
			assert.ErrorIs(s.T(), tc.call(), domain.ErrInvalidInput)
		})
	}
}

// The point cap is catalog's alone: the gateway's body limit already bounds
// what an RPC can carry, and a second copy of the number could drift. An
// oversized chain is forwarded and catalog's refusal comes back as invalid
// input (the client maps InvalidArgument), which the handler answers with 400.
func (s *MeasurementsSuite) TestThePointCapIsCatalogs() {
	m := chainOf(1001)
	refusal := errors.Join(domain.ErrInvalidInput, errors.New("at most 1000 points"))
	s.cat.CreateMeasurementMock.Expect(s.ctx, m).Return(domain.Measurement{}, refusal)

	_, err := s.svc.CreateMeasurement(s.ctx, m)

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

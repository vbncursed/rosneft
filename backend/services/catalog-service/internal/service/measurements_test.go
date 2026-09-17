package service_test

import (
	"context"
	"math"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type MeasurementsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestMeasurementsSuite(t *testing.T) { suite.Run(t, new(MeasurementsSuite)) }

func (s *MeasurementsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

// line returns an open chain of n points on territory t1.
func line(n int) domain.Measurement {
	m := domain.Measurement{TerritorySlug: "t1"}
	for i := range n {
		m.Points = append(m.Points, domain.Vec3{X: float64(i)})
	}
	return m
}

func (s *MeasurementsSuite) TestListRejectsEmptySlug() {
	_, err := s.svc.ListMeasurements(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestListDelegates() {
	s.repo.ListMeasurementsMock.Expect(s.ctx, "t1").Return([]domain.Measurement{line(2)}, nil)
	out, err := s.svc.ListMeasurements(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *MeasurementsSuite) TestCreateRejectsInvalidChains() {
	nan, inf := line(2), line(3)
	nan.Points[1].Y = math.NaN()
	inf.Points[2].Z = math.Inf(-1)
	closedPair := line(2)
	closedPair.Closed = true
	noSlug := line(2)
	noSlug.TerritorySlug = ""

	tests := []struct {
		name string
		m    domain.Measurement
	}{
		{"empty territory slug", noSlug},
		{"no points", line(0)},
		{"a single point", line(1)},
		{"a closed chain of two points", closedPair},
		{"more than a thousand points", line(1001)},
		{"a nan coordinate", nan},
		{"an infinite coordinate", inf},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			_, err := s.svc.CreateMeasurement(s.ctx, tt.m)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		})
	}
}

func (s *MeasurementsSuite) TestCreateAcceptsTheBoundaries() {
	closedTriangle := line(3)
	closedTriangle.Closed = true
	for _, m := range []domain.Measurement{line(2), closedTriangle, line(1000)} {
		s.repo.CreateMeasurementMock.When(s.ctx, m).Then(m, nil)
		_, err := s.svc.CreateMeasurement(s.ctx, m)
		assert.NilError(s.T(), err)
	}
}

func (s *MeasurementsSuite) TestUpdateRejectsMissingID() {
	_, err := s.svc.UpdateMeasurement(s.ctx, line(2))
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestUpdateRejectsEmptySlug() {
	m := line(2)
	m.ID, m.TerritorySlug = 1, ""
	_, err := s.svc.UpdateMeasurement(s.ctx, m)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestUpdateRejectsAnInvalidChain() {
	m := line(1)
	m.ID = 1
	_, err := s.svc.UpdateMeasurement(s.ctx, m)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestUpdatePassesNotFoundThrough() {
	m := line(2)
	m.ID = 7
	s.repo.UpdateMeasurementMock.Expect(s.ctx, m).Return(domain.Measurement{}, domain.ErrMeasurementNotFound)
	_, err := s.svc.UpdateMeasurement(s.ctx, m)
	assert.ErrorIs(s.T(), err, domain.ErrMeasurementNotFound)
}

func (s *MeasurementsSuite) TestDeleteRejectsBadArguments() {
	assert.ErrorIs(s.T(), s.svc.DeleteMeasurement(s.ctx, "", 1), domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeleteMeasurement(s.ctx, "t1", 0), domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestDeleteForwardsTerritorySlug() {
	s.repo.DeleteMeasurementMock.Expect(s.ctx, "t1", int64(3)).Return(nil)
	assert.NilError(s.T(), s.svc.DeleteMeasurement(s.ctx, "t1", 3))
}

func (s *MeasurementsSuite) TestDeleteAllRejectsEmptySlug() {
	_, err := s.svc.DeleteMeasurements(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeasurementsSuite) TestDeleteAllReturnsTheCount() {
	s.repo.DeleteMeasurementsMock.Expect(s.ctx, "t1").Return(4, nil)
	n, err := s.svc.DeleteMeasurements(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 4)
}

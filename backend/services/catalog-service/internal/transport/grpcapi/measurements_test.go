package grpcapi_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/transport/grpcapi/mocks"
)

type MeasurementsSuite struct {
	suite.Suite
	svc *mocks.ServiceMock
	srv *grpcapi.Server
	ctx context.Context
}

func TestMeasurementsSuite(t *testing.T) { suite.Run(t, new(MeasurementsSuite)) }

func (s *MeasurementsSuite) SetupTest() {
	s.svc = mocks.NewServiceMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(s.svc)
	s.ctx = s.T().Context()
}

var (
	flat  = []float64{1, 2, 3, 4, 5, 6}
	pair  = []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}}
	saved = domain.Measurement{ID: 9, TerritorySlug: "t1", Points: pair, Closed: false, CreatedBy: "u"}
)

func (s *MeasurementsSuite) TestListFlattensEveryChain() {
	s.svc.ListMeasurementsMock.Expect(s.ctx, "t1").Return([]domain.Measurement{saved}, nil)
	out, err := s.srv.ListMeasurements(s.ctx, &catalogv1.ListMeasurementsRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out.GetMeasurements()), 1)
	got := out.GetMeasurements()[0]
	assert.Equal(s.T(), got.GetId(), int64(9))
	assert.Equal(s.T(), got.GetTerritorySlug(), "t1")
	assert.DeepEqual(s.T(), got.GetPoints(), flat)
}

func (s *MeasurementsSuite) TestListOfAnUnknownTerritoryIsNotFound() {
	s.svc.ListMeasurementsMock.Return(nil, domain.ErrTerritoryNotFound)
	_, err := s.srv.ListMeasurements(s.ctx, &catalogv1.ListMeasurementsRequest{TerritorySlug: "x"})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}

func (s *MeasurementsSuite) TestCreateRebuildsPointsFromTheFlatList() {
	s.svc.CreateMeasurementMock.
		Expect(s.ctx, domain.Measurement{TerritorySlug: "t1", Points: pair, Closed: true}).
		Return(saved, nil)
	out, err := s.srv.CreateMeasurement(s.ctx, &catalogv1.CreateMeasurementRequest{
		TerritorySlug: "t1", Points: flat, Closed: true,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetMeasurement().GetId(), int64(9))
}

func (s *MeasurementsSuite) TestARaggedPointListIsInvalidAndNeverReachesTheService() {
	_, err := s.srv.CreateMeasurement(s.ctx, &catalogv1.CreateMeasurementRequest{
		TerritorySlug: "t1", Points: []float64{1, 2, 3, 4},
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
	_, err = s.srv.UpdateMeasurement(s.ctx, &catalogv1.UpdateMeasurementRequest{
		TerritorySlug: "t1", Id: 9, Points: []float64{1, 2},
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *MeasurementsSuite) TestServiceValidationIsInvalidArgument() {
	s.svc.CreateMeasurementMock.Return(domain.Measurement{}, domain.ErrInvalidInput)
	_, err := s.srv.CreateMeasurement(s.ctx, &catalogv1.CreateMeasurementRequest{TerritorySlug: "t1"})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *MeasurementsSuite) TestUpdateForwardsSlugAndID() {
	s.svc.UpdateMeasurementMock.
		Expect(s.ctx, domain.Measurement{ID: 9, TerritorySlug: "t1", Points: pair}).
		Return(saved, nil)
	out, err := s.srv.UpdateMeasurement(s.ctx, &catalogv1.UpdateMeasurementRequest{
		TerritorySlug: "t1", Id: 9, Points: flat,
	})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), out.GetMeasurement().GetPoints(), flat)
}

func (s *MeasurementsSuite) TestAForeignIDIsNotFound() {
	s.svc.UpdateMeasurementMock.Return(domain.Measurement{}, domain.ErrMeasurementNotFound)
	s.svc.DeleteMeasurementMock.Expect(s.ctx, "t2", int64(9)).Return(domain.ErrMeasurementNotFound)

	_, err := s.srv.UpdateMeasurement(s.ctx, &catalogv1.UpdateMeasurementRequest{
		TerritorySlug: "t2", Id: 9, Points: flat,
	})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
	_, err = s.srv.DeleteMeasurement(s.ctx, &catalogv1.DeleteMeasurementRequest{TerritorySlug: "t2", Id: 9})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}

func (s *MeasurementsSuite) TestDeleteAllReportsTheCount() {
	s.svc.DeleteMeasurementsMock.Expect(s.ctx, "t1").Return(3, nil)
	out, err := s.srv.DeleteMeasurements(s.ctx, &catalogv1.DeleteMeasurementsRequest{TerritorySlug: "t1"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.GetDeleted(), uint32(3))
}

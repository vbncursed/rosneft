// In-package test: it substitutes the unexported gRPC stub on Client.
package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// measurementCC records the last request of each measurement call and answers
// with a fixed chain or a fixed error. Hand-written for the reason given in
// clients/audit/entries_test.go: the interface lives in generated proto code.
type measurementCC struct {
	catalogv1.CatalogServiceClient
	err     error
	create  *catalogv1.CreateMeasurementRequest
	update  *catalogv1.UpdateMeasurementRequest
	del     *catalogv1.DeleteMeasurementRequest
	delAll  *catalogv1.DeleteMeasurementsRequest
	listFor string
}

var wireChain = &catalogv1.Measurement{
	Id: 9, TerritorySlug: "yard", Points: []float64{1, 2, 3, 4, 5, 6}, Closed: true,
}

func (m *measurementCC) ListMeasurements(
	_ context.Context, in *catalogv1.ListMeasurementsRequest, _ ...grpc.CallOption,
) (*catalogv1.ListMeasurementsResponse, error) {
	m.listFor = in.GetTerritorySlug()
	return &catalogv1.ListMeasurementsResponse{Measurements: []*catalogv1.Measurement{wireChain}}, m.err
}

func (m *measurementCC) CreateMeasurement(
	_ context.Context, in *catalogv1.CreateMeasurementRequest, _ ...grpc.CallOption,
) (*catalogv1.CreateMeasurementResponse, error) {
	m.create = in
	return &catalogv1.CreateMeasurementResponse{Measurement: wireChain}, m.err
}

func (m *measurementCC) UpdateMeasurement(
	_ context.Context, in *catalogv1.UpdateMeasurementRequest, _ ...grpc.CallOption,
) (*catalogv1.UpdateMeasurementResponse, error) {
	m.update = in
	return &catalogv1.UpdateMeasurementResponse{Measurement: wireChain}, m.err
}

func (m *measurementCC) DeleteMeasurement(
	_ context.Context, in *catalogv1.DeleteMeasurementRequest, _ ...grpc.CallOption,
) (*catalogv1.DeleteMeasurementResponse, error) {
	m.del = in
	return &catalogv1.DeleteMeasurementResponse{}, m.err
}

func (m *measurementCC) DeleteMeasurements(
	_ context.Context, in *catalogv1.DeleteMeasurementsRequest, _ ...grpc.CallOption,
) (*catalogv1.DeleteMeasurementsResponse, error) {
	m.delAll = in
	return &catalogv1.DeleteMeasurementsResponse{Deleted: 4}, m.err
}

type MeasurementsSuite struct {
	suite.Suite
	cc  *measurementCC
	cli *Client
}

func TestMeasurementsSuite(t *testing.T) {
	suite.Run(t, new(MeasurementsSuite))
}

func (s *MeasurementsSuite) SetupTest() {
	s.cc = &measurementCC{}
	s.cli = &Client{cc: s.cc}
}

var chain = []domain.Vec3{{X: 1, Y: 2, Z: 3}, {X: 4, Y: 5, Z: 6}}

func (s *MeasurementsSuite) TestCreateFlattensThePointsInOrder() {
	got, err := s.cli.CreateMeasurement(s.T().Context(),
		domain.Measurement{TerritorySlug: "yard", Points: chain, Closed: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.create.GetTerritorySlug(), "yard")
	assert.DeepEqual(s.T(), s.cc.create.GetPoints(), []float64{1, 2, 3, 4, 5, 6})
	assert.Assert(s.T(), s.cc.create.GetClosed())
	assert.Equal(s.T(), got.ID, int64(9))
	assert.DeepEqual(s.T(), got.Points, chain)
}

func (s *MeasurementsSuite) TestListRebuildsThePoints() {
	got, err := s.cli.ListMeasurements(s.T().Context(), "yard")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.listFor, "yard")
	assert.Equal(s.T(), len(got), 1)
	assert.Equal(s.T(), got[0].TerritorySlug, "yard")
	assert.Assert(s.T(), got[0].Closed)
	assert.DeepEqual(s.T(), got[0].Points, chain)
}

// The catalog's check constraint keeps the array a multiple of three; a stray
// tail must not become a phantom point at the origin.
func (s *MeasurementsSuite) TestUnflattenIgnoresAPartialTail() {
	assert.DeepEqual(s.T(), pointsFromFlat([]float64{1, 2, 3, 4}), []domain.Vec3{{X: 1, Y: 2, Z: 3}})
	assert.DeepEqual(s.T(), pointsFromFlat(nil), []domain.Vec3{})
}

func (s *MeasurementsSuite) TestUpdateCarriesTheSlugAndID() {
	_, err := s.cli.UpdateMeasurement(s.T().Context(),
		domain.Measurement{ID: 9, TerritorySlug: "yard", Points: chain})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.update.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), s.cc.update.GetId(), int64(9))
	assert.DeepEqual(s.T(), s.cc.update.GetPoints(), []float64{1, 2, 3, 4, 5, 6})
}

func (s *MeasurementsSuite) TestDeleteCarriesTheSlugAndID() {
	assert.NilError(s.T(), s.cli.DeleteMeasurement(s.T().Context(), "yard", 9))
	assert.Equal(s.T(), s.cc.del.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), s.cc.del.GetId(), int64(9))
}

func (s *MeasurementsSuite) TestDeleteAllReturnsTheCount() {
	n, err := s.cli.DeleteMeasurements(s.T().Context(), "yard")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.cc.delAll.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), n, 4)
}

// NotFound means a different thing per call: on an id-addressed call it is the
// row (including a row of another territory), on the others the territory.
func (s *MeasurementsSuite) TestNotFoundMapsToTheRightSentinel() {
	s.cc.err = status.Error(codes.NotFound, "nope")
	ctx := s.T().Context()

	_, err := s.cli.UpdateMeasurement(ctx, domain.Measurement{ID: 9, TerritorySlug: "yard"})
	assert.ErrorIs(s.T(), err, domain.ErrMeasurementNotFound)
	assert.ErrorIs(s.T(), s.cli.DeleteMeasurement(ctx, "yard", 9), domain.ErrMeasurementNotFound)

	_, err = s.cli.CreateMeasurement(ctx, domain.Measurement{TerritorySlug: "yard"})
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
	_, err = s.cli.ListMeasurements(ctx, "yard")
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
	_, err = s.cli.DeleteMeasurements(ctx, "yard")
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *MeasurementsSuite) TestInvalidArgumentBecomesInvalidInput() {
	s.cc.err = status.Error(codes.InvalidArgument, "a closed chain needs three points")

	_, err := s.cli.CreateMeasurement(s.T().Context(), domain.Measurement{TerritorySlug: "yard"})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

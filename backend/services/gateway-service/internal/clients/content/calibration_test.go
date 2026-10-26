// In-package test: it substitutes the unexported gRPC stub on Client.
package content

import (
	"context"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// calibrationCC records the last request and echoes the calibration it was
// sent, or answers with err.
type calibrationCC struct {
	contentv1.ContentServiceClient
	err error
	put *contentv1.PutDocumentCalibrationRequest
	del *contentv1.DeleteDocumentCalibrationRequest
}

func (c *calibrationCC) PutDocumentCalibration(
	_ context.Context, in *contentv1.PutDocumentCalibrationRequest, _ ...grpc.CallOption,
) (*contentv1.PutDocumentCalibrationResponse, error) {
	c.put = in
	return &contentv1.PutDocumentCalibrationResponse{Calibration: in.GetCalibration()}, c.err
}

func (c *calibrationCC) DeleteDocumentCalibration(
	_ context.Context, in *contentv1.DeleteDocumentCalibrationRequest, _ ...grpc.CallOption,
) (*contentv1.DeleteDocumentCalibrationResponse, error) {
	c.del = in
	return &contentv1.DeleteDocumentCalibrationResponse{}, c.err
}

type CalibrationSuite struct{ suite.Suite }

func TestCalibrationSuite(t *testing.T) { suite.Run(t, new(CalibrationSuite)) }

var calibration = domain.Calibration{Page: 2, Points: []domain.CalibrationPoint{
	{PDF: domain.Vec2{X: 10, Y: 20}, Scene: domain.Vec3{X: 1, Y: 2, Z: 3}, UTM: &domain.UTM{E: 500000, N: 6000000}},
	{PDF: domain.Vec2{X: 30, Y: 40}, Scene: domain.Vec3{X: 4, Y: 5, Z: 6}},
}}

func (s *CalibrationSuite) TestPutRoundTripsPointsWithAndWithoutUTM() {
	cc := &calibrationCC{}

	got, err := (&Client{cc: cc}).PutDocumentCalibration(s.T().Context(), "yard", 9, calibration)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), cc.put.GetTerritorySlug(), "yard")
	assert.Equal(s.T(), cc.put.GetDocumentId(), int64(9))
	assert.Assert(s.T(), cc.put.GetCalibration().GetPoints()[1].UtmE == nil, "an unknown UTM is absent, not zero")
	assert.DeepEqual(s.T(), got, calibration)
}

func (s *CalibrationSuite) TestForeignDocumentIsDocumentNotFound() {
	cc := &calibrationCC{err: status.Error(codes.NotFound, "document not found")}
	c := &Client{cc: cc}

	_, err := c.PutDocumentCalibration(s.T().Context(), "yard", 9, calibration)
	assert.ErrorIs(s.T(), err, domain.ErrDocumentNotFound)
	assert.ErrorIs(s.T(), c.DeleteDocumentCalibration(s.T().Context(), "yard", 9), domain.ErrDocumentNotFound)
	assert.Equal(s.T(), cc.del.GetDocumentId(), int64(9))
}

func (s *CalibrationSuite) TestRefusalKeepsContentsWords() {
	cc := &calibrationCC{err: status.Error(codes.InvalidArgument, "invalid input: a calibration needs 2–20 points")}

	_, err := (&Client{cc: cc}).PutDocumentCalibration(s.T().Context(), "yard", 9, domain.Calibration{Page: 1})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.Equal(s.T(), err.Error(), "invalid input: a calibration needs 2–20 points")
}

func (s *CalibrationSuite) TestDocumentCarriesItsCalibrationOrNil() {
	withIt := documentFromProto(&contentv1.Document{Id: 1, Calibration: &contentv1.Calibration{
		Page: 2, Points: []*contentv1.CalibrationPoint{{PdfX: 1, UtmE: new(5.0), UtmN: new(6.0)}},
	}})
	without := documentFromProto(&contentv1.Document{Id: 2})

	assert.DeepEqual(s.T(), withIt.Calibration, &domain.Calibration{Page: 2, Points: []domain.CalibrationPoint{
		{PDF: domain.Vec2{X: 1}, UTM: &domain.UTM{E: 5, N: 6}},
	}})
	assert.Assert(s.T(), without.Calibration == nil)
}

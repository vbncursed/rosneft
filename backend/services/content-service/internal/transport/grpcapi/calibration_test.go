package grpcapi_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gotest.tools/v3/assert"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/transport/grpcapi"
)

type CalibrationSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	srv  *grpcapi.Server
	ctx  context.Context
}

func TestCalibrationSuite(t *testing.T) { suite.Run(t, new(CalibrationSuite)) }

func (s *CalibrationSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.srv = grpcapi.New(service.New(s.repo, nil))
	s.ctx = s.T().Context()
}

func pair(utmE, utmN *float64) *contentv1.CalibrationPoint {
	return &contentv1.CalibrationPoint{PdfX: 1, PdfY: 2, SceneX: 3, UtmE: utmE, UtmN: utmN}
}

func (s *CalibrationSuite) TestPutRefusesHalfAUTM() {
	e := 5.0
	_, err := s.srv.PutDocumentCalibration(s.ctx, &contentv1.PutDocumentCalibrationRequest{
		TerritorySlug: "a", DocumentId: 1,
		Calibration: &contentv1.Calibration{Page: 1, Points: []*contentv1.CalibrationPoint{pair(&e, nil), pair(nil, nil)}},
	})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *CalibrationSuite) TestPutRoundTripsUTM() {
	e, n := 5.0, 6.0
	want := domain.Calibration{Page: 2, Points: []domain.CalibrationPoint{
		{PDFX: 1, PDFY: 2, Scene: domain.Vec3{X: 3}, UTM: &domain.UTM{E: e, N: n}},
		{PDFX: 1, PDFY: 2, Scene: domain.Vec3{X: 3}},
	}}
	s.repo.PutDocumentCalibrationMock.Expect(minimock.AnyContext, "a", 1, want).Return(want, nil)

	got, err := s.srv.PutDocumentCalibration(s.ctx, &contentv1.PutDocumentCalibrationRequest{
		TerritorySlug: "a", DocumentId: 1,
		Calibration: &contentv1.Calibration{Page: 2, Points: []*contentv1.CalibrationPoint{pair(&e, &n), pair(nil, nil)}},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.GetCalibration().GetPoints()[0].GetUtmN(), 6.0)
	assert.Assert(s.T(), got.GetCalibration().GetPoints()[1].UtmE == nil)
}

func (s *CalibrationSuite) TestForeignDocumentIsNotFound() {
	s.repo.DeleteDocumentCalibrationMock.Expect(minimock.AnyContext, "b", 1).Return(domain.ErrDocumentNotFound)
	_, err := s.srv.DeleteDocumentCalibration(s.ctx, &contentv1.DeleteDocumentCalibrationRequest{TerritorySlug: "b", DocumentId: 1})
	assert.Equal(s.T(), status.Code(err), codes.NotFound)
}

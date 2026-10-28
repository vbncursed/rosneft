package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type CalibrationSuite struct {
	suite.Suite
	svc *calibrationService
	srv *Server
}

func TestCalibrationSuite(t *testing.T) { suite.Run(t, new(CalibrationSuite)) }

func (s *CalibrationSuite) SetupTest() {
	s.svc = &calibrationService{}
	s.srv = New(s.svc)
}

type calibrationService struct {
	Service
	err  error
	slug string
	id   int64
	got  domain.Calibration
}

func (c *calibrationService) PutDocumentCalibration(
	_ context.Context,
	slug string,
	id int64,
	cal domain.Calibration,
) (domain.Calibration, error) {
	c.slug, c.id, c.got = slug, id, cal
	return cal, c.err
}

func (c *calibrationService) DeleteDocumentCalibration(_ context.Context, slug string, id int64) error {
	c.slug, c.id = slug, id
	return c.err
}

var wireCalibration = Calibration{Page: 2, Points: []CalibrationPoint{
	{Pdf: Vec2{X: 10, Y: 20}, Scene: Vec3{X: 1, Y: 2, Z: 3}, Utm: &UtmPoint{E: 500000, N: 6000000}},
	{Pdf: Vec2{X: 30, Y: 40}, Scene: Vec3{X: 4, Y: 5, Z: 6}},
}}

func (s *CalibrationSuite) TestPutTakesSlugAndIdFromTheURLAndMapsThePoints() {
	resp, err := s.srv.PutDocumentCalibration(s.T().Context(), PutDocumentCalibrationRequestObject{
		Slug: "yard", Id: 9, Body: &wireCalibration,
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.svc.slug, "yard")
	assert.Equal(s.T(), s.svc.id, int64(9))
	assert.DeepEqual(s.T(), s.svc.got, domain.Calibration{Page: 2, Points: []domain.CalibrationPoint{
		{PDF: domain.Vec2{X: 10, Y: 20}, Scene: domain.Vec3{X: 1, Y: 2, Z: 3}, UTM: &domain.UTM{E: 500000, N: 6000000}},
		{PDF: domain.Vec2{X: 30, Y: 40}, Scene: domain.Vec3{X: 4, Y: 5, Z: 6}},
	}})
	ok, is := resp.(PutDocumentCalibration200JSONResponse)
	assert.Assert(s.T(), is, "got %T", resp)
	assert.DeepEqual(s.T(), Calibration(ok), wireCalibration)
}

func (s *CalibrationSuite) TestDeleteAnswers204() {
	resp, err := s.srv.DeleteDocumentCalibration(
		s.T().Context(),
		DeleteDocumentCalibrationRequestObject{Slug: "yard", Id: 9},
	)

	assert.NilError(s.T(), err)
	_, ok := resp.(DeleteDocumentCalibration204Response)
	assert.Assert(s.T(), ok, "got %T", resp)
	assert.Equal(s.T(), s.svc.id, int64(9))
}

// A document of another territory is content's ErrDocumentNotFound: 404, like
// an unknown id.
func (s *CalibrationSuite) TestForeignDocumentIs404() {
	s.svc.err = domain.ErrDocumentNotFound
	put, err := s.srv.PutDocumentCalibration(
		s.T().Context(),
		PutDocumentCalibrationRequestObject{Slug: "yard", Id: 9, Body: &wireCalibration},
	)
	assert.NilError(s.T(), err)
	del, err := s.srv.DeleteDocumentCalibration(
		s.T().Context(),
		DeleteDocumentCalibrationRequestObject{Slug: "yard", Id: 9},
	)
	assert.NilError(s.T(), err)

	for _, visit := range []func(http.ResponseWriter) error{put.VisitPutDocumentCalibrationResponse, del.VisitDeleteDocumentCalibrationResponse} {
		code, body := rendered(s.T(), visit)
		assert.Equal(s.T(), code, http.StatusNotFound)
		assert.Assert(s.T(), strings.Contains(body, `"code":"not_found"`), body)
	}
}

func (s *CalibrationSuite) TestRefusalAndMissingBodyAre400() {
	s.svc.err = errors.Join(domain.ErrInvalidInput, errors.New("a calibration needs 2–20 points"))
	put, err := s.srv.PutDocumentCalibration(
		s.T().Context(),
		PutDocumentCalibrationRequestObject{Slug: "yard", Id: 9, Body: &Calibration{Page: 1}},
	)
	assert.NilError(s.T(), err)
	code, body := rendered(s.T(), put.VisitPutDocumentCalibrationResponse)
	assert.Equal(s.T(), code, http.StatusBadRequest)
	assert.Assert(s.T(), strings.Contains(body, "a calibration needs 2–20 points"), body)

	none, err := s.srv.PutDocumentCalibration(s.T().Context(), PutDocumentCalibrationRequestObject{Slug: "yard", Id: 9})
	assert.NilError(s.T(), err)
	code, _ = rendered(s.T(), none.VisitPutDocumentCalibrationResponse)
	assert.Equal(s.T(), code, http.StatusBadRequest)
}

func (s *CalibrationSuite) TestServerFailureNeverEchoesTheError() {
	s.svc.err = errors.New("content.PutDocumentCalibration: dial tcp 10.0.0.8:9007: refused")
	put, err := s.srv.PutDocumentCalibration(
		s.T().Context(),
		PutDocumentCalibrationRequestObject{Slug: "yard", Id: 9, Body: &wireCalibration},
	)
	assert.NilError(s.T(), err)
	del, err := s.srv.DeleteDocumentCalibration(
		s.T().Context(),
		DeleteDocumentCalibrationRequestObject{Slug: "yard", Id: 9},
	)
	assert.NilError(s.T(), err)

	for _, visit := range []func(http.ResponseWriter) error{put.VisitPutDocumentCalibrationResponse, del.VisitDeleteDocumentCalibrationResponse} {
		code, body := rendered(s.T(), visit)
		assert.Equal(s.T(), code, http.StatusInternalServerError)
		assert.Assert(s.T(), !strings.Contains(body, "10.0.0.8"), body)
	}
}

// documentToAPI always carries the calibration key: null when there is none.
func (s *CalibrationSuite) TestDocumentCarriesCalibrationOrNull() {
	without := documentToAPI(domain.Document{ID: 1})
	assert.Assert(s.T(), without.Calibration == nil)

	with := documentToAPI(
		domain.Document{ID: 1, Calibration: &domain.Calibration{Page: 2, Points: []domain.CalibrationPoint{
			{PDF: domain.Vec2{X: 1, Y: 2}, UTM: &domain.UTM{E: 5, N: 6}},
		}}},
	)
	assert.Assert(s.T(), with.Calibration != nil)
	assert.Equal(s.T(), with.Calibration.Page, int32(2))
	assert.DeepEqual(s.T(), with.Calibration.Points[0].Utm, &UtmPoint{E: 5, N: 6})
}

package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/service/mocks"
)

type CalibrationSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Content
	ctx  context.Context
}

func TestCalibrationSuite(t *testing.T) { suite.Run(t, new(CalibrationSuite)) }

func (s *CalibrationSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo, nil)
	s.ctx = s.T().Context()
}

func validCalibration() domain.Calibration {
	return domain.Calibration{Page: 1, Points: []domain.CalibrationPoint{
		{PDFX: 1, PDFY: 2, Scene: domain.Vec3{X: 1}},
		{PDFX: 3, PDFY: 4, Scene: domain.Vec3{X: 2}},
	}}
}

func (s *CalibrationSuite) TestPutValidatesBeforeRepo() {
	_, err := s.svc.PutCalibration(s.ctx, "site-a", 7, domain.Calibration{Page: 1})
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *CalibrationSuite) TestPutRejectsEmptySlugAndBadID() {
	_, err := s.svc.PutCalibration(s.ctx, "", 7, validCalibration())
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
	_, err = s.svc.PutCalibration(s.ctx, "site-a", 0, validCalibration())
	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *CalibrationSuite) TestPutDelegates() {
	c := validCalibration()
	s.repo.PutDocumentCalibrationMock.Expect(minimock.AnyContext, "site-a", 7, c).Return(c, nil)

	got, err := s.svc.PutCalibration(s.ctx, "site-a", 7, c)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), c, got)
}

func (s *CalibrationSuite) TestPutPassesNotFoundThrough() {
	c := validCalibration()
	s.repo.PutDocumentCalibrationMock.Expect(minimock.AnyContext, "site-a", 7, c).
		Return(domain.Calibration{}, domain.ErrDocumentNotFound)

	_, err := s.svc.PutCalibration(s.ctx, "site-a", 7, c)
	assert.Assert(s.T(), errors.Is(err, domain.ErrDocumentNotFound))
}

func (s *CalibrationSuite) TestDeleteRejectsEmptySlugAndBadID() {
	assert.Assert(s.T(), errors.Is(s.svc.DeleteCalibration(s.ctx, "", 7), domain.ErrInvalidInput))
	assert.Assert(s.T(), errors.Is(s.svc.DeleteCalibration(s.ctx, "site-a", -1), domain.ErrInvalidInput))
}

func (s *CalibrationSuite) TestDeletePassesNotFoundThrough() {
	s.repo.DeleteDocumentCalibrationMock.Expect(minimock.AnyContext, "site-a", 7).Return(domain.ErrDocumentNotFound)
	assert.Assert(s.T(), errors.Is(s.svc.DeleteCalibration(s.ctx, "site-a", 7), domain.ErrDocumentNotFound))
}

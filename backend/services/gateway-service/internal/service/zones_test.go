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

type ZonesSuite struct {
	suite.Suite
	cat *mocks.CatalogMock
	con *mocks.ContentMock
	svc *service.Gateway
	ctx context.Context
}

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.con = mocks.NewContentMock(mc)
	s.svc = service.New(
		s.cat,
		s.con,
		mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc),
		mocks.NewAuditMock(mc),
		mocks.NewAuthMock(mc),
	)
	s.ctx = s.T().Context()
}

func (s *ZonesSuite) TestListModelTagsForwards() {
	tags := []domain.ModelTag{{Slug: "camp", Title: "Camp"}, {Slug: "ungrouped", Title: "Ungrouped"}}
	s.cat.ListModelTagsMock.Expect(s.ctx).Return(tags, nil)

	got, err := s.svc.ListModelTags(s.ctx)

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, tags)
}

func (s *ZonesSuite) TestListForwardsTheSlug() {
	zones := []domain.Zone{{ID: 1, Title: "Camp"}}
	s.cat.ListZonesMock.Expect(s.ctx, "yard").Return(zones, nil)

	got, err := s.svc.ListZones(s.ctx, "yard")

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, zones)
}

func (s *ZonesSuite) TestCreateForwardsTheBodyUnderTheSlug() {
	in := domain.ZoneCreate{Title: "Camp", Corners: make([]domain.Vec3, 4), TagSlugs: []string{"camp"}}
	s.cat.CreateZoneMock.Expect(s.ctx, "yard", in).Return(domain.Zone{ID: 3, Title: "Camp"}, nil)

	got, err := s.svc.CreateZone(s.ctx, "yard", in)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.ID, int64(3))
}

func (s *ZonesSuite) TestCreateRefusalIsPassedThrough() {
	refusal := errors.Join(domain.ErrInvalidInput, errors.New("ungrouped cannot be put on a zone"))
	s.cat.CreateZoneMock.Return(domain.Zone{}, refusal)

	_, err := s.svc.CreateZone(s.ctx, "yard", domain.ZoneCreate{TagSlugs: []string{"ungrouped"}})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *ZonesSuite) TestUpdateAndDeleteForwardTheIDUnderTheSlug() {
	patch := domain.ZonePatch{Title: new("Camp 2")}
	s.cat.UpdateZoneMock.Expect(s.ctx, "yard", 4, patch).Return(domain.Zone{ID: 4}, nil)
	s.cat.DeleteZoneMock.Expect(s.ctx, "yard", 4).Return(nil)

	_, err := s.svc.UpdateZone(s.ctx, "yard", 4, patch)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.svc.DeleteZone(s.ctx, "yard", 4))
}

// No catalog expectation: any catalog call would fail the controller.
func (s *ZonesSuite) TestEmptySlugAndBadIDAreRefusedBeforeTheCatalog() {
	_, err := s.svc.ListZones(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.CreateZone(s.ctx, "", domain.ZoneCreate{})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.UpdateZone(s.ctx, "yard", 0, domain.ZonePatch{})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeleteZone(s.ctx, "yard", -1), domain.ErrInvalidInput)
}

func (s *ZonesSuite) TestCalibrationForwardsUnderTheSlug() {
	cal := domain.Calibration{Page: 2, Points: make([]domain.CalibrationPoint, 2)}
	s.con.PutDocumentCalibrationMock.Expect(s.ctx, "yard", 9, cal).Return(cal, nil)
	s.con.DeleteDocumentCalibrationMock.Expect(s.ctx, "yard", 9).Return(nil)

	got, err := s.svc.PutDocumentCalibration(s.ctx, "yard", 9, cal)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, cal)
	assert.NilError(s.T(), s.svc.DeleteDocumentCalibration(s.ctx, "yard", 9))
}

func (s *ZonesSuite) TestCalibrationRefusesEmptySlugAndBadID() {
	_, err := s.svc.PutDocumentCalibration(s.ctx, "", 9, domain.Calibration{})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.PutDocumentCalibration(s.ctx, "yard", 0, domain.Calibration{})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeleteDocumentCalibration(s.ctx, "", 9), domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeleteDocumentCalibration(s.ctx, "yard", 0), domain.ErrInvalidInput)
}

func (s *ZonesSuite) TestModelTagWritesForward() {
	s.cat.CreateModelTagMock.Expect(s.ctx, "welding", "Welding").
		Return(domain.ModelTag{Slug: "welding", Title: "Welding"}, nil)
	s.cat.UpdateModelTagMock.Expect(s.ctx, "camp", "Camps").Return(domain.ModelTag{Slug: "camp", Title: "Camps"}, nil)

	made, err := s.svc.CreateModelTag(s.ctx, "welding", "Welding")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), made.Slug, "welding")

	renamed, err := s.svc.UpdateModelTag(s.ctx, "camp", "Camps")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), renamed.Title, "Camps")
}

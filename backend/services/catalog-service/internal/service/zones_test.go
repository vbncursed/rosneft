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

type ZonesSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func newZone() domain.ZoneCreate {
	return domain.ZoneCreate{
		Title:    "  N2 Area ",
		Corners:  [4]domain.Vec3{{X: 0}, {X: 1}, {X: 1, Z: 1}, {Z: 1}},
		TagSlugs: []string{"nitrogen"},
	}
}

// Validation runs before the repo: minimock fails the test on any repo call.
func (s *ZonesSuite) TestCreateRefusesBeforeStorage() {
	bad := newZone()
	bad.Corners[1].X = math.NaN()
	_, err := s.svc.CreateZone(s.ctx, "t1", bad)
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)

	_, err = s.svc.CreateZone(s.ctx, "", newZone())
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *ZonesSuite) TestCreateHandsStorageTheTrimmedZone() {
	want := newZone()
	want.Title = "N2 Area"
	s.repo.CreateZoneMock.Expect(s.ctx, "t1", want).Return(domain.Zone{ID: 3, Title: "N2 Area"}, nil)
	z, err := s.svc.CreateZone(s.ctx, "t1", newZone())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), z.ID, int64(3))
}

func (s *ZonesSuite) TestUpdateValidatesTagsOnlyWhenSet() {
	// SetTags with an invalid list is refused before storage.
	_, err := s.svc.UpdateZone(s.ctx, "t1", 3, domain.ZonePatch{SetTags: true, TagSlugs: []string{"ungrouped"}})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.UpdateZone(s.ctx, "t1", 3, domain.ZonePatch{SetTags: true})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)

	// Without SetTags the tag list is not looked at.
	patch := domain.ZonePatch{TagSlugs: []string{"ungrouped"}}
	s.repo.UpdateZoneMock.Expect(s.ctx, "t1", int64(3), patch).Return(domain.Zone{ID: 3}, nil)
	_, err = s.svc.UpdateZone(s.ctx, "t1", 3, patch)
	assert.NilError(s.T(), err)
}

func (s *ZonesSuite) TestUpdateTrimsAndChecksTheTitle() {
	_, err := s.svc.UpdateZone(s.ctx, "t1", 3, domain.ZonePatch{Title: new("   ")})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)

	s.repo.UpdateZoneMock.Expect(s.ctx, "t1", int64(3), domain.ZonePatch{Title: new("Camp")}).
		Return(domain.Zone{ID: 3, Title: "Camp"}, nil)
	_, err = s.svc.UpdateZone(s.ctx, "t1", 3, domain.ZonePatch{Title: new(" Camp ")})
	assert.NilError(s.T(), err)
}

func (s *ZonesSuite) TestStorageNotFoundPassesThroughUnchanged() {
	s.repo.UpdateZoneMock.Return(domain.Zone{}, domain.ErrZoneNotFound)
	_, err := s.svc.UpdateZone(s.ctx, "t1", 9, domain.ZonePatch{})
	assert.Equal(s.T(), err, domain.ErrZoneNotFound)

	s.repo.DeleteZoneMock.Return(domain.ErrZoneNotFound)
	assert.Equal(s.T(), s.svc.DeleteZone(s.ctx, "t1", 9), domain.ErrZoneNotFound)
}

func (s *ZonesSuite) TestListAndDeleteForwardTheScope() {
	s.repo.ListZonesMock.Expect(s.ctx, "t1").Return([]domain.Zone{{ID: 1}}, nil)
	zones, err := s.svc.ListZones(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(zones), 1)

	s.repo.DeleteZoneMock.Expect(s.ctx, "t1", int64(1)).Return(nil)
	assert.NilError(s.T(), s.svc.DeleteZone(s.ctx, "t1", 1))

	_, err = s.svc.ListZones(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeleteZone(s.ctx, "", 1), domain.ErrInvalidInput)
}

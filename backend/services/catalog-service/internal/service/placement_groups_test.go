package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

type PlacementGroupsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

// Storage counts the rows it updated against the ids it was handed, so a
// repeated id would read as a missing one: the service hands each id once.
func (s *PlacementGroupsSuite) TestBulkWritesHandEachIDOnce() {
	s.repo.SetPlacementsHiddenMock.Expect(s.ctx, "t1", []int64{1, 2}, true).Return(2, nil)
	n, err := s.svc.SetPlacementsHidden(s.ctx, "t1", []int64{2, 1, 2}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)

	s.repo.SetPlacementsGroupMock.Expect(s.ctx, "t1", []int64{3}, new(int64(7))).Return(1, nil)
	n, err = s.svc.SetPlacementsGroup(s.ctx, "t1", []int64{3, 3}, new(int64(7)))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

func (s *PlacementGroupsSuite) TestNoGroupReachesStorageAsNil() {
	s.repo.SetPlacementsGroupMock.Expect(s.ctx, "t1", []int64{3}, nil).Return(1, nil)
	_, err := s.svc.SetPlacementsGroup(s.ctx, "t1", []int64{3}, nil)
	assert.NilError(s.T(), err)
}

// Refused before storage is asked: minimock fails the test on any repo call.
// The bound applies to the list as sent, before de-duplication.
func (s *PlacementGroupsSuite) TestBulkWritesRefuseAnEmptyOrOversizedList() {
	for _, tc := range []struct {
		name string
		slug string
		ids  []int64
	}{
		{"no territory", "", []int64{1}},
		{"no ids", "t1", nil},
		{"more than a thousand ids", "t1", make([]int64, 1001)},
	} {
		s.Run(tc.name, func() {
			_, err := s.svc.SetPlacementsHidden(s.ctx, tc.slug, tc.ids, true)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
			_, err = s.svc.SetPlacementsGroup(s.ctx, tc.slug, tc.ids, nil)
			assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		})
	}
}

func (s *PlacementGroupsSuite) TestATitleIsTrimmedAndCountedInCharacters() {
	s.repo.CreatePlacementGroupMock.Expect(s.ctx, "t1", "North").
		Return(domain.PlacementGroup{ID: 1, Title: "North"}, nil)
	g, err := s.svc.CreatePlacementGroup(s.ctx, "t1", "  North\n")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), g.Title, "North")

	long := strings.Repeat("я", 120) // 240 bytes, 120 characters: allowed
	s.repo.RenamePlacementGroupMock.Expect(s.ctx, "t1", int64(1), long).
		Return(domain.PlacementGroup{ID: 1, Title: long}, nil)
	_, err = s.svc.RenamePlacementGroup(s.ctx, "t1", 1, long)
	assert.NilError(s.T(), err)
}

func (s *PlacementGroupsSuite) TestABlankOrLongTitleIsInvalid() {
	for _, title := range []string{"", " \t ", strings.Repeat("я", 121)} {
		_, err := s.svc.CreatePlacementGroup(s.ctx, "t1", title)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		_, err = s.svc.RenamePlacementGroup(s.ctx, "t1", 1, title)
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	}
}

func (s *PlacementGroupsSuite) TestAGroupCallNeedsATerritoryAndAnID() {
	_, err := s.svc.ListPlacementGroups(s.ctx, "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.CreatePlacementGroup(s.ctx, "", "North")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	_, err = s.svc.RenamePlacementGroup(s.ctx, "t1", 0, "North")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeletePlacementGroup(s.ctx, "t1", 0), domain.ErrInvalidInput)
	assert.ErrorIs(s.T(), s.svc.DeletePlacementGroup(s.ctx, "", 1), domain.ErrInvalidInput)
}

func (s *PlacementGroupsSuite) TestListAndDeleteDelegate() {
	s.repo.ListPlacementGroupsMock.Expect(s.ctx, "t1").Return([]domain.PlacementGroup{{ID: 1}}, nil)
	out, err := s.svc.ListPlacementGroups(s.ctx, "t1")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)

	s.repo.DeletePlacementGroupMock.Expect(s.ctx, "t1", int64(1)).Return(domain.ErrPlacementGroupNotFound)
	assert.ErrorIs(s.T(), s.svc.DeletePlacementGroup(s.ctx, "t1", 1), domain.ErrPlacementGroupNotFound)
}

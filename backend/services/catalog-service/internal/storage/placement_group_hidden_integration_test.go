//go:build integration

package storage_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Spec D5/D6: hiding a group is the group's own flag. Its members keep
// theirs, so showing the group again does not show a member hidden on its own.
func (s *PlacementGroupsSuite) TestAGroupIsHiddenAndShownByItsOwnFlag() {
	ctx := s.T().Context()
	g, err := s.pg.CreatePlacementGroup(ctx, "a", "North")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !g.Hidden, "a new group is shown")
	_, err = s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID}, &g.ID)
	assert.NilError(s.T(), err)

	hidden, err := s.pg.SetPlacementGroupHidden(ctx, "a", g.ID, true)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), hidden.Hidden)
	assert.Equal(s.T(), hidden.Title, "North")
	assert.Equal(s.T(), hidden.TerritorySlug, "a")

	listed, err := s.pg.ListPlacementGroups(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), listed[0].Hidden)
	member, _ := s.stored(s.p1.ID)
	assert.Assert(s.T(), !member, "hiding a group must not write its placements")

	shown, err := s.pg.SetPlacementGroupHidden(ctx, "a", g.ID, false)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !shown.Hidden)
}

// The gateway's gate checks the slug in the URL only; the id is scoped in SQL.
func (s *PlacementGroupsSuite) TestAGroupOfAnotherTerritoryCannotBeHidden() {
	ctx := s.T().Context()
	g, err := s.pg.CreatePlacementGroup(ctx, "b", "Theirs")
	assert.NilError(s.T(), err)

	for _, id := range []int64{g.ID, 999999} {
		_, err = s.pg.SetPlacementGroupHidden(ctx, "a", id, true)
		assert.ErrorIs(s.T(), err, domain.ErrPlacementGroupNotFound)
	}
	listed, err := s.pg.ListPlacementGroups(ctx, "b")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !listed[0].Hidden)
}

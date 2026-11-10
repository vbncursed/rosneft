//go:build integration

package storage_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *PlacementGroupsSuite) TestSetPlacementVisibility() {
	ctx := s.T().Context()
	group := s.group("a", "visibility")
	_, err := s.pg.SetPlacementsHidden(ctx, "a", []int64{s.p1.ID}, true)
	assert.NilError(s.T(), err)
	_, err = s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID}, &group)
	assert.NilError(s.T(), err)
	before, err := s.pg.UpdatePlacement(ctx, domain.Placement{
		ID: s.p1.ID, TerritorySlug: "a", Position: domain.Vec3{X: 3, Y: 4, Z: 5},
		Rotation: domain.Vec3{X: 0.1, Y: 0.2, Z: 0.3}, Scale: domain.Vec3{X: 1, Y: 2, Z: 3},
	})
	assert.NilError(s.T(), err)

	s.Run("replace and preserve fields", func() {
		_, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, []int64{10, 11})
		assert.NilError(s.T(), err)
		got, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, []int64{12, 10})
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got.VisiblePanoramaIDs, []int64{12, 10})
		assert.DeepEqual(s.T(), got.Position, before.Position)
		assert.DeepEqual(s.T(), got.Rotation, before.Rotation)
		assert.DeepEqual(s.T(), got.Scale, before.Scale)
		assert.Assert(s.T(), got.Hidden)
		assert.DeepEqual(s.T(), got.GroupID, &group)
		listed, err := s.pg.ListPlacements(ctx, "a")
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), listed[0].VisiblePanoramaIDs, []int64{12, 10})
	})
	for _, tc := range []struct {
		name string
		ids  []int64
	}{{"nil", nil}, {"empty", []int64{}}} {
		s.Run(tc.name+" clears", func() {
			_, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, []int64{10})
			assert.NilError(s.T(), err)
			got, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, tc.ids)
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), len(got.VisiblePanoramaIDs), 0)
			listed, err := s.pg.ListPlacements(ctx, "a")
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), len(listed[0].VisiblePanoramaIDs), 0)
		})
	}
	s.Run("panorama validation belongs to service", func() {
		var foreignID int64
		err := s.pool.QueryRow(ctx, `INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
			SELECT id, 'foreign', 'foreign', 'foreign' FROM territories WHERE slug = 'b' RETURNING id`).Scan(&foreignID)
		assert.NilError(s.T(), err)
		ids := []int64{foreignID, 999999999}
		got, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, ids)
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), got.VisiblePanoramaIDs, ids)
		listed, err := s.pg.ListPlacements(ctx, "a")
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), listed[0].VisiblePanoramaIDs, ids)
	})
	s.Run("placement scope", func() {
		original, err := s.pg.SetPlacementVisibility(ctx, "b", s.onB.ID, []int64{42})
		assert.NilError(s.T(), err)
		for _, tc := range []struct {
			name, slug string
			id         int64
		}{
			{"foreign placement", "a", s.onB.ID},
			{"missing placement", "a", 999999999},
			{"missing territory", "missing", s.onB.ID},
		} {
			s.Run(tc.name, func() {
				_, err := s.pg.SetPlacementVisibility(ctx, tc.slug, tc.id, []int64{99})
				assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
			})
		}
		listed, err := s.pg.ListPlacements(ctx, "b")
		assert.NilError(s.T(), err)
		assert.DeepEqual(s.T(), listed[0], original)
	})
}

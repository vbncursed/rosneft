//go:build integration

package storage_test

import (
	"time"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// thumbnailOf reads the column straight from the table, past every scan helper.
func (s *TerritoryScopeSuite) thumbnailOf(id int64) (hash string, updatedAt time.Time) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT thumbnail_blob_hash, updated_at FROM panoramas WHERE id = $1`, id).Scan(&hash, &updatedAt))
	return hash, updatedAt
}

func (s *TerritoryScopeSuite) TestCreatePanoramaStoresItsThumbnail() {
	out, err := s.pg.CreatePanorama(s.T().Context(), domain.Panorama{
		TerritorySlug: "a", Slug: "south", Title: "south", SourceBlobHash: "src", ThumbnailBlobHash: "thumb",
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.ThumbnailBlobHash, "thumb")
	stored, _ := s.thumbnailOf(out.ID)
	assert.Equal(s.T(), stored, "thumb")

	list, err := s.pg.ListPanoramas(s.T().Context(), "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), list[len(list)-1].ThumbnailBlobHash, "thumb")
}

// The backfill runs with no caller behind it, so its work list spans every
// territory. It lists only the rows still missing a thumbnail, oldest first.
func (s *TerritoryScopeSuite) TestListPanoramasWithoutThumbnailCrossesTerritories() {
	ctx := s.T().Context()
	insert := func(slug, thumb string) int64 {
		var id int64
		assert.NilError(s.T(), s.pool.QueryRow(ctx, `
			INSERT INTO panoramas (territory_id, slug, title, source_blob_hash, thumbnail_blob_hash)
			SELECT id, $1, $1, 'src-' || $1, $2 FROM territories WHERE slug = 'b' RETURNING id`,
			slug, thumb).Scan(&id))
		return id
	}
	insert("done", "thumb")
	pendingB := insert("pending", "")

	got, err := s.pg.ListPanoramasWithoutThumbnail(ctx)
	assert.NilError(s.T(), err)
	ids := make([]int64, len(got))
	for i, p := range got {
		ids[i] = p.ID
	}
	assert.DeepEqual(s.T(), ids, []int64{s.panoramaA, pendingB})
	assert.Equal(s.T(), got[1].TerritorySlug, "b")
	assert.Equal(s.T(), got[1].SourceBlobHash, "src-pending")
}

// A second write never replaces a thumbnail, and updated_at does not move:
// the SPA re-keys the anchor card on it, and nobody edited the panorama.
func (s *TerritoryScopeSuite) TestSetPanoramaThumbnailFillsOnlyAnEmptyOne() {
	ctx := s.T().Context()
	_, before := s.thumbnailOf(s.panoramaA)

	assert.NilError(s.T(), s.pg.SetPanoramaThumbnail(ctx, s.panoramaA, "first"))
	assert.NilError(s.T(), s.pg.SetPanoramaThumbnail(ctx, s.panoramaA, "second"))

	hash, after := s.thumbnailOf(s.panoramaA)
	assert.Equal(s.T(), hash, "first")
	assert.Equal(s.T(), after, before)
}

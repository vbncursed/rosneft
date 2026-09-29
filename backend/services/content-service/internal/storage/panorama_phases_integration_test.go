//go:build integration

package storage_test

import (
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// phaseOf reads a panorama's phase and hidden flag straight from the table.
func (s *TerritoryScopeSuite) phaseOf(id int64) (phase string, hidden bool) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT phase, hidden FROM panoramas WHERE id = $1`, id).Scan(&phase, &hidden))
	return phase, hidden
}

// SetupTest inserts panoramaA without naming a phase: the column default puts
// it in prior, shown, and every read carries both.
func (s *TerritoryScopeSuite) TestAPanoramaWithNoPhaseIsPriorAndShown() {
	list, err := s.pg.ListPanoramas(s.T().Context(), "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), list[0].Phase, domain.PhasePrior)
	assert.Assert(s.T(), !list[0].Hidden)
}

func (s *TerritoryScopeSuite) TestCreatePanoramaStoresItsPhase() {
	out, err := s.pg.CreatePanorama(s.T().Context(), domain.Panorama{
		TerritorySlug: "a", Slug: "east", Title: "east", SourceBlobHash: "src", Phase: domain.PhaseCurrent,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Phase, domain.PhaseCurrent)
	assert.Assert(s.T(), !out.Hidden)
	phase, _ := s.phaseOf(out.ID)
	assert.Equal(s.T(), phase, "current")
}

// PUT /panoramas/{id} replaces the fields it names; phase and hidden are not
// among them, so an edit must keep both.
func (s *TerritoryScopeSuite) TestUpdatePanoramaKeepsPhaseAndHidden() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `UPDATE panoramas SET phase = 'post', hidden = TRUE WHERE id = $1`, s.panoramaA)
	assert.NilError(s.T(), err)

	out, err := s.pg.UpdatePanorama(ctx, s.renamed("a"))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Phase, domain.PhasePost)
	assert.Assert(s.T(), out.Hidden)
	phase, hidden := s.phaseOf(s.panoramaA)
	assert.Equal(s.T(), phase, "post")
	assert.Assert(s.T(), hidden)
}

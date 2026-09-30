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

// panorama inserts one panorama named name on territory slug and answers its id.
func (s *TerritoryScopeSuite) panorama(slug, name string) int64 {
	var id int64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
		SELECT id, $2, $2, 'pano' FROM territories WHERE slug = $1 RETURNING id`, slug, name).Scan(&id))
	return id
}

func (s *TerritoryScopeSuite) TestHidingPanoramasIsAllOrNothing() {
	ctx := s.T().Context()
	south, onB := s.panorama("a", "south"), s.panorama("b", "east")

	n, err := s.pg.SetPanoramasHidden(ctx, "a", []int64{s.panoramaA, south}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	_, hidden := s.phaseOf(south)
	assert.Assert(s.T(), hidden)

	// onB is on another territory: the whole write is refused, panoramaA stays hidden.
	_, err = s.pg.SetPanoramasHidden(ctx, "a", []int64{s.panoramaA, onB}, false)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
	_, hidden = s.phaseOf(s.panoramaA)
	assert.Assert(s.T(), hidden, "a refused write must roll back")

	_, err = s.pg.SetPanoramasHidden(ctx, "a", []int64{999999}, false)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
}

func (s *TerritoryScopeSuite) TestMovingPanoramasIsAllOrNothing() {
	ctx := s.T().Context()
	onB := s.panorama("b", "east")

	n, err := s.pg.SetPanoramasPhase(ctx, "a", []int64{s.panoramaA}, domain.PhasePost)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	phase, _ := s.phaseOf(s.panoramaA)
	assert.Equal(s.T(), phase, "post")

	_, err = s.pg.SetPanoramasPhase(ctx, "a", []int64{s.panoramaA, onB}, domain.PhaseCurrent)
	assert.ErrorIs(s.T(), err, domain.ErrPanoramaNotFound)
	phase, _ = s.phaseOf(s.panoramaA)
	assert.Equal(s.T(), phase, "post", "a refused write must roll back")
	phase, _ = s.phaseOf(onB)
	assert.Equal(s.T(), phase, "prior")
}

// Writing the value a row already holds still counts it: the count checks
// which ids exist, not which changed.
func (s *TerritoryScopeSuite) TestRewritingTheSamePhaseCountsTheRow() {
	n, err := s.pg.SetPanoramasPhase(s.T().Context(), "a", []int64{s.panoramaA}, domain.PhasePrior)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

// A phase with no row is shown; setting it is an upsert, one row per phase,
// and a flag on one territory does not leak onto another.
func (s *TerritoryScopeSuite) TestThePhaseFlagDefaultsToShownAndUpserts() {
	ctx := s.T().Context()
	shown := []domain.PanoramaPhaseVisibility{
		{Phase: domain.PhasePrior}, {Phase: domain.PhaseCurrent}, {Phase: domain.PhasePost},
	}
	got, err := s.pg.ListPanoramaPhases(ctx, "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, shown)

	v, err := s.pg.SetPanoramaPhaseHidden(ctx, "a", domain.PhaseCurrent, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), v, domain.PanoramaPhaseVisibility{Phase: domain.PhaseCurrent, Hidden: true})
	_, err = s.pg.SetPanoramaPhaseHidden(ctx, "b", domain.PhasePost, true)
	assert.NilError(s.T(), err)

	got, err = s.pg.ListPanoramaPhases(ctx, "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []domain.PanoramaPhaseVisibility{
		{Phase: domain.PhasePrior}, {Phase: domain.PhaseCurrent, Hidden: true}, {Phase: domain.PhasePost},
	})

	_, err = s.pg.SetPanoramaPhaseHidden(ctx, "a", domain.PhaseCurrent, false)
	assert.NilError(s.T(), err)
	got, err = s.pg.ListPanoramaPhases(ctx, "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, shown)

	var rows int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM panorama_phase_visibility`).Scan(&rows))
	assert.Equal(s.T(), rows, 2, "one row per (territory, phase), not one per write")
}

func (s *TerritoryScopeSuite) TestThePhaseFlagOfAnUnknownTerritoryIsNotFound() {
	_, err := s.pg.SetPanoramaPhaseHidden(s.T().Context(), "nowhere", domain.PhasePrior, true)
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

// A territory delete takes its phase flags with it (ON DELETE CASCADE).
func (s *TerritoryScopeSuite) TestDeletingATerritoryTakesItsPhaseFlags() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `INSERT INTO territories (slug, title, source_blob_hash) VALUES ('c', 'c', 'c')`)
	assert.NilError(s.T(), err)
	_, err = s.pg.SetPanoramaPhaseHidden(ctx, "c", domain.PhasePost, true)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx, `DELETE FROM territories WHERE slug = 'c'`)
	assert.NilError(s.T(), err)
	var rows int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM panorama_phase_visibility`).Scan(&rows))
	assert.Equal(s.T(), rows, 0)
}

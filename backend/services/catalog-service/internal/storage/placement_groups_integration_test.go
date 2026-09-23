//go:build integration

package storage_test

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// PlacementGroupsSuite runs the hidden flag, the group column and the group
// table against a real Postgres: the all-or-nothing count, the composite FK
// that keeps a group on its own territory and its ON DELETE SET NULL are SQL,
// and a mock would only prove argument passing.
type PlacementGroupsSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	p1, p2, onB domain.Placement // p1 and p2 on territory "a", onB on "b"
}

func TestPlacementGroupsSuite(t *testing.T) { suite.Run(t, new(PlacementGroupsSuite)) }

func (s *PlacementGroupsSuite) SetupSuite() {
	s.ctr, s.pool = startCatalogDB(&s.Suite)
	s.pg = storage.New(s.pool)
	_, err := s.pool.Exec(s.T().Context(),
		`INSERT INTO models (slug, title, source_blob_hash) VALUES ('pump', 'pump', 'pump')`)
	assert.NilError(s.T(), err)
}

func (s *PlacementGroupsSuite) TearDownSuite() { stopCatalogDB(s.ctr, s.pool) }

func (s *PlacementGroupsSuite) SetupTest() {
	ctx := s.T().Context()
	for _, q := range []string{`DELETE FROM placements`, `DELETE FROM placement_groups`} {
		_, err := s.pool.Exec(ctx, q)
		assert.NilError(s.T(), err)
	}
	s.p1, s.p2, s.onB = s.place("a", nil), s.place("a", nil), s.place("b", nil)
}

// place creates one pump on slug, in group when it is not nil.
func (s *PlacementGroupsSuite) place(slug string, group *int64) domain.Placement {
	p, err := s.pg.CreatePlacement(s.T().Context(), domain.Placement{
		TerritorySlug: slug, ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}, GroupID: group,
	})
	assert.NilError(s.T(), err)
	return p
}

// group inserts a group on slug straight into the table and answers its id.
func (s *PlacementGroupsSuite) group(slug, title string) int64 {
	var id int64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`INSERT INTO placement_groups (territory_id, title)
		 SELECT id, $2 FROM territories WHERE slug = $1 RETURNING id`, slug, title).Scan(&id))
	return id
}

// stored reads a placement's hidden flag and group straight from the table.
func (s *PlacementGroupsSuite) stored(id int64) (hidden bool, group *int64) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT hidden, group_id FROM placements WHERE id = $1`, id).Scan(&hidden, &group))
	return hidden, group
}

func (s *PlacementGroupsSuite) TestANewPlacementIsShownAndInNoGroup() {
	assert.Assert(s.T(), !s.p1.Hidden)
	assert.Assert(s.T(), s.p1.GroupID == nil)
}

func (s *PlacementGroupsSuite) TestHidingIsAllOrNothing() {
	ctx := s.T().Context()
	n, err := s.pg.SetPlacementsHidden(ctx, "a", []int64{s.p1.ID, s.p2.ID}, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	hidden, _ := s.stored(s.p2.ID)
	assert.Assert(s.T(), hidden)

	// onB is on another territory: the whole write is refused, p1 stays hidden.
	_, err = s.pg.SetPlacementsHidden(ctx, "a", []int64{s.p1.ID, s.onB.ID}, false)
	assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
	hidden, _ = s.stored(s.p1.ID)
	assert.Assert(s.T(), hidden, "a refused write must roll back")
	hidden, _ = s.stored(s.onB.ID)
	assert.Assert(s.T(), !hidden)

	_, err = s.pg.SetPlacementsHidden(ctx, "a", []int64{s.p1.ID, 999999}, false)
	assert.ErrorIs(s.T(), err, domain.ErrPlacementNotFound)
}

// Writing the value a row already holds still counts it: the count checks
// which ids exist, not which changed.
func (s *PlacementGroupsSuite) TestRewritingTheSameValueCountsTheRow() {
	n, err := s.pg.SetPlacementsHidden(s.T().Context(), "a", []int64{s.p1.ID}, false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
}

func (s *PlacementGroupsSuite) TestMovingIntoAGroupAndBackOut() {
	ctx := s.T().Context()
	g := s.group("a", "north")
	n, err := s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID, s.p2.ID}, &g)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 2)
	_, group := s.stored(s.p2.ID)
	assert.DeepEqual(s.T(), group, &g)

	_, err = s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID}, nil)
	assert.NilError(s.T(), err)
	_, group = s.stored(s.p1.ID)
	assert.Assert(s.T(), group == nil)
	_, group = s.stored(s.p2.ID)
	assert.DeepEqual(s.T(), group, &g)
}

// The composite FK keeps a group on its own territory: naming one of another
// territory, or one that does not exist, is ErrPlacementGroupNotFound on a move
// and on a create, and writes nothing.
func (s *PlacementGroupsSuite) TestAGroupOfAnotherTerritoryIsNotFound() {
	ctx := s.T().Context()
	unit := domain.Vec3{X: 1, Y: 1, Z: 1}
	for _, g := range []int64{s.group("b", "elsewhere"), 999999} {
		_, err := s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID}, &g)
		assert.ErrorIs(s.T(), err, domain.ErrPlacementGroupNotFound)
		_, group := s.stored(s.p1.ID)
		assert.Assert(s.T(), group == nil)

		_, err = s.pg.CreatePlacement(ctx, domain.Placement{
			TerritorySlug: "a", ModelSlug: "pump", Scale: unit, GroupID: &g,
		})
		assert.ErrorIs(s.T(), err, domain.ErrPlacementGroupNotFound)
		_, err = s.pg.CreatePlacements(ctx, "", []domain.Placement{
			{TerritorySlug: "a", ModelSlug: "pump", Scale: unit},
			{TerritorySlug: "a", ModelSlug: "pump", Scale: unit, GroupID: &g},
		})
		assert.ErrorIs(s.T(), err, domain.ErrPlacementGroupNotFound)
	}
	listed, err := s.pg.ListPlacements(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed), 2, "no refused create may leave a row")
}

func (s *PlacementGroupsSuite) TestAPlacementIsCreatedIntoItsGroup() {
	g := s.group("a", "north")
	assert.DeepEqual(s.T(), s.place("a", &g).GroupID, &g)

	batch, err := s.pg.CreatePlacements(s.T().Context(), "", []domain.Placement{
		{TerritorySlug: "a", ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}, GroupID: &g},
	})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), batch[0].GroupID, &g)
}

// A transform or allowlist write replaces what it names and nothing else: a
// gizmo drag must not show or ungroup the placement it moves.
func (s *PlacementGroupsSuite) TestOtherPlacementWritesKeepHiddenAndGroup() {
	ctx := s.T().Context()
	g := s.group("a", "north")
	_, err := s.pg.SetPlacementsHidden(ctx, "a", []int64{s.p1.ID}, true)
	assert.NilError(s.T(), err)
	_, err = s.pg.SetPlacementsGroup(ctx, "a", []int64{s.p1.ID}, &g)
	assert.NilError(s.T(), err)

	moved, err := s.pg.UpdatePlacement(ctx, domain.Placement{
		ID: s.p1.ID, TerritorySlug: "a", Position: domain.Vec3{X: 3}, Scale: domain.Vec3{X: 1, Y: 1, Z: 1},
	})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), moved.Hidden)
	assert.DeepEqual(s.T(), moved.GroupID, &g)

	shown, err := s.pg.SetPlacementVisibility(ctx, "a", s.p1.ID, nil)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), shown.Hidden)
	assert.DeepEqual(s.T(), shown.GroupID, &g)

	listed, err := s.pg.ListPlacements(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), listed[0].Hidden)
	assert.DeepEqual(s.T(), listed[0].GroupID, &g)
}

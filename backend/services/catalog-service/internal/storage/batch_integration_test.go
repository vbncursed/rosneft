//go:build integration

package storage_test

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// BatchSuite covers the batch reads and writes behind section D of the
// edit-and-batching spec: one ANY($1) query for a whole page instead of one per
// row, and one transaction for a whole placement batch. The grouping and the
// rollback are SQL, so a mock could not see them break.
type BatchSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	pg    *storage.PG
	admin string
}

func TestBatchSuite(t *testing.T) { suite.Run(t, new(BatchSuite)) }

func (s *BatchSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)
	s.admin = "11111111-1111-1111-1111-111111111111"
}

func (s *BatchSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory and assigns each of admins to it.
func (s *BatchSuite) seedTerritory(ctx context.Context, slug string, admins ...string) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$1) RETURNING id`,
		slug).Scan(&id)
	assert.NilError(s.T(), err)
	for _, admin := range admins {
		_, err = s.pool.Exec(ctx,
			`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)`,
			id, admin)
		assert.NilError(s.T(), err)
	}
}

func (s *BatchSuite) seedModel(ctx context.Context, slug string) {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO models (slug, title, source_blob_hash) VALUES ($1,$1,$1)`, slug)
	assert.NilError(s.T(), err)
}

func lodsOf(arts []domain.Artifact) []uint32 {
	out := make([]uint32, len(arts))
	for i, a := range arts {
		out[i] = a.LOD
	}
	return out
}

func (s *BatchSuite) TestListsCarryEachLODChainInOrder() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "lods-yard", s.admin)
	s.seedTerritory(ctx, "lods-fresh", s.admin)
	s.seedModel(ctx, "lods-pump")
	// Registered out of order on purpose: the chain must come back sorted.
	for _, lod := range []uint32{2, 0, 1} {
		_, err := s.pg.RegisterTerritoryArtifact(ctx, domain.Artifact{
			Slug: "lods-yard", LOD: lod, Hash: fmt.Sprintf("t-%d", lod), ContentType: "model/gltf-binary",
		})
		assert.NilError(s.T(), err)
		_, err = s.pg.RegisterModelArtifact(ctx, domain.Artifact{
			Slug: "lods-pump", LOD: lod, Hash: fmt.Sprintf("m-%d", lod), ContentType: "model/gltf-binary",
		})
		assert.NilError(s.T(), err)
	}

	terrs, err := s.pg.ListTerritories(ctx, "", true)
	assert.NilError(s.T(), err)
	bySlug := map[string]domain.Territory{}
	for _, t := range terrs {
		bySlug[t.Slug] = t
	}
	assert.DeepEqual(s.T(), lodsOf(bySlug["lods-yard"].Artifacts), []uint32{0, 1, 2})
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Hash, "t-0")
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Slug, "lods-yard")
	// A missing row reads as the zero Territory, whose chain is empty too: the
	// row has to be there for its empty chain to mean anything.
	fresh, listed := bySlug["lods-fresh"]
	assert.Assert(s.T(), listed, "lods-fresh is missing from the list")
	assert.Equal(s.T(), len(fresh.Artifacts), 0)

	models, err := s.pg.ListModels(ctx, true)
	assert.NilError(s.T(), err)
	i := slices.IndexFunc(models, func(m domain.Model) bool { return m.Slug == "lods-pump" })
	assert.Assert(s.T(), i >= 0)
	assert.DeepEqual(s.T(), lodsOf(models[i].Artifacts), []uint32{0, 1, 2})
	assert.Equal(s.T(), models[i].Artifacts[2].Hash, "m-2")

	// Without the flag the rows are the same and carry no chain: the jobs
	// list, the summary cards and the reconciler never read one.
	bare, err := s.pg.ListTerritories(ctx, "", false)
	assert.NilError(s.T(), err)
	j := slices.IndexFunc(bare, func(t domain.Territory) bool { return t.Slug == "lods-yard" })
	assert.Assert(s.T(), j >= 0)
	assert.Equal(s.T(), len(bare[j].Artifacts), 0)
	bareModels, err := s.pg.ListModels(ctx, false)
	assert.NilError(s.T(), err)
	k := slices.IndexFunc(bareModels, func(m domain.Model) bool { return m.Slug == "lods-pump" })
	assert.Assert(s.T(), k >= 0)
	assert.Equal(s.T(), len(bareModels[k].Artifacts), 0)
}

func (s *BatchSuite) TestTerritoryAdminsComeBackPerSlug() {
	ctx := s.T().Context()
	other := "22222222-2222-2222-2222-222222222222"
	s.seedTerritory(ctx, "admins-a", s.admin)
	s.seedTerritory(ctx, "admins-b", other, s.admin) // other first: heap order is not id order
	s.seedTerritory(ctx, "admins-none")
	s.seedTerritory(ctx, "admins-unasked", other)
	// The same instant for both, as two inserts can share a created_at to the
	// microsecond: the admin id is what orders them then.
	_, err := s.pool.Exec(ctx, `UPDATE territory_assignments SET created_at = '2026-01-01'`)
	assert.NilError(s.T(), err)

	got, err := s.pg.ListTerritoryAdmins(ctx, []string{"admins-a", "admins-b", "admins-none", "no-such"})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string][]string{
		"admins-a": {s.admin},
		"admins-b": {s.admin, other},
	})
	one, err := s.pg.GetTerritoryAdmins(ctx, "admins-b")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), one, []string{s.admin, other})
}

func (s *BatchSuite) TestAPlacementBatchLandsWholeOrNotAtAll() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "batch-yard", s.admin)
	s.seedModel(ctx, "batch-pump")
	unit := domain.Vec3{X: 1, Y: 1, Z: 1}

	got, err := s.pg.CreatePlacements(ctx, "", []domain.Placement{
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Scale: unit},
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Position: domain.Vec3{X: 2}, Scale: unit},
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[1].Position.X, 2.0)
	assert.Equal(s.T(), got[0].TerritorySlug, "batch-yard")
	assert.Assert(s.T(), got[0].ID < got[1].ID, "answered in items order")

	_, err = s.pg.CreatePlacements(ctx, "", []domain.Placement{
		{TerritorySlug: "batch-yard", ModelSlug: "batch-pump", Scale: unit},
		{TerritorySlug: "batch-yard", ModelSlug: "no-such-model", Scale: unit},
	})
	assert.ErrorIs(s.T(), err, domain.ErrModelNotFound)
	item, ok := errors.AsType[domain.ItemError](err)
	assert.Assert(s.T(), ok, "%v", err)
	assert.Equal(s.T(), item.Index, 1)
	listed, err := s.pg.ListPlacements(ctx, "batch-yard")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(listed), 2, "the refused batch must leave its first item behind nowhere")
}

// No row means one side of the territory/model match failed; the answer says
// which, so the 404 is "model not found" rather than blaming the territory the
// route's gate already found.
func (s *BatchSuite) TestAMissingRowNamesWhatIsMissing() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "which-yard", s.admin)
	s.seedModel(ctx, "which-pump")

	_, err := s.pg.CreatePlacement(ctx, domain.Placement{TerritorySlug: "which-yard", ModelSlug: "no-such-model"})
	assert.ErrorIs(s.T(), err, domain.ErrModelNotFound)
	_, err = s.pg.CreatePlacement(ctx, domain.Placement{TerritorySlug: "no-such-yard", ModelSlug: "which-pump"})
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

//go:build integration

package storage_test

import (
	"context"
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

	terrs, err := s.pg.ListTerritories(ctx, "")
	assert.NilError(s.T(), err)
	bySlug := map[string]domain.Territory{}
	for _, t := range terrs {
		bySlug[t.Slug] = t
	}
	assert.DeepEqual(s.T(), lodsOf(bySlug["lods-yard"].Artifacts), []uint32{0, 1, 2})
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Hash, "t-0")
	assert.Equal(s.T(), bySlug["lods-yard"].Artifacts[0].Slug, "lods-yard")
	assert.Equal(s.T(), len(bySlug["lods-fresh"].Artifacts), 0)

	models, err := s.pg.ListModels(ctx)
	assert.NilError(s.T(), err)
	i := slices.IndexFunc(models, func(m domain.Model) bool { return m.Slug == "lods-pump" })
	assert.Assert(s.T(), i >= 0)
	assert.DeepEqual(s.T(), lodsOf(models[i].Artifacts), []uint32{0, 1, 2})
	assert.Equal(s.T(), models[i].Artifacts[2].Hash, "m-2")
}

func (s *BatchSuite) TestTerritoryAdminsComeBackPerSlug() {
	ctx := s.T().Context()
	other := "22222222-2222-2222-2222-222222222222"
	s.seedTerritory(ctx, "admins-a", s.admin)
	s.seedTerritory(ctx, "admins-b", s.admin, other)
	s.seedTerritory(ctx, "admins-none")
	s.seedTerritory(ctx, "admins-unasked", other)

	got, err := s.pg.ListTerritoryAdmins(ctx, []string{"admins-a", "admins-b", "admins-none", "no-such"})
	assert.NilError(s.T(), err)
	// Two inserts can share a created_at to the microsecond; the contract under
	// test is which ids land where, so compare sets.
	slices.Sort(got["admins-b"])
	assert.DeepEqual(s.T(), got, map[string][]string{
		"admins-a": {s.admin},
		"admins-b": {s.admin, other},
	})
}

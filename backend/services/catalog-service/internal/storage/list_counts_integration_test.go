//go:build integration

package storage_test

import (
	"context"
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

// ListCountsSuite exercises the correlated placement/usage counts the list
// queries carry: real placements across real territories and models, since a
// mock has no rows to correlate against.
type ListCountsSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	pg    *storage.PG
	admin string
}

func TestListCountsSuite(t *testing.T) { suite.Run(t, new(ListCountsSuite)) }

func (s *ListCountsSuite) SetupSuite() {
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

func (s *ListCountsSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory assigned to one admin. Copied from
// delete_model_integration_test.go.
func (s *ListCountsSuite) seedTerritory(ctx context.Context, slug, srcHash, admin string) int64 {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$2) RETURNING id`,
		slug, srcHash).Scan(&id)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)`,
		id, admin)
	assert.NilError(s.T(), err)
	return id
}

func (s *ListCountsSuite) seedModel(ctx context.Context, slug, src, thumb, glb string) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO models (slug, title, source_blob_hash, thumbnail_blob_hash)
		 VALUES ($1,$1,$2,$3) RETURNING id`, slug, src, thumb).Scan(&id)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO model_artifacts
		 (model_id, lod, hash, content_type, size_bytes, vertices, faces,
		  bbox_min_x,bbox_min_y,bbox_min_z,bbox_max_x,bbox_max_y,bbox_max_z)
		 VALUES ($1,0,$2,'model/gltf-binary',1,1,1,0,0,0,1,1,1)`, id, glb)
	assert.NilError(s.T(), err)
}

func (s *ListCountsSuite) TestListsCarryPlacementAndUsageCounts() {
	ctx := s.T().Context()
	s.seedTerritory(ctx, "yard", "hash-yard", s.admin)
	s.seedTerritory(ctx, "block", "hash-block", s.admin)
	s.seedModel(ctx, "pump", "h-pump-src", "h-pump-thumb", "h-pump-glb")
	s.seedModel(ctx, "tank", "h-tank-src", "h-tank-thumb", "h-tank-glb")
	s.seedModel(ctx, "ladder", "h-ladder-src", "h-ladder-thumb", "h-ladder-glb")
	place := func(t, m string) {
		_, err := s.pg.CreatePlacement(ctx, domain.Placement{TerritorySlug: t, ModelSlug: m, Scale: domain.Vec3{X: 1, Y: 1, Z: 1}})
		assert.NilError(s.T(), err)
	}
	place("yard", "pump")
	place("yard", "pump")
	place("yard", "tank")
	place("block", "pump")

	terrs, err := s.pg.ListTerritories(ctx, "")
	assert.NilError(s.T(), err)
	counts := map[string]int{}
	for _, t := range terrs {
		counts[t.Slug] = t.PlacementCount
	}
	assert.DeepEqual(s.T(), counts, map[string]int{"yard": 3, "block": 1})

	models, err := s.pg.ListModels(ctx)
	assert.NilError(s.T(), err)
	usage := map[string]int{}
	for _, m := range models {
		usage[m.Slug] = m.UsageCount
	}
	// pump is placed twice on yard and once on block: two territories, not three placements.
	assert.DeepEqual(s.T(), usage, map[string]int{"pump": 2, "tank": 1, "ladder": 0})
}

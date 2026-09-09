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

// DeleteModelSuite exercises DeleteModel's placements FK (ON DELETE RESTRICT)
// against a real Postgres: the 23001 -> ErrInvalidInput mapping is untestable
// through a mock, since a mock has no constraint to violate.
type DeleteModelSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	pg    *storage.PG
	admin string
}

func TestDeleteModelSuite(t *testing.T) { suite.Run(t, new(DeleteModelSuite)) }

func (s *DeleteModelSuite) SetupSuite() {
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

func (s *DeleteModelSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory assigned to one admin. Copied from
// resolve_blob_access_integration_test.go, trimmed of the artifact/panorama/
// document rows that suite needs and this one doesn't: CreatePlacement only
// requires a matching territories/models slug, no LOD0 artifact.
func (s *DeleteModelSuite) seedTerritory(ctx context.Context, slug, srcHash, admin string) int64 {
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

func (s *DeleteModelSuite) seedModel(ctx context.Context, slug, src, thumb, glb string) {
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

func (s *DeleteModelSuite) TestRefusesAModelThatIsStillPlaced() {
	ctx := s.T().Context()
	terr := s.seedTerritory(ctx, "yard", "hash-yard", s.admin)
	s.seedModel(ctx, "pump", "hash-pump-src", "hash-pump-thumb", "hash-pump-glb")
	_, err := s.pg.CreatePlacement(ctx, domain.Placement{TerritorySlug: "yard", ModelSlug: "pump", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}})
	assert.NilError(s.T(), err)
	_ = terr

	err = s.pg.DeleteModel(ctx, "pump")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "in use by placements")

	// Remove the placement and the same delete goes through.
	_, err = s.pool.Exec(ctx, `DELETE FROM placements`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeleteModel(ctx, "pump"))
	assert.ErrorIs(s.T(), s.pg.DeleteModel(ctx, "pump"), domain.ErrModelNotFound)
}

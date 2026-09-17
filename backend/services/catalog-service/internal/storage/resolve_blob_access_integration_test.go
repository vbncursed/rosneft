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

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// BlobAccessSuite exercises ResolveBlobAccess against a real Postgres.
//
// The whole decision is one SQL statement with six UNION ALL branches, four of
// which carry a scope filter. A mock of the storage layer would assert nothing
// about it, and dropping the filter from a single branch leaks exactly one class
// of asset — silently. This suite is the only thing that would notice.
type BlobAccessSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	adminA, adminB string // two tenants
	terrA, terrB   int64
}

func TestBlobAccessSuite(t *testing.T) { suite.Run(t, new(BlobAccessSuite)) }

func (s *BlobAccessSuite) SetupSuite() {
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

	s.adminA = "11111111-1111-1111-1111-111111111111"
	s.adminB = "22222222-2222-2222-2222-222222222222"
	s.terrA = s.seedTerritory(ctx, "a", "hash-terr-a-src", s.adminA)
	s.terrB = s.seedTerritory(ctx, "b", "hash-terr-b-src", s.adminB)
	s.seedModel(ctx, "shared-pump", "hash-model-src", "hash-model-thumb", "hash-model-glb")
}

func (s *BlobAccessSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// seedTerritory creates a territory assigned to one admin, plus one artifact,
// one panorama and one document, so every scoped branch of the query has a row.
func (s *BlobAccessSuite) seedTerritory(ctx context.Context, name, srcHash, admin string) int64 {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1,$1,$2) RETURNING id`,
		name, srcHash).Scan(&id)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_assignments (territory_id, admin_user_id) VALUES ($1, $2::uuid)`,
		id, admin)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_artifacts
		 (territory_id, lod, hash, content_type, size_bytes, vertices, faces,
		  bbox_min_x,bbox_min_y,bbox_min_z,bbox_max_x,bbox_max_y,bbox_max_z)
		 VALUES ($1,0,$2,'model/gltf-binary',1,1,1,0,0,0,1,1,1)`,
		id, "hash-artifact-"+name)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
		 VALUES ($1,'p','p',$2)`, id, "hash-pano-"+name)
	assert.NilError(s.T(), err)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'d',$2)`, id, "hash-doc-"+name)
	assert.NilError(s.T(), err)
	return id
}

func (s *BlobAccessSuite) seedModel(ctx context.Context, slug, src, thumb, glb string) {
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

func (s *BlobAccessSuite) allowed(hash, scope string) bool {
	ok, err := s.pg.ResolveBlobAccess(s.T().Context(), hash, scope)
	assert.NilError(s.T(), err)
	return ok
}

// Every scoped branch, one case each. A filter dropped from any single branch
// shows up here and nowhere else.
func (s *BlobAccessSuite) TestEachTerritoryBranchIsScoped() {
	for _, h := range []string{
		"hash-terr-a-src", // territories.source_blob_hash
		"hash-artifact-a", // territory_artifacts.hash
		"hash-pano-a",     // panoramas.source_blob_hash
		"hash-doc-a",      // territory_documents.source_blob_hash
	} {
		assert.Assert(s.T(), s.allowed(h, s.adminA), "owner must reach %s", h)
		assert.Assert(s.T(), !s.allowed(h, s.adminB), "another tenant must NOT reach %s", h)
	}
}

// Models are a shared library by decision, so their bytes are readable by any
// scope. If this ever starts failing, the product decision changed, not the SQL.
func (s *BlobAccessSuite) TestModelBlobsAreReadableByEveryTenant() {
	for _, h := range []string{"hash-model-src", "hash-model-thumb", "hash-model-glb"} {
		assert.Assert(s.T(), s.allowed(h, s.adminA), "%s", h)
		assert.Assert(s.T(), s.allowed(h, s.adminB), "%s", h)
	}
}

// An empty scope is Root: the catalog's convention throughout is that an empty
// scope disables the filter. The gateway must never pass "" for a non-Root
// caller, and its own middleware enforces that.
func (s *BlobAccessSuite) TestEmptyScopeSeesEverything() {
	assert.Assert(s.T(), s.allowed("hash-terr-a-src", ""))
	assert.Assert(s.T(), s.allowed("hash-doc-b", ""))
}

func (s *BlobAccessSuite) TestUnknownHashIsRefused() {
	assert.Assert(s.T(), !s.allowed("hash-that-belongs-to-nothing", s.adminA))
	assert.Assert(s.T(), !s.allowed("hash-that-belongs-to-nothing", ""))
}

// Dedup must resolve in the user's favour: the same bytes reachable through a
// territory they can see stay reachable even if another tenant also holds them.
func (s *BlobAccessSuite) TestASharedHashIsAllowedIfAnyReachableRowHasIt() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'shared','hash-shared-doc')`, s.terrA)
	assert.NilError(s.T(), err)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 VALUES ($1,'shared','hash-shared-doc')`, s.terrB)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), s.allowed("hash-shared-doc", s.adminA))
	assert.Assert(s.T(), s.allowed("hash-shared-doc", s.adminB))
}

package storage_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

type StorageSuite struct {
	suite.Suite
	container *postgres.PostgresContainer
	pool      *pgxpool.Pool
	pg        *storage.PG
}

func TestStorageSuite(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping testcontainers suite in -short mode")
	}
	suite.Run(t, new(StorageSuite))
}

func (s *StorageSuite) SetupSuite() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := postgres.Run(ctx,
		"postgres:17-alpine",
		postgres.WithDatabase("rosneft_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(2*time.Minute),
		),
	)
	assert.NilError(s.T(), err)
	s.container = container

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), migrate.Up(ctx, dsn))

	pool, err := pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pool = pool
	s.pg = storage.New(pool)
}

func (s *StorageSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.container != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = s.container.Terminate(ctx)
	}
}

func (s *StorageSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(),
		"TRUNCATE projects, model_artifacts RESTART IDENTITY CASCADE")
	assert.NilError(s.T(), err)
}

func (s *StorageSuite) TestUpsertProject_insert() {
	ctx := s.T().Context()
	p, err := s.pg.UpsertProject(ctx, domain.Project{
		Slug: "test-1", Title: "Test 1", SourceObjPath: "a.obj",
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), p.Slug, "test-1")
	assert.Equal(s.T(), p.Title, "Test 1")
	assert.Assert(s.T(), !p.CreatedAt.IsZero())
}

func (s *StorageSuite) TestUpsertProject_updatesExisting() {
	ctx := s.T().Context()
	_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "v1", SourceObjPath: "a.obj"})
	assert.NilError(s.T(), err)

	p2, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "v2", SourceObjPath: "b.obj"})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), p2.Title, "v2")
	assert.Equal(s.T(), p2.SourceObjPath, "b.obj")
}

func (s *StorageSuite) TestGetProject_notFound() {
	_, err := s.pg.GetProject(s.T().Context(), "missing")
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *StorageSuite) TestGetProject_found() {
	ctx := s.T().Context()
	_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "T", SourceObjPath: "o.obj"})
	assert.NilError(s.T(), err)

	p, err := s.pg.GetProject(ctx, "x")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), p.Slug, "x")
	assert.Equal(s.T(), p.Title, "T")
}

func (s *StorageSuite) TestListProjects_sortedBySlug() {
	ctx := s.T().Context()
	for _, slug := range []string{"c", "a", "b"} {
		_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: slug, Title: slug, SourceObjPath: "o.obj"})
		assert.NilError(s.T(), err)
	}

	list, err := s.pg.ListProjects(ctx)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(list), 3)
	assert.Equal(s.T(), list[0].Slug, "a")
	assert.Equal(s.T(), list[1].Slug, "b")
	assert.Equal(s.T(), list[2].Slug, "c")
}

func (s *StorageSuite) TestRegisterArtifact_unknownProject() {
	_, err := s.pg.RegisterArtifact(s.T().Context(), domain.Artifact{
		ProjectSlug: "missing", LOD: 0, Hash: "h", ContentType: "x",
	})
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)
}

func (s *StorageSuite) TestRegisterArtifact_insertAndUpdate() {
	ctx := s.T().Context()
	_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "T", SourceObjPath: "o.obj"})
	assert.NilError(s.T(), err)

	a := domain.Artifact{
		ProjectSlug: "x", LOD: 0, Hash: "abc", ContentType: "model/gltf-binary",
		Size: 1024, Vertices: 100, Faces: 50,
		BBoxMin: domain.Vec3{X: -1, Y: -1, Z: -1},
		BBoxMax: domain.Vec3{X: 1, Y: 1, Z: 1},
	}
	out, err := s.pg.RegisterArtifact(ctx, a)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Hash, "abc")
	assert.Equal(s.T(), out.Size, int64(1024))
	assert.Equal(s.T(), out.BBoxMax.X, 1.0)

	a.Hash = "def"
	a.Size = 2048
	out2, err := s.pg.RegisterArtifact(ctx, a)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out2.Hash, "def")
	assert.Equal(s.T(), out2.Size, int64(2048))
}

func (s *StorageSuite) TestGetArtifact_notFound() {
	ctx := s.T().Context()
	_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "T", SourceObjPath: "o.obj"})
	assert.NilError(s.T(), err)
	_, err = s.pg.GetArtifact(ctx, "x", 0)
	assert.ErrorIs(s.T(), err, domain.ErrArtifactNotFound)
}

func (s *StorageSuite) TestListArtifacts_sortedByLod() {
	ctx := s.T().Context()
	_, err := s.pg.UpsertProject(ctx, domain.Project{Slug: "x", Title: "T", SourceObjPath: "o.obj"})
	assert.NilError(s.T(), err)

	for _, lod := range []uint32{2, 0, 1} {
		_, err := s.pg.RegisterArtifact(ctx, domain.Artifact{
			ProjectSlug: "x", LOD: lod, Hash: "h", ContentType: "x", Size: 1,
		})
		assert.NilError(s.T(), err)
	}

	list, err := s.pg.ListArtifacts(ctx, "x")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(list), 3)
	assert.Equal(s.T(), list[0].LOD, uint32(0))
	assert.Equal(s.T(), list[1].LOD, uint32(1))
	assert.Equal(s.T(), list[2].LOD, uint32(2))
}

func (s *StorageSuite) TestPing() {
	assert.NilError(s.T(), s.pg.Ping(s.T().Context()))
}

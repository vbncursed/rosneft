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

// ModelTagsSuite checks that the tag is resolved by slug inside each write and
// joined on each read, against the seeded model_tags rows.
type ModelTagsSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG
}

func TestModelTagsSuite(t *testing.T) { suite.Run(t, new(ModelTagsSuite)) }

func (s *ModelTagsSuite) SetupSuite() {
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
}

func (s *ModelTagsSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *ModelTagsSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(), `DELETE FROM models`)
	assert.NilError(s.T(), err)
}

func (s *ModelTagsSuite) create(slug, tag string) domain.Model {
	m, err := s.pg.CreateModel(s.T().Context(), domain.Model{
		Slug: slug, Title: slug, SourceBlobHash: "src-" + slug, Tag: domain.ModelTag{Slug: tag},
	})
	assert.NilError(s.T(), err)
	return m
}

func (s *ModelTagsSuite) TestCreateModelUnknownTagIsInvalidInput() {
	for _, slug := range []string{"", "no-such-tag"} {
		_, err := s.pg.CreateModel(s.T().Context(), domain.Model{
			Slug: "bad", Title: "bad", SourceBlobHash: "src", Tag: domain.ModelTag{Slug: slug},
		})
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
		assert.ErrorContains(s.T(), err, "unknown model tag")
	}
	var n int
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `SELECT count(*) FROM models`).Scan(&n))
	assert.Equal(s.T(), n, 0)
}

func (s *ModelTagsSuite) TestUpdateModelTagRoundTrip() {
	made := s.create("pump", "camp")
	assert.Equal(s.T(), made.Tag.Slug, "camp")
	assert.Equal(s.T(), made.Tag.Title, "Camp & accommodation")

	out, err := s.pg.UpdateModel(s.T().Context(), "pump", domain.ModelPatch{TagSlug: new("power")})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Tag.Slug, "power")

	// A patch without a tag keeps it; one with an unknown tag is refused and
	// keeps it too.
	out, err = s.pg.UpdateModel(s.T().Context(), "pump", domain.ModelPatch{Title: new("Pump")})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Tag.Slug, "power")

	_, err = s.pg.UpdateModel(s.T().Context(), "pump", domain.ModelPatch{TagSlug: new("no-such-tag")})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	got, err := s.pg.GetModel(s.T().Context(), "pump")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Tag.Slug, "power")
}

func (s *ModelTagsSuite) TestListModelsCarriesTag() {
	s.create("a", "camp")
	s.create("b", "flare")
	got, err := s.pg.ListModels(s.T().Context(), false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 2)
	assert.Equal(s.T(), got[0].Tag.Slug, "camp")
	assert.Equal(s.T(), got[1].Tag.Slug, "flare")
	assert.Equal(s.T(), got[1].Tag.Title, "Flare system")
}

func (s *ModelTagsSuite) TestListModelTagsOrder() {
	tags, err := s.pg.ListModelTags(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(tags), 12)
	assert.Equal(s.T(), tags[0].Slug, domain.UngroupedTagSlug)
	for i := 1; i < len(tags); i++ {
		assert.Assert(s.T(), tags[i].ID > tags[i-1].ID)
	}
}

func (s *ModelTagsSuite) TestResolveModelTagsOmitsUnknownSlugs() {
	got, err := s.pg.ResolveModelTags(s.T().Context(), []string{"camp", "no-such-tag", "power"})
	assert.NilError(s.T(), err)
	slugs := []string{}
	for _, t := range got {
		slugs = append(slugs, t.Slug)
	}
	assert.DeepEqual(s.T(), slugs, []string{"camp", "power"})
}

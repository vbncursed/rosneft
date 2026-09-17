//go:build integration

package migrate_test

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
)

// ScrubPanoramaIDsSuite pins 00016 (spec H-4). Before c5ec5e1d a placement
// could list another territory's panorama ids in visible_panorama_ids; the
// migration keeps only the ids of panoramas on the placement's own territory.
// placements carries the audit trigger, so an untouched row must stay
// untouched — xmin proves it was not rewritten.
type ScrubPanoramaIDsSuite struct {
	suite.Suite
	dsn  string
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestScrubPanoramaIDsSuite(t *testing.T) { suite.Run(t, new(ScrubPanoramaIDsSuite)) }

func (s *ScrubPanoramaIDsSuite) SetupSuite() {
	ctx := s.T().Context()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr
	s.dsn, err = ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, s.dsn))
	s.pool, err = pgxpool.New(ctx, s.dsn)
	assert.NilError(s.T(), err)
}

func (s *ScrubPanoramaIDsSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *ScrubPanoramaIDsSuite) id(sql string, args ...any) int64 {
	var id int64
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), sql, args...).Scan(&id))
	return id
}

// placement creates a placement of territory slug with the given allowlist.
func (s *ScrubPanoramaIDsSuite) placement(slug string, ids []int64) int64 {
	return s.id(`INSERT INTO placements (territory_id, model_id, visible_panorama_ids)
		SELECT t.id, m.id, $2 FROM territories t, models m
		WHERE t.slug = $1 AND m.slug = 'pump' RETURNING id`, slug, ids)
}

// row returns a placement's allowlist and its xmin (changes on any rewrite).
func (s *ScrubPanoramaIDsSuite) row(id int64) ([]int64, string) {
	var ids []int64
	var xmin string
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT visible_panorama_ids, xmin::text FROM placements WHERE id = $1`, id).Scan(&ids, &xmin))
	return ids, xmin
}

// rerun applies 00016 again over whatever the test inserted.
func (s *ScrubPanoramaIDsSuite) rerun() {
	assert.NilError(s.T(), migrate.DownTo(s.T().Context(), s.dsn, 15))
	assert.NilError(s.T(), migrate.Up(s.T().Context(), s.dsn))
}

func (s *ScrubPanoramaIDsSuite) TestKeepsOnlyTheOwnTerritorysPanoramas() {
	for _, slug := range []string{"a", "b"} {
		s.id(`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1) RETURNING id`, slug)
	}
	s.id(`INSERT INTO models (slug, title, source_blob_hash) VALUES ('pump', 'pump', 'pump') RETURNING id`)
	pano := func(territory, slug string) int64 {
		return s.id(`INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
			SELECT id, $2, $2, 'pano' FROM territories WHERE slug = $1 RETURNING id`, territory, slug)
	}
	north, south, foreign := pano("a", "north"), pano("a", "south"), pano("b", "east")
	const gone = int64(999_999)

	dirty := s.placement("a", []int64{south, foreign, gone, north})
	clean := s.placement("a", []int64{north})
	empty := s.placement("b", []int64{})
	_, cleanXmin := s.row(clean)
	_, emptyXmin := s.row(empty)

	s.rerun()

	ids, dirtyXmin := s.row(dirty)
	assert.DeepEqual(s.T(), ids, []int64{south, north}) // order kept
	ids, xmin := s.row(clean)
	assert.DeepEqual(s.T(), ids, []int64{north})
	assert.Equal(s.T(), xmin, cleanXmin, "a clean row must not be rewritten")
	_, xmin = s.row(empty)
	assert.Equal(s.T(), xmin, emptyXmin, "an empty allowlist must not be rewritten")

	s.rerun()
	_, xmin = s.row(dirty)
	assert.Equal(s.T(), xmin, dirtyXmin, "a second run changes nothing")
}

//go:build integration

package migrate_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/migrate"
)

// PanoramaPhasesSuite pins 00022: the panoramas and placement groups that exist
// when it runs land in prior and stay shown, a phase is one of three, and Down
// takes back everything it added.
type PanoramaPhasesSuite struct {
	suite.Suite
	dsn  string
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestPanoramaPhasesSuite(t *testing.T) { suite.Run(t, new(PanoramaPhasesSuite)) }

func (s *PanoramaPhasesSuite) SetupSuite() {
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
	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug, title, source_blob_hash) VALUES ('a', 'a', 'a')`)
	assert.NilError(s.T(), err)
}

func (s *PanoramaPhasesSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// before00022 rolls back to 00021, runs fn against that schema, and migrates
// up again, so every test leaves the database fully migrated.
func (s *PanoramaPhasesSuite) before00022(fn func()) {
	assert.NilError(s.T(), migrate.DownTo(s.T().Context(), s.dsn, 21))
	fn()
	assert.NilError(s.T(), migrate.Up(s.T().Context(), s.dsn))
}

// checkViolation asserts err is the named CHECK constraint firing.
func (s *PanoramaPhasesSuite) checkViolation(err error, constraint string) {
	pgErr, ok := errors.AsType[*pgconn.PgError](err)
	assert.Assert(s.T(), ok, "want a Postgres error, got %v", err)
	assert.Equal(s.T(), pgErr.Code, "23514")
	assert.Equal(s.T(), pgErr.ConstraintName, constraint)
}

// Spec D3: every panorama that exists when 00022 runs is in prior.
func (s *PanoramaPhasesSuite) TestExistingRowsLandInPriorAndStayShown() {
	ctx := s.T().Context()
	var pano, group int64
	s.before00022(func() {
		assert.NilError(s.T(), s.pool.QueryRow(ctx, `
			INSERT INTO panoramas (territory_id, slug, title, source_blob_hash)
			SELECT id, 'old', 'old', 'pano' FROM territories WHERE slug = 'a' RETURNING id`).Scan(&pano))
		assert.NilError(s.T(), s.pool.QueryRow(ctx, `
			INSERT INTO placement_groups (territory_id, title)
			SELECT id, 'Old' FROM territories WHERE slug = 'a' RETURNING id`).Scan(&group))
	})

	var phase string
	var hidden, groupHidden bool
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT phase, hidden FROM panoramas WHERE id = $1`, pano).Scan(&phase, &hidden))
	assert.Equal(s.T(), phase, "prior")
	assert.Assert(s.T(), !hidden)
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT hidden FROM placement_groups WHERE id = $1`, group).Scan(&groupHidden))
	assert.Assert(s.T(), !groupHidden)
}

func (s *PanoramaPhasesSuite) TestAPhaseIsOneOfThree() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO panoramas (territory_id, slug, title, source_blob_hash, phase)
		SELECT id, 'bad', 'bad', 'pano', 'during' FROM territories WHERE slug = 'a'`)
	s.checkViolation(err, "panoramas_phase_valid")

	_, err = s.pool.Exec(ctx, `
		INSERT INTO panorama_phase_visibility (territory_id, phase, hidden)
		SELECT id, 'during', TRUE FROM territories WHERE slug = 'a'`)
	s.checkViolation(err, "panorama_phase_visibility_phase_valid")
}

// Down takes back all three changes; before00022's Up then proves the
// migration re-applies cleanly.
func (s *PanoramaPhasesSuite) TestDownDropsWhatItAdded() {
	ctx := s.T().Context()
	s.before00022(func() {
		var cols int
		assert.NilError(s.T(), s.pool.QueryRow(ctx, `
			SELECT count(*) FROM information_schema.columns
			WHERE (table_name = 'panoramas' AND column_name IN ('phase', 'hidden'))
			   OR (table_name = 'placement_groups' AND column_name = 'hidden')`).Scan(&cols))
		assert.Equal(s.T(), cols, 0)

		var table *string
		assert.NilError(s.T(), s.pool.QueryRow(ctx,
			`SELECT to_regclass('public.panorama_phase_visibility')::text`).Scan(&table))
		assert.Assert(s.T(), table == nil)
	})
}

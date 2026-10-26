//go:build integration

package migrate_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
)

// EnsureTriggersSuite proves attachment is ordering-free: audit-service can
// migrate before catalog/auth/content exist, the missing tables are skipped,
// and a later run picks them up. Without that the fresh-install boot order
// would decide whether the journal captures anything at all.
type EnsureTriggersSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
}

func TestEnsureTriggersSuite(t *testing.T) {
	suite.Run(t, new(EnsureTriggersSuite))
}

func (s *EnsureTriggersSuite) SetupSuite() {
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
}

func (s *EnsureTriggersSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// Each test starts from "audit has migrated, nobody else has". Dropping the
// table drops its trigger with it.
func (s *EnsureTriggersSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(), `DROP TABLE IF EXISTS territories, measurements, placement_groups, panorama_phase_visibility, model_tags, site_zones, site_zone_tags, document_calibration_points`)
	assert.NilError(s.T(), err)
}

func (s *EnsureTriggersSuite) TestSkipsMissingTablesThenAttachesLater() {
	ctx := s.T().Context()

	// No business tables yet — must be a no-op, not an error.
	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 0)

	// catalog migrates afterwards.
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	// The trigger is live and carries the right entity name.
	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug) VALUES ('alpha')`)
	assert.NilError(s.T(), err)

	var action, label string
	err = s.pool.QueryRow(ctx,
		`SELECT action, entity_label FROM audit_log WHERE entity = 'territory'`).Scan(&action, &label)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "territory.insert")
	assert.Equal(s.T(), label, "alpha")
}

func (s *EnsureTriggersSuite) TestIsIdempotent() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE territories (
			id BIGSERIAL PRIMARY KEY,
			slug TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	var first, second int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&first))
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&second))

	assert.Equal(s.T(), first, 1)
	assert.Equal(s.T(), second, 0)

	// Re-running must not have doubled the trigger, which would double-log.
	var triggers int
	err = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM pg_trigger
		 WHERE tgrelid = 'public.territories'::regclass AND NOT tgisinternal`).Scan(&triggers)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), triggers, 1)
}

// measurements is the first table with a pk but no label column: the entry
// carries the id and a NULL label, and the row itself is in new_row.
func (s *EnsureTriggersSuite) TestAttachesToMeasurementsWithAnIDAndNoLabel() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE measurements (
			id BIGSERIAL PRIMARY KEY,
			points DOUBLE PRECISION[] NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	var id string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO measurements (points) VALUES ('{1,2,3,4,5,6}') RETURNING id::text`).Scan(&id)
	assert.NilError(s.T(), err)

	var action, entityID, points string
	var label *string
	err = s.pool.QueryRow(ctx, `
		SELECT action, entity_id, entity_label, new_row->>'points'
		FROM audit_log WHERE entity = 'measurement'`).Scan(&action, &entityID, &label, &points)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), action, "measurement.insert")
	assert.Equal(s.T(), entityID, id)
	assert.Assert(s.T(), label == nil)
	assert.Equal(s.T(), points, "[1, 2, 3, 4, 5, 6]")
}

// placement_groups carries its title as the entry's label, so the journal
// names a group without reading the snapshot.
func (s *EnsureTriggersSuite) TestAttachesToPlacementGroupsWithTheTitleAsLabel() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE placement_groups (
			id BIGSERIAL PRIMARY KEY,
			title TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	assert.NilError(s.T(), err)

	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	var id string
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`INSERT INTO placement_groups (title) VALUES ('North') RETURNING id::text`).Scan(&id))

	var action, entityID, label string
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		SELECT action, entity_id, entity_label
		FROM audit_log WHERE entity = 'placement_group'`).Scan(&action, &entityID, &label))
	assert.Equal(s.T(), action, "placement_group.insert")
	assert.Equal(s.T(), entityID, id)
	assert.Equal(s.T(), label, "North")
}

// panorama_phase_visibility has a composite key and no label, like
// territory_assignments: the entry carries neither, and the row is in new_row.
func (s *EnsureTriggersSuite) TestAttachesToPanoramaPhaseVisibilityWithNoIDOrLabel() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE panorama_phase_visibility (
			territory_id BIGINT NOT NULL,
			phase TEXT NOT NULL,
			hidden BOOLEAN NOT NULL,
			PRIMARY KEY (territory_id, phase)
		)`)
	assert.NilError(s.T(), err)

	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 1)

	_, err = s.pool.Exec(ctx, `INSERT INTO panorama_phase_visibility VALUES (7, 'post', TRUE)`)
	assert.NilError(s.T(), err)

	var action, phase string
	var entityID, label *string
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		SELECT action, entity_id, entity_label, new_row->>'phase'
		FROM audit_log WHERE entity = 'panorama_phase'`).Scan(&action, &entityID, &label, &phase))
	assert.Equal(s.T(), action, "panorama_phase.insert")
	assert.Assert(s.T(), entityID == nil)
	assert.Assert(s.T(), label == nil)
	assert.Equal(s.T(), phase, "post")
}

// The site-zone tables are journalled like their catalog siblings: each write
// lands exactly one row, in order. site_zone_tags and document_calibration_points
// are composite-key joins, so their entries carry neither id nor label.
func (s *EnsureTriggersSuite) TestSiteZoneTriggersFire() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE model_tags (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL);
		CREATE TABLE site_zones (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL);
		CREATE TABLE site_zone_tags (
			zone_id BIGINT NOT NULL,
			tag_id BIGINT NOT NULL,
			PRIMARY KEY (zone_id, tag_id));
		CREATE TABLE document_calibration_points (
			document_id BIGINT NOT NULL,
			idx INT NOT NULL,
			utm_e DOUBLE PRECISION,
			utm_n DOUBLE PRECISION,
			PRIMARY KEY (document_id, idx))`)
	assert.NilError(s.T(), err)

	var attached int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT ensure_audit_triggers()`).Scan(&attached))
	assert.Equal(s.T(), attached, 4)

	writes := []string{
		`INSERT INTO model_tags (title) VALUES ('Pipes')`,
		`UPDATE model_tags SET title = 'Valves'`,
		`DELETE FROM model_tags`,
		`INSERT INTO site_zones (title) VALUES ('North')`,
		`UPDATE site_zones SET title = 'South'`,
		`DELETE FROM site_zones`,
		`INSERT INTO site_zone_tags VALUES (1, 1)`,
		`DELETE FROM site_zone_tags`,
		`INSERT INTO document_calibration_points VALUES (7, 0, 1.0, 2.0)`,
		`UPDATE document_calibration_points SET utm_e = 3.0`,
		`DELETE FROM document_calibration_points`,
	}
	for _, stmt := range writes {
		_, err := s.pool.Exec(ctx, stmt)
		assert.NilError(s.T(), err, stmt)
	}

	actionsOf := func(entity string) []string {
		rows, err := s.pool.Query(ctx,
			`SELECT action FROM audit_log WHERE entity = $1 ORDER BY id`, entity)
		assert.NilError(s.T(), err)
		defer rows.Close()
		var out []string
		for rows.Next() {
			var a string
			assert.NilError(s.T(), rows.Scan(&a))
			out = append(out, a)
		}
		assert.NilError(s.T(), rows.Err())
		return out
	}
	assert.DeepEqual(s.T(), actionsOf("model_tag"),
		[]string{"model_tag.insert", "model_tag.update", "model_tag.delete"})
	assert.DeepEqual(s.T(), actionsOf("zone"),
		[]string{"zone.insert", "zone.update", "zone.delete"})
	assert.DeepEqual(s.T(), actionsOf("zone_tag"),
		[]string{"zone_tag.insert", "zone_tag.delete"})
	assert.DeepEqual(s.T(), actionsOf("calibration"),
		[]string{"calibration.insert", "calibration.update", "calibration.delete"})

	var label string
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT entity_label FROM audit_log WHERE entity = 'zone' AND action = 'zone.insert'`).Scan(&label))
	assert.Equal(s.T(), label, "North")

	var zoneTagLabel *string
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`SELECT entity_label FROM audit_log WHERE entity = 'zone_tag' LIMIT 1`).Scan(&zoneTagLabel))
	assert.Assert(s.T(), zoneTagLabel == nil)
}

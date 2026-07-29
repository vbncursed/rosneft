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

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

// VerifyIntegrationSuite exercises the one thing the unit tests cannot: a forger
// who disables the append-only trigger, edits the journal, and switches it back
// on.
type VerifyIntegrationSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	svc   *service.Service
	store *storage.PG
}

func TestVerifyIntegrationSuite(t *testing.T) { suite.Run(t, new(VerifyIntegrationSuite)) }

// Per test, not per suite: each case forges a different part of the journal, and
// a shared database would let one case's damage decide the next one's verdict.
func (s *VerifyIntegrationSuite) SetupTest() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:17-alpine",
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
	s.store = storage.New(s.pool)
	s.svc = service.New(s.store)
}

func (s *VerifyIntegrationSuite) TearDownTest() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// Ticks with journal activity between them: the first seeds a watermark, and
// only a later tick can seal rows written after it — the boundary is always one
// watermark behind.
//
// Two rounds rather than one, on purpose. A single round leaves the last
// checkpoint with id == to_id (three rows, three checkpoints), which would let
// TestWitnessCatchesARecomputedChain pass whether the witness were keyed by id
// or by to_id — and to_id keying is exactly the bug this suite exists to catch.
// The second round separates them.
func (s *VerifyIntegrationSuite) sealSomeHistory() {
	s.round("auth.login", "auth.logout", "auth.password_change")
	s.round("auth.login")
}

// round records some entries and ticks until they are sealed. Two ticks: the
// first moves the boundary up to the watermark taken while the rows were being
// written, the second digests them.
func (s *VerifyIntegrationSuite) round(actions ...string) {
	ctx := s.T().Context()
	_, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	for _, a := range actions {
		_, recErr := s.svc.Record(ctx, domain.Entry{Action: a, Entity: "auth", Result: "ok"})
		assert.NilError(s.T(), recErr)
	}

	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	c, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), c.RowCount > 0, "nothing was sealed; the boundary did not advance")
}

// The forger's full move: disable the guard, rewrite a row, switch it back on.
func (s *VerifyIntegrationSuite) exec(queries ...string) {
	ctx := s.T().Context()
	for _, q := range queries {
		_, err := s.pool.Exec(ctx, q)
		assert.NilError(s.T(), err, q)
	}
}

func (s *VerifyIntegrationSuite) TestIntactJournalVerifies() {
	s.sealSomeHistory()

	res, err := s.svc.Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, true, res.Reason)
}

func (s *VerifyIntegrationSuite) TestEditedRowIsCaught() {
	s.sealSomeHistory()
	s.exec(
		`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutate`,
		`UPDATE audit_log SET action = 'auth.nothing_happened' WHERE id = (SELECT min(id) FROM audit_log)`,
		`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutate`,
	)

	res, err := s.svc.Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
	assert.Assert(s.T(), res.FailedID > 0)
}

func (s *VerifyIntegrationSuite) TestDeletedRowIsCaught() {
	s.sealSomeHistory()
	s.exec(
		`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutate`,
		`DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)`,
		`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutate`,
	)

	res, err := s.svc.Verify(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
}

// The forger rewrote the rows AND recomputed the chain, so the database agrees
// with itself and recomputation alone sees nothing. Only the witness on the
// other volume still disagrees — which is the entire reason it exists.
func (s *VerifyIntegrationSuite) TestWitnessCatchesARecomputedChain() {
	s.sealSomeHistory()
	ctx := s.T().Context()

	before, err := s.svc.Verify(ctx, nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), before.OK, true, before.Reason)

	all, err := s.store.ListCheckpoints(ctx)
	assert.NilError(s.T(), err)
	sealed := all[len(all)-1]

	// The witness is keyed by the checkpoint's own id, never by to_id — quiet
	// intervals repeat to_id while digests advance. Assert the two have actually
	// diverged here, otherwise this test would pass under either keying and stop
	// guarding the invariant the moment the fixture shifted.
	assert.Assert(s.T(), sealed.ID != sealed.ToID,
		"fixture no longer separates checkpoint id (%d) from to_id (%d); this test would pass under to_id keying too",
		sealed.ID, sealed.ToID)

	res, err := s.svc.Verify(ctx, map[int64]string{sealed.ID: "what-the-file-recorded"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, false)
	assert.Assert(s.T(), res.Reason != "")
}

// A transaction opened before a tick and committed after it must not read as a
// forgery — that is the entire reason the boundary comes from the watermark
// rather than from max(id).
func (s *VerifyIntegrationSuite) TestLateCommitDoesNotFalselyAlarm() {
	ctx := s.T().Context()
	_, err := s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	tx, err := s.pool.Begin(ctx)
	assert.NilError(s.T(), err)
	_, err = tx.Exec(ctx, `INSERT INTO audit_log (action, entity, result) VALUES ('auth.login','auth','ok')`)
	assert.NilError(s.T(), err)

	// Tick while the row above is holding an id nobody can see.
	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), tx.Commit(ctx))

	// Two more ticks: the first moves the boundary up to the watermark taken
	// while the row was in flight, the second seals it.
	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)
	_, err = s.svc.Checkpoint(ctx)
	assert.NilError(s.T(), err)

	res, err := s.svc.Verify(ctx, nil)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), res.OK, true, res.Reason)
}

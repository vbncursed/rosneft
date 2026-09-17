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
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
)

const (
	actorA = "11111111-1111-4111-8111-111111111111"
	actorB = "22222222-2222-4222-8222-222222222222"
	// This suite's own actor, written by nobody else, so the row below cannot
	// move a count another case asserts whatever order the suite runs in.
	actorC = "55555555-5555-4555-8555-555555555555"
	// The one company any row in this suite carries; every SetupSuite row
	// leaves it NULL, so the scoped count has exactly this row to find.
	companyA = "44444444-4444-4444-8444-444444444444"
	companyB = "33333333-3333-4333-8333-333333333333"
)

type ListStorageSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *storage.PG
}

func TestListStorageSuite(t *testing.T) { suite.Run(t, new(ListStorageSuite)) }

func (s *ListStorageSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"), tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"), tcpostgres.BasicWaitStrategies())
	assert.NilError(s.T(), err)
	s.ctr = ctr
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))
	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.store = storage.New(s.pool)
	for i, actor := range []string{actorA, actorA, actorB, actorA, actorB} {
		_, err := s.store.Record(s.T().Context(), domain.Entry{
			ActorID: actor, Action: "auth.login", Entity: "session", Result: "ok",
		})
		assert.NilError(s.T(), err, "row %d", i)
	}
}

func (s *ListStorageSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// The count answers for everything the filters match; the page and its cursor
// are not filters.
func (s *ListStorageSuite) TestCountIgnoresPagingAndHonoursTheActor() {
	all := domain.Filter{AllCompanies: true, ActorID: actorA}

	first, err := s.store.List(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorA, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(first), 2)

	nA, err := s.store.Count(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorA, Cursor: first[1].ID, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nA, int64(3))

	nAll, err := s.store.Count(s.T().Context(), all)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nAll, int64(3))

	nB, err := s.store.Count(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nB, int64(2))
}

// A scoped count sees its own company's rows and only those: 0 for a company
// nobody wrote — the NULL-company rows of SetupSuite are not it — and 1 for the
// company that has exactly one. Without the positive half a Count that always
// answered 0 would pass.
func (s *ListStorageSuite) TestScopedCountSeesOnlyItsCompany() {
	_, err := s.store.Record(s.T().Context(), domain.Entry{
		ActorID: actorC, CompanyID: companyA, Action: "auth.login", Entity: "session", Result: "ok",
	})
	assert.NilError(s.T(), err)

	n, err := s.store.Count(s.T().Context(), domain.Filter{CompanyID: companyA})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(1))

	n, err = s.store.Count(s.T().Context(), domain.Filter{CompanyID: companyB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(0))
}

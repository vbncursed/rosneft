//go:build integration

package users_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/users"
)

// ListScopeSuite exercises Store.List's owner-scope SQL against a real
// Postgres: the (u.created_by = $N OR u.id = $N) clause is untestable through
// a mock, and the bug it fixes (a Company Owner missing from their own
// owner-scoped list, because their own row was created by Root) only shows up
// against the actual query planner.
type ListScopeSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *users.Store
}

func TestListScopeSuite(t *testing.T) { suite.Run(t, new(ListScopeSuite)) }

func (s *ListScopeSuite) SetupSuite() {
	ctx := context.Background()
	// postgres:18.6, matching docker-compose.yml's pin — see
	// set_totp_required_integration_test.go for why the version is pinned.
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
	s.store = users.New(s.pool)
}

func (s *ListScopeSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *ListScopeSuite) createUser(email, username string, createdBy *string) domain.User {
	u, err := s.store.Create(s.T().Context(), domain.User{
		Email: email, Username: username, PasswordHash: "hash", CreatedBy: createdBy,
	})
	assert.NilError(s.T(), err)
	return u
}

// root creates owner; owner creates u1; root creates u2 (not owner's).
// Owner-scoped List must return {owner, u1} and never u2 — before the fix,
// created_by=$1 alone excluded the owner's own row (created by root).
func (s *ListScopeSuite) TestOwnerScopeIncludesOwnAccount() {
	root := s.createUser("root@example.com", "root", nil)
	owner := s.createUser("owner@example.com", "owner", new(root.ID))
	u1 := s.createUser("u1@example.com", "u1", new(owner.ID))
	s.createUser("u2@example.com", "u2", new(root.ID))

	out, err := s.store.List(s.T().Context(), "", false, owner.ID)
	assert.NilError(s.T(), err)

	ids := make([]string, len(out))
	for i, u := range out {
		ids[i] = u.ID
	}
	assert.DeepEqual(s.T(), ids, []string{owner.ID, u1.ID})
}

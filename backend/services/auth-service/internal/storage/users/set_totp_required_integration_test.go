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

// TOTPRequiredSuite exercises Store.SetTOTPRequired against a real Postgres.
//
// auth-service has no other test that touches a database: userColumns and
// scanUser are two separate lists that must agree on order, and a migration
// that fails to apply is a runtime pgx error, not a compile error. This suite
// is the first thing that would notice either going wrong.
type TOTPRequiredSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *users.Store
}

func TestTOTPRequiredSuite(t *testing.T) { suite.Run(t, new(TOTPRequiredSuite)) }

func (s *TOTPRequiredSuite) SetupSuite() {
	ctx := context.Background()
	// postgres:18.6, matching docker-compose.yml's pin (bumped 2026-09-01,
	// commit 9471551) — a migration test that runs on a different major version
	// than production is testing the wrong thing. catalog-service's
	// resolve_blob_access and audit-service's migrate suites now pin the
	// same tag.
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

func (s *TOTPRequiredSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *TOTPRequiredSuite) createUser(email, username string) domain.User {
	u, err := s.store.Create(s.T().Context(), domain.User{Email: email, Username: username, PasswordHash: "hash"})
	assert.NilError(s.T(), err)
	return u
}

// A new account is not required to carry a second factor.
func (s *TOTPRequiredSuite) TestDefaultsToFalse() {
	u := s.createUser("a@example.com", "a")
	assert.Equal(s.T(), u.TOTPRequired, false)
}

// The round trip is what proves the column list and the scan destinations
// agree: they are two separate edits, and pgx only complains at runtime.
func (s *TOTPRequiredSuite) TestSetAndReadBack() {
	u := s.createUser("b@example.com", "b")

	got, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, true)

	reread, err := s.store.GetByID(s.T().Context(), u.ID)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), reread.TOTPRequired, true)
}

// Unrequiring is the same statement with the other value, and it must not
// disturb anything else on the row.
func (s *TOTPRequiredSuite) TestUnrequireLeavesTheRestAlone() {
	u := s.createUser("c@example.com", "c")
	_, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, true)
	assert.NilError(s.T(), err)

	got, err := s.store.SetTOTPRequired(s.T().Context(), u.ID, false)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.TOTPRequired, false)
	assert.Equal(s.T(), got.Email, u.Email)
	assert.Equal(s.T(), got.Status, u.Status)
}

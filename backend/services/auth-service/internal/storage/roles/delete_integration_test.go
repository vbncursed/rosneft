//go:build integration

package roles_test

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
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/roles"
)

// DeleteSuite exercises Store.Delete's user_roles FK (ON DELETE RESTRICT)
// against a real Postgres: the 23001 -> ErrRoleInUse mapping is untestable
// through a mock, since a mock has no constraint to violate.
type DeleteSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *roles.Store
}

func TestDeleteSuite(t *testing.T) { suite.Run(t, new(DeleteSuite)) }

func (s *DeleteSuite) SetupSuite() {
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
	s.store = roles.New(s.pool)
}

func (s *DeleteSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// A role bound to a user via user_roles cannot be deleted (FK RESTRICT); once
// unassigned, the same delete goes through. domain.Role carries no id, and
// OwnerAdminID is left empty (global) so no separate admin user is needed —
// an empty scopeAdminID matches it under assertMutable.
func (s *DeleteSuite) TestRefusesARoleSomebodyStillHolds() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "surveyor", Title: "Surveyor"})
	assert.NilError(s.T(), err)

	var roleID string
	err = s.pool.QueryRow(ctx, `SELECT id FROM roles WHERE slug = $1`, "surveyor").Scan(&roleID)
	assert.NilError(s.T(), err)

	var userID string
	err = s.pool.QueryRow(ctx, `INSERT INTO users (email, username, password_hash)
		VALUES ('u1@x', 'u1', 'h') RETURNING id`).Scan(&userID)
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() {
		_, _ = s.pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})

	_, err = s.pool.Exec(ctx, `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, userID, roleID)
	assert.NilError(s.T(), err)

	err = s.store.Delete(ctx, "surveyor", "", false)
	assert.ErrorIs(s.T(), err, domain.ErrRoleInUse)

	// Unassign, and the same delete goes through.
	_, err = s.pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.store.Delete(ctx, "surveyor", "", false))
}

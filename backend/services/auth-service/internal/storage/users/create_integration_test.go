//go:build integration

package users_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/storage/users"
)

// CreateSuite pins Store.Create's refusal of a taken login against a real
// Postgres: the unique violations are only observable there.
type CreateSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *users.Store
}

func TestCreateSuite(t *testing.T) { suite.Run(t, new(CreateSuite)) }

func (s *CreateSuite) SetupSuite() {
	ctx := context.Background()
	// postgres:18.6, matching docker-compose.yml's pin — see TOTPRequiredSuite.
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

func (s *CreateSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *CreateSuite) create(email, username string) (domain.User, error) {
	return s.store.Create(s.T().Context(), domain.User{Email: email, Username: username, PasswordHash: "hash"})
}

// A collision on either identifier is one refusal, byte for byte, whatever
// state the account holding it is in: the message must not say which field
// collided, or that a hidden account exists behind it.
func (s *CreateSuite) TestATakenLoginIsOneRefusalWhicheverFieldCollided() {
	ctx := s.T().Context()
	_, err := s.create("active@example.com", "active")
	assert.NilError(s.T(), err)
	frozen, err := s.create("frozen@example.com", "frozen")
	assert.NilError(s.T(), err)
	_, err = s.store.SetStatus(ctx, frozen.ID, domain.StatusFrozen, nil)
	assert.NilError(s.T(), err)
	deleted, err := s.create("deleted@example.com", "deleted")
	assert.NilError(s.T(), err)
	_, err = s.store.SetStatus(ctx, deleted.ID, domain.StatusDeleted, new(time.Now()))
	assert.NilError(s.T(), err)

	for _, tc := range []struct{ name, email, username string }{
		{"email of an active account", "active@example.com", "fresh1"},
		{"username of an active account", "fresh2@example.com", "active"},
		{"email of a frozen account", "frozen@example.com", "fresh3"},
		{"username of a frozen account", "fresh4@example.com", "frozen"},
		{"email of a deleted account", "deleted@example.com", "fresh5"},
		{"username of a deleted account", "fresh6@example.com", "deleted"},
	} {
		s.Run(tc.name, func() {
			_, err := s.create(tc.email, tc.username)
			assert.ErrorIs(s.T(), err, domain.ErrLoginTaken)
			assert.Equal(s.T(), err.Error(), "email or username is unavailable")
		})
	}
}

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

// ChangePasswordSuite pins what makes a password change visible to the
// journal. audit_capture() redacts password_hash and ignores updated_at, so an
// UPDATE touching only those two is dropped as a no-op; password_changed_at is
// the column the trigger actually sees change.
type ChangePasswordSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *users.Store
}

func TestChangePasswordSuite(t *testing.T) { suite.Run(t, new(ChangePasswordSuite)) }

func (s *ChangePasswordSuite) SetupSuite() {
	ctx := context.Background()
	// postgres:18.6, matching docker-compose.yml's pin; see TOTPRequiredSuite.
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

func (s *ChangePasswordSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *ChangePasswordSuite) passwordChangedAt(id string) *time.Time {
	var at *time.Time
	err := s.pool.QueryRow(s.T().Context(), `SELECT password_changed_at FROM users WHERE id = $1`, id).Scan(&at)
	assert.NilError(s.T(), err)
	return at
}

// A fresh account has never had its password changed.
func (s *ChangePasswordSuite) TestANewUserHasNoPasswordChangedAt() {
	u, err := s.store.Create(
		s.T().Context(),
		domain.User{Email: "p1@example.com", Username: "p1", PasswordHash: "hash"},
	)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), s.passwordChangedAt(u.ID) == nil)
}

func (s *ChangePasswordSuite) TestSetsTheHashAndStampsPasswordChangedAt() {
	u, err := s.store.Create(
		s.T().Context(),
		domain.User{Email: "p2@example.com", Username: "p2", PasswordHash: "hash"},
	)
	assert.NilError(s.T(), err)

	at := time.Date(2026, 10, 29, 12, 0, 0, 123456000, time.UTC)
	stamped, err := s.store.ChangePassword(s.T().Context(), u.ID, "new-hash", at)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), stamped.UnixMicro(), at.UnixMicro())

	got := s.passwordChangedAt(u.ID)
	assert.Assert(s.T(), got != nil)
	assert.Equal(s.T(), got.UnixMicro(), at.UnixMicro())
	reread, err := s.store.GetByID(s.T().Context(), u.ID)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), reread.PasswordHash, "new-hash")
}

func (s *ChangePasswordSuite) TestAnUnknownUserIsNotFound() {
	_, err := s.store.ChangePassword(s.T().Context(), "00000000-0000-0000-0000-000000000000", "new-hash", time.Now())

	assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)
}

// Two changes race: the second computed its candidate before the first
// stamped, so the candidate is older than the stored epoch. The epoch must not
// move backwards (it would revive sessions the first change outdated), and the
// returned stamp is what the caller's session has to follow.
func (s *ChangePasswordSuite) TestAnOlderCandidateNeverMovesTheEpochBackwards() {
	ctx := s.T().Context()
	u, err := s.store.Create(ctx, domain.User{Email: "p4@example.com", Username: "p4", PasswordHash: "hash"})
	assert.NilError(s.T(), err)
	first := time.Date(2026, 10, 29, 12, 0, 0, 500000000, time.UTC)
	_, err = s.store.ChangePassword(ctx, u.ID, "h1", first)
	assert.NilError(s.T(), err)

	stamped, err := s.store.ChangePassword(ctx, u.ID, "h2", first.Add(-time.Second))

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), stamped.UnixMicro(), first.UnixMicro()+1)
	assert.Equal(s.T(), s.passwordChangedAt(u.ID).UnixMicro(), stamped.UnixMicro())
}

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

// UpdateSuite pins that a rename and a grant rewrite share one transaction:
// the rollback is Postgres', so a mock cannot show it.
type UpdateSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *roles.Store
}

func TestUpdateSuite(t *testing.T) { suite.Run(t, new(UpdateSuite)) }

func (s *UpdateSuite) SetupSuite() {
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
	s.store = roles.New(s.pool)
}

func (s *UpdateSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *UpdateSuite) TestRenamesAndRegrantsTogether() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "surveyor", Title: "Surveyor"})
	assert.NilError(s.T(), err)

	got, err := s.store.Update(ctx, domain.RoleUpdate{
		Slug: "surveyor", Title: "Chief surveyor",
		PermissionSlugs: []string{"territory:read"}, ReplacePermissions: true,
	}, "", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Chief surveyor")
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}

// The refused replace had already deleted the old grants when it hit the
// unknown slug; the rollback must bring them back with the title.
func (s *UpdateSuite) TestARefusedGrantLeavesTheOldTitleAndGrants() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "auditor", Title: "Auditor", PermissionSlugs: []string{"territory:read"}})
	assert.NilError(s.T(), err)

	_, err = s.store.Update(ctx, domain.RoleUpdate{
		Slug: "auditor", Title: "Renamed", PermissionSlugs: []string{"no:such"}, ReplacePermissions: true,
	}, "", true)
	assert.ErrorIs(s.T(), err, domain.ErrPermissionUnknown)
	got, err := s.store.Get(ctx, "auditor")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Auditor")
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}

// A slug listed twice is one grant, on both the PATCH and the PUT path, not a
// primary-key violation answered as a 500.
func (s *UpdateSuite) TestASlugListedTwiceIsGrantedOnce() {
	ctx := s.T().Context()
	twice := []string{"territory:read", "territory:read"}
	_, err := s.store.Create(ctx, domain.Role{Slug: "twice", Title: "Twice"})
	assert.NilError(s.T(), err)

	got, err := s.store.Update(ctx, domain.RoleUpdate{
		Slug: "twice", Title: "Twice", PermissionSlugs: twice, ReplacePermissions: true,
	}, "", true)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})

	got, err = s.store.SetPermissions(ctx, "twice", twice, "", true)
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}

func (s *UpdateSuite) TestATitleOnlyUpdateKeepsTheGrants() {
	ctx := s.T().Context()
	_, err := s.store.Create(ctx, domain.Role{Slug: "reader", Title: "Reader", PermissionSlugs: []string{"territory:read"}})
	assert.NilError(s.T(), err)

	got, err := s.store.Update(ctx, domain.RoleUpdate{Slug: "reader", Title: "Reader II"}, "", true)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Title, "Reader II")
	assert.DeepEqual(s.T(), got.PermissionSlugs, []string{"territory:read"})
}

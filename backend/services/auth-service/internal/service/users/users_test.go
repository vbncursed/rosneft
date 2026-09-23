package users_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type UsersSuite struct {
	suite.Suite
	svc *users.Service
	st  *mocks.StoreMock
	ss  *mocks.SessionsMock
	ctx context.Context
}

func TestUsersSuite(t *testing.T) {
	suite.Run(t, new(UsersSuite))
}

func (s *UsersSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.ss = mocks.NewSessionsMock(mc)
	s.svc = users.New(s.st, s.ss)
	s.ctx = s.T().Context()
}

func (s *UsersSuite) TestFreezeRejectsSelf() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := s.svc.Freeze(s.ctx, "u1", true, "u1")
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

// SetTOTPRequired has no guard() call (see its doc comment), so the
// self-target check has to stand on its own — this is exactly the path a
// scoped administrator could otherwise use to strip a TOTP requirement Root
// imposed on them.
func (s *UsersSuite) TestSetTOTPRequiredRejectsSelf() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := s.svc.SetTOTPRequired(s.ctx, "u1", true, "u1", false)
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

// Unfreeze/Restore are only unreachable for self today because Freeze/
// SoftDelete evict the actor's own sessions first — make it a guarantee
// rather than an accident of ordering.
func (s *UsersSuite) TestUnfreezeRejectsSelf() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := s.svc.Unfreeze(s.ctx, "u1", true, "u1")
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

func (s *UsersSuite) TestRestoreRejectsSelf() {
	s.st.GetByIDMock.Expect(s.ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := s.svc.Restore(s.ctx, "u1", true, "u1")
	assert.ErrorIs(s.T(), err, domain.ErrSelfTarget)
}

func (s *UsersSuite) TestFreezeRejectsLastAdmin() {
	s.st.GetByIDMock.When(s.ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	s.st.GetByIDMock.When(s.ctx, "owner").Then(domain.User{ID: "owner", IsOwner: true}, nil)
	s.st.CountAdminsMock.Expect(s.ctx, "admin1").Return(0, nil)

	_, err := s.svc.Freeze(s.ctx, "owner", true, "admin1")
	assert.ErrorIs(s.T(), err, domain.ErrLastAdmin)
}

// A non-owner (even an admin) cannot freeze/delete an admin account: to them
// it does not exist.
func (s *UsersSuite) TestFreezeRejectsNonOwnerManagingAdmin() {
	s.st.GetByIDMock.When(s.ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	s.st.GetByIDMock.When(s.ctx, "actor").Then(domain.User{ID: "actor", RoleSlugs: []string{"admin"}}, nil)

	_, err := s.svc.Freeze(s.ctx, "actor", true, "admin1")
	assert.ErrorIs(s.T(), err, domain.ErrUserNotFound)
}

func (s *UsersSuite) TestFreezeKillsSessions() {
	s.st.GetByIDMock.Expect(s.ctx, "u2").Return(domain.User{ID: "u2", RoleSlugs: []string{"editor"}}, nil)
	s.st.SetStatusMock.Return(domain.User{ID: "u2", Status: domain.StatusFrozen}, nil)
	s.ss.DeleteUserMock.Expect(s.ctx, "u2").Return(nil)

	out, err := s.svc.Freeze(s.ctx, "actor", true, "u2")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Status, domain.StatusFrozen)
}

// A non-Root actor never sees or touches Root or a Company Owner (admin slug),
// whatever users:read_all says: every ownership()-routed operation reads the
// target as missing, so no write and no sign-out runs. The refusal cases set no
// write expectations, so minimock fails any SetStatus/ChangePassword/DeleteUser.
func TestPrivilegedAccountsHiddenFromNonRoot(t *testing.T) {
	root := domain.User{ID: "root", IsOwner: true}
	company := domain.User{ID: "co", RoleSlugs: []string{"admin"}, CreatedBy: new("root")}
	peer := domain.User{ID: "co2", RoleSlugs: []string{"admin"}, CreatedBy: new("co")}
	reader := domain.User{ID: "reader", RoleSlugs: []string{"auditor"}}
	own := domain.User{ID: "u1", RoleSlugs: []string{"guest"}, CreatedBy: new("co")}

	ops := map[string]func(*users.Service, context.Context, string, bool, string) error{
		"get": func(svc *users.Service, ctx context.Context, actor string, all bool, id string) error {
			_, err := svc.Get(ctx, actor, all, id)
			return err
		},
		"freeze": func(svc *users.Service, ctx context.Context, actor string, all bool, id string) error {
			_, err := svc.Freeze(ctx, actor, all, id)
			return err
		},
		"soft delete": func(svc *users.Service, ctx context.Context, actor string, all bool, id string) error {
			return svc.SoftDelete(ctx, actor, all, id)
		},
		"set password": func(svc *users.Service, ctx context.Context, actor string, all bool, id string) error {
			return svc.SetPassword(ctx, actor, all, id, newPassword)
		},
	}
	tests := []struct {
		name     string
		actor    string
		scopeAll bool
		target   string
		lookups  []domain.User
		want     error
	}{
		{
			name: "users:read_all does not reach root", actor: "reader", scopeAll: true, target: "root",
			lookups: []domain.User{root, reader}, want: domain.ErrUserNotFound,
		},
		{
			name: "users:read_all does not reach a company owner", actor: "reader", scopeAll: true, target: "co",
			lookups: []domain.User{company, reader}, want: domain.ErrUserNotFound,
		},
		{
			name: "a company owner does not reach an admin they created", actor: "co", target: "co2",
			lookups: []domain.User{peer, company}, want: domain.ErrUserNotFound,
		},
		{
			name: "root reaches a company owner", actor: "root", scopeAll: true, target: "co",
			lookups: []domain.User{company, root},
		},
		{
			name: "a company owner reaches a user they created", actor: "co", target: "u1",
			lookups: []domain.User{own},
		},
	}
	for _, tc := range tests {
		for op, call := range ops {
			t.Run(tc.name+"/"+op, func(t *testing.T) {
				mc := minimock.NewController(t)
				st, ss := mocks.NewStoreMock(mc), mocks.NewSessionsMock(mc)
				ctx := t.Context()
				for _, u := range tc.lookups {
					st.GetByIDMock.When(ctx, u.ID).Then(u, nil)
				}
				if tc.want == nil {
					st.CountAdminsMock.Optional().Return(1, nil)
					st.SetStatusMock.Optional().Return(domain.User{ID: tc.target}, nil)
					st.ChangePasswordMock.Optional().Return(nil)
					ss.DeleteUserMock.Optional().Return(nil)
				}

				err := call(users.New(st, ss), ctx, tc.actor, tc.scopeAll, tc.target)

				if tc.want == nil {
					assert.NilError(t, err)
					return
				}
				assert.ErrorIs(t, err, tc.want)
			})
		}
	}
}

// Their own account stays reachable: the admin slug hides everyone else's.
func (s *UsersSuite) TestCompanyOwnerReachesOwnAccount() {
	s.st.GetByIDMock.Expect(s.ctx, "co").Return(domain.User{ID: "co", RoleSlugs: []string{"admin"}}, nil)
	u, err := s.svc.Get(s.ctx, "co", false, "co")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), u.ID, "co")
}

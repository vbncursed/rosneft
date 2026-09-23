package users_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/password"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

type SetPasswordSuite struct{ suite.Suite }

func TestSetPasswordSuite(t *testing.T) { suite.Run(t, new(SetPasswordSuite)) }

const newPassword = "N3w-Passw0rd!"

// Every refusal leaves the password and the sessions alone. minimock enforces
// that: ChangePassword is configured only when written is set, and DeleteUser
// only when the write also succeeded, so any other call fails the case. The
// GetByID lookups are exact, because an unused When expectation fails the
// controller too; actorErr makes the actor's own lookup fail.
func (s *SetPasswordSuite) TestSetPassword() {
	root := domain.User{ID: "root", IsOwner: true}
	company := domain.User{ID: "co", RoleSlugs: []string{"admin"}}
	own := domain.User{ID: "u1", RoleSlugs: []string{"guest"}, CreatedBy: new("co")}
	foreign := domain.User{ID: "u2", RoleSlugs: []string{"guest"}, CreatedBy: new("other")}
	ownAdmin := domain.User{ID: "a1", RoleSlugs: []string{"admin"}, CreatedBy: new("co")}
	errRedis := errors.New("redis is down")
	errDB := errors.New("postgres is down")
	// A delegate holding users:write that created a user with wider access:
	// resetting that password would hand the delegate the wider access.
	delegate := domain.User{ID: "d1", Permissions: []string{"users:read", "users:write"}, CreatedBy: new("co")}
	wider := domain.User{ID: "w1", Permissions: []string{"users:read", "roles:write"}, CreatedBy: new("d1")}
	narrower := domain.User{ID: "n1", Permissions: []string{"users:read"}, CreatedBy: new("d1")}
	deleted := domain.User{ID: "x1", Status: domain.StatusDeleted, RoleSlugs: []string{"guest"}, CreatedBy: new("co")}

	tests := []struct {
		name     string
		actor    string
		scopeAll bool
		target   string
		password string
		lookups  []domain.User
		actorErr error
		written  bool
		writeErr error
		signOut  error
		want     error
	}{
		{
			name: "root resets anyone", actor: "root", scopeAll: true, target: "u2", password: newPassword,
			lookups: []domain.User{foreign}, written: true,
		},
		{
			name: "root resets a company owner", actor: "root", scopeAll: true, target: "co", password: newPassword,
			lookups: []domain.User{company, root}, written: true,
		},
		{
			name: "company owner resets a user they created", actor: "co", target: "u1", password: newPassword,
			lookups: []domain.User{own}, written: true,
		},
		{
			name: "a foreign user reads as missing", actor: "co", target: "u2", password: newPassword,
			lookups: []domain.User{foreign}, want: domain.ErrUserNotFound,
		},
		{
			name: "own password goes through /account", actor: "co", target: "co", password: newPassword,
			lookups: []domain.User{company}, want: domain.ErrSelfTarget,
		},
		{
			name: "only root resets an admin", actor: "co", target: "a1", password: newPassword,
			lookups: []domain.User{ownAdmin, company}, want: domain.ErrUserNotFound,
		},
		{
			name: "users:read_all does not reach root", actor: "co", scopeAll: true, target: "root", password: newPassword,
			lookups: []domain.User{root, company}, want: domain.ErrUserNotFound,
		},
		{
			name: "a delegate cannot reset a user holding more than it does", actor: "d1", target: "w1",
			password: newPassword, lookups: []domain.User{wider, delegate}, want: domain.ErrPrivilegeEscalation,
		},
		{
			name: "a delegate resets a user its own permissions cover", actor: "d1", target: "n1",
			password: newPassword, lookups: []domain.User{narrower, delegate}, written: true,
		},
		{
			name: "root resets a user with permissions", actor: "root", scopeAll: true, target: "w1",
			password: newPassword, lookups: []domain.User{wider, root}, written: true,
		},
		{
			// A password on a deleted account would sign in the moment it is
			// restored, with credentials its owner never chose: restore first.
			name: "a deleted account is refused, by root too", actor: "root", scopeAll: true, target: "x1",
			password: newPassword, lookups: []domain.User{deleted}, want: domain.ErrAccountDeleted,
		},
		{
			name: "a weak password is refused", actor: "root", scopeAll: true, target: "u2", password: "short",
			lookups: []domain.User{foreign}, want: domain.ErrInvalidInput,
		},
		{
			name: "a failed actor lookup is returned before any write", actor: "d1", target: "n1",
			password: newPassword, lookups: []domain.User{narrower}, actorErr: errDB, want: errDB,
		},
		{
			name: "a failed write is returned and signs nobody out", actor: "root", scopeAll: true, target: "u2",
			password: newPassword, lookups: []domain.User{foreign}, written: true, writeErr: errDB, want: errDB,
		},
		{
			name: "a failed sign-out is reported after the write", actor: "root", scopeAll: true, target: "u2",
			password: newPassword, lookups: []domain.User{foreign}, written: true, signOut: errRedis, want: errRedis,
		},
	}
	for _, tc := range tests {
		s.Run(tc.name, func() {
			mc := minimock.NewController(s.T())
			st, ss := mocks.NewStoreMock(mc), mocks.NewSessionsMock(mc)
			ctx := s.T().Context()
			for _, u := range tc.lookups {
				st.GetByIDMock.When(ctx, u.ID).Then(u, nil)
			}
			if tc.actorErr != nil {
				st.GetByIDMock.When(ctx, tc.actor).Then(domain.User{}, tc.actorErr)
			}
			if tc.written {
				st.ChangePasswordMock.Set(func(_ context.Context, id, hash string) error {
					assert.Equal(s.T(), id, tc.target)
					ok, err := password.Verify(tc.password, hash)
					assert.NilError(s.T(), err)
					assert.Assert(s.T(), ok, "the stored hash must verify the new password")
					return tc.writeErr
				})
			}
			if tc.written && tc.writeErr == nil {
				ss.DeleteUserMock.Times(1).Expect(ctx, tc.target).Return(tc.signOut)
			}

			err := users.New(st, ss).SetPassword(ctx, tc.actor, tc.scopeAll, tc.target, tc.password)

			if tc.want == nil {
				assert.NilError(s.T(), err)
				return
			}
			assert.ErrorIs(s.T(), err, tc.want)
		})
	}
}

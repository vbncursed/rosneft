package users_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

func newSvc(t *testing.T) (*users.Service, *mocks.StoreMock, *mocks.SessionsMock) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	ss := mocks.NewSessionsMock(mc)
	return users.New(st, ss), st, ss
}

func TestFreezeRejectsSelf(t *testing.T) {
	svc, st, _ := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.Expect(ctx, "u1").Return(domain.User{ID: "u1"}, nil)
	_, err := svc.Freeze(ctx, "u1", true, "u1")
	assert.ErrorIs(t, err, domain.ErrSelfTarget)
}

func TestFreezeRejectsLastAdmin(t *testing.T) {
	svc, st, _ := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.When(ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	st.GetByIDMock.When(ctx, "owner").Then(domain.User{ID: "owner", IsOwner: true}, nil)
	st.CountAdminsMock.Expect(ctx, "admin1").Return(0, nil)

	_, err := svc.Freeze(ctx, "owner", true, "admin1")
	assert.ErrorIs(t, err, domain.ErrLastAdmin)
}

// A non-owner (even an admin) cannot freeze/delete an admin account.
func TestFreezeRejectsNonOwnerManagingAdmin(t *testing.T) {
	svc, st, _ := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.When(ctx, "admin1").Then(domain.User{ID: "admin1", RoleSlugs: []string{"admin"}}, nil)
	st.GetByIDMock.When(ctx, "actor").Then(domain.User{ID: "actor", RoleSlugs: []string{"admin"}}, nil)

	_, err := svc.Freeze(ctx, "actor", true, "admin1")
	assert.ErrorIs(t, err, domain.ErrAdminOwnerOnly)
}

func TestFreezeKillsSessions(t *testing.T) {
	svc, st, ss := newSvc(t)
	ctx := t.Context()
	st.GetByIDMock.Expect(ctx, "u2").Return(domain.User{ID: "u2", RoleSlugs: []string{"editor"}}, nil)
	st.SetStatusMock.Return(domain.User{ID: "u2", Status: domain.StatusFrozen}, nil)
	ss.DeleteUserMock.Expect(ctx, "u2").Return(nil)

	out, err := svc.Freeze(ctx, "actor", true, "u2")
	assert.NilError(t, err)
	assert.Equal(t, out.Status, domain.StatusFrozen)
}

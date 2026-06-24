package users_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/users/mocks"
)

func TestListScopedToOwner(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	st.ListMock.Expect(ctx, "", false, "owner1").Return([]domain.User{{ID: "u2"}}, nil)
	out, err := svc.List(ctx, "owner1", false, "", false)
	assert.NilError(t, err)
	assert.Equal(t, len(out), 1)
}

func TestListAllForAdmin(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	st.ListMock.Expect(ctx, "", false, "").Return([]domain.User{{ID: "a"}, {ID: "b"}}, nil)
	out, err := svc.List(ctx, "admin1", true, "", false)
	assert.NilError(t, err)
	assert.Equal(t, len(out), 2)
}

func TestGetForeignUserHiddenFromOwner(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	svc := users.New(st, mocks.NewSessionsMock(mc))
	ctx := t.Context()
	other := "someoneelse"
	st.GetByIDMock.Expect(ctx, "u9").Return(domain.User{ID: "u9", CreatedBy: &other}, nil)
	_, err := svc.Get(ctx, "owner1", false, "u9")
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
}

package twofa_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/twofa/mocks"
)

func TestEnableRejectsWhenAlreadyOn(t *testing.T) {
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc)
	rc := mocks.NewRecoveryMock(mc)
	cp := mocks.NewCipherMock(mc)
	svc := twofa.New(st, rc, cp, "Rosneft")
	ctx := t.Context()

	st.GetByIDMock.Expect(ctx, "u1").Return(domain.User{ID: "u1", TOTPEnabled: true}, nil)
	_, err := svc.Enable(ctx, "u1", "123456")
	assert.ErrorIs(t, err, domain.Err2FAAlreadyEnabled)
}

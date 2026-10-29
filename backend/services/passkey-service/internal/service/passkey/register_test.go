package passkey_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/ceremony"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey/mocks"
)

// A flow id begun by one user must not finish for another: the ceremony state
// carries the user it was begun for. The engine and the store are never touched.
func TestFinishRegistrationRejectsAnotherUsersFlow(t *testing.T) {
	mc := minimock.NewController(t)
	cer := mocks.NewCeremoniesMock(mc)
	cer.TakeMock.Return(ceremony.State{UserID: "alice"}, nil)
	svc := passkey.New(mocks.NewStoreMock(mc), cer, mocks.NewEngineMock(mc))

	_, err := svc.FinishRegistration(t.Context(), "mallory", "flow", "{}", "key")
	assert.ErrorIs(t, err, domain.ErrAssertionInvalid)
}

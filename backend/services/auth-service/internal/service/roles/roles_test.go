package roles_test

import (
	"testing"

	"github.com/gojuno/minimock/v3"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles/mocks"
)

func TestCreateRejectsEmptySlug(t *testing.T) {
	mc := minimock.NewController(t)
	svc := roles.New(mocks.NewStoreMock(mc), mocks.NewPermsMock(mc))
	_, err := svc.Create(t.Context(), "", "Title", nil)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

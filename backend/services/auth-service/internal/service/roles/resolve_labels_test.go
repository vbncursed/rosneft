package roles_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles"
	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/service/roles/mocks"
)

// ResolveLabels называет роли и права для журнала аудита: связующие таблицы
// user_roles и role_permissions не хранят ничего, кроме двух uuid.

const (
	labelRoleID = "9b75ebfc-141b-448e-ad63-97fe7ca6fa47"
	labelPermID = "3f01a2c8-0d44-4b0e-9d1a-1c2b3d4e5f60"
)

type ResolveLabelsSuite struct {
	suite.Suite
	store  *mocks.StoreMock
	perms  *mocks.PermsMock
	actors *mocks.ActorsMock
	svc    *roles.Service
	ctx    context.Context
}

func TestResolveLabelsSuite(t *testing.T) {
	suite.Run(t, new(ResolveLabelsSuite))
}

func (s *ResolveLabelsSuite) SetupTest() {
	ctrl := minimock.NewController(s.T())
	s.store = mocks.NewStoreMock(ctrl)
	s.perms = mocks.NewPermsMock(ctrl)
	s.actors = mocks.NewActorsMock(ctrl)
	s.svc = roles.New(s.store, s.perms, s.actors)
	s.ctx = s.T().Context()
}

func (s *ResolveLabelsSuite) TestEmptyListSkipsTheStore() {
	got, err := s.svc.ResolveLabels(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestRefsAreGroupedByKindAndDeduplicated() {
	var seen map[string][]string
	s.store.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]string) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "role", ID: labelRoleID},
		{Kind: "role", ID: labelRoleID},
		{Kind: "permission", ID: labelPermID},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["role"], []string{labelRoleID})
	assert.DeepEqual(s.T(), seen["permission"], []string{labelPermID})
}

func (s *ResolveLabelsSuite) TestMalformedIdIsRefused() {
	// Не про SQLSTATE — запрос сравнивает id::text и переживёт мусор. Про ответ:
	// невалидный id молча не совпал бы ни с чем и прочитался как «роль удалена»,
	// а это другой факт, чем «вы прислали ерунду».
	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{{Kind: "role", ID: "not-a-uuid"}})

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownKindAndBlankIdAreDropped() {
	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "wormhole", ID: labelRoleID},
		{Kind: "role", ID: ""},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestOversizedRequestIsRefused() {
	refs := make([]domain.LabelRef, 501)
	for i := range refs {
		refs[i] = domain.LabelRef{Kind: "role", ID: labelRoleID}
	}

	_, err := s.svc.ResolveLabels(s.ctx, refs)

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownIdIsOmittedNotAnError() {
	s.store.ResolveLabelsMock.Return(map[string]string{"role:" + labelRoleID: "Редактор"}, nil)

	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "role", ID: labelRoleID},
		{Kind: "role", ID: labelPermID},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got["role:"+labelRoleID], "Редактор")
	assert.Equal(s.T(), got["role:"+labelPermID], "")
}

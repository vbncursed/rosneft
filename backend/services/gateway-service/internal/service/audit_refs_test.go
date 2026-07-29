package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service/mocks"
)

// Словарь подписей к идентификаторам внутри снимков. Ключ — "поле:значение",
// потому что изменённому полю нужны подписи обеих сторон стрелки.

type AuditRefsSuite struct {
	suite.Suite
	catalog *mocks.CatalogMock
	auth    *mocks.AuthMock
	audit   *mocks.AuditMock
	svc     *service.Gateway
	ctx     context.Context
}

func TestAuditRefsSuite(t *testing.T) {
	suite.Run(t, new(AuditRefsSuite))
}

func (s *AuditRefsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.catalog = mocks.NewCatalogMock(mc)
	s.auth = mocks.NewAuthMock(mc)
	s.audit = mocks.NewAuditMock(mc)
	s.svc = service.New(s.catalog, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), s.audit, s.auth)
	s.ctx = s.T().Context()
	// Подписи уровня записи не предмет этого теста, но ListAudit их зовёт.
	s.auth.ResolveUserLoginsMock.Return(map[string]string{}, nil)
}

func (s *AuditRefsSuite) entry() domain.AuditEntry {
	return domain.AuditEntry{
		Entity: "user_role",
		NewRow: `{"user_id":"u-1","role_id":"r-1"}`,
	}
}

func (s *AuditRefsSuite) TestLabelsAreKeyedByFieldAndValue() {
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{"role:r-1": "Редактор"}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["role_id:r-1"], "Редактор")
}

func (s *AuditRefsSuite) TestUserIdIsNamedByTheLoginResolver() {
	// Регрессия: user — третья корзина, а не «всё, что не роль, — каталогу».
	// Логины разрешает ResolveUserLogins, у auth.ResolveLabels такого вида нет.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveUserLoginsMock.Return(map[string]string{"u-1": "ivan.petrov"}, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["user_id:u-1"], "ivan.petrov")
}

func (s *AuditRefsSuite) TestUnresolvedIdIsAbsentRatherThanBlank() {
	// Пустая подпись перезаписала бы id пустотой; отсутствие ключа откатывает
	// клиента к показу самого id — ровно то, что он показывал раньше.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	_, ok := refs["role_id:r-1"]
	assert.Assert(s.T(), !ok)
}

func (s *AuditRefsSuite) TestResolverFailureDoesNotFailThePage() {
	// Журнал, отвечающий 500 из-за перезапуска auth, хуже журнала с uuid.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(nil, errors.New("auth is restarting"))

	entries, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 1)
	assert.Equal(s.T(), len(refs), 0)
}

func (s *AuditRefsSuite) TestOneResolverFailingKeepsTheOther() {
	// Роли не разрешились — модели всё равно должны быть подписаны. errgroup
	// отменил бы соседа по первой ошибке, поэтому его здесь и нет.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{{
		Entity: "role_permission",
		NewRow: `{"role_id":"r-1","permission_id":"p-1"}`,
	}, {
		Entity: "placement",
		NewRow: `{"model_id":7}`,
	}}, 0, nil)
	s.auth.ResolveLabelsMock.Return(nil, errors.New("auth is restarting"))
	s.catalog.ResolveLabelsMock.Return(map[string]string{"model:7": "pump-01"}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["model_id:7"], "pump-01")
}

func (s *AuditRefsSuite) TestWantRefsFalseSkipsBothResolvers() {
	// Экспорт CSV снимков не печатает; моки без ожиданий провалят тест, если
	// резолверы всё же позовут.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, true, "", "tok", false)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), refs == nil)
}

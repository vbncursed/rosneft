package service_test

import (
	"context"
	"errors"
	"strconv"
	"strings"
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

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["role_id:r-1"], "Редактор")
}

func (s *AuditRefsSuite) TestUserIdIsNamedByTheLoginResolver() {
	// Регрессия: user — третья корзина, а не «всё, что не роль, — каталогу».
	// Логины разрешает ResolveUserLogins, у auth.ResolveLabels такого вида нет.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveUserLoginsMock.Return(map[string]string{"u-1": "ivan.petrov"}, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["user_id:u-1"], "ivan.petrov")
}

func (s *AuditRefsSuite) TestUnresolvedIdIsAbsentRatherThanBlank() {
	// Пустая подпись перезаписала бы id пустотой; отсутствие ключа откатывает
	// клиента к показу самого id — ровно то, что он показывал раньше.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(map[string]string{}, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

	assert.NilError(s.T(), err)
	_, ok := refs["role_id:r-1"]
	assert.Assert(s.T(), !ok)
}

func (s *AuditRefsSuite) TestResolverFailureDoesNotFailThePage() {
	// Журнал, отвечающий 500 из-за перезапуска auth, хуже журнала с uuid.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)
	s.auth.ResolveLabelsMock.Return(nil, errors.New("auth is restarting"))

	entries, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

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

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), refs["model_id:7"], "pump-01")
}

func (s *AuditRefsSuite) TestRefsBeyondTheResolverCapAreStillResolved() {
	// Регрессия. Резолверы отказывают выше 500 ссылок целиком, а не усекают, и
	// collect() эту ошибку глотает — то есть без разбивки одна большая страница
	// теряла бы не лишнее, а вообще все подписи этого резолвера, молча.
	// Страница ограничена 200 записями, но visible_panorama_ids — массив без
	// потолка, так что «страница не переполнит cap» здесь неверно.
	ids := make([]string, 600)
	for i := range ids {
		ids[i] = strconv.Itoa(i + 1)
	}
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"visible_panorama_ids":[` + strings.Join(ids, ",") + `]}`,
	}}, 0, nil)

	var calls, seen int
	s.catalog.ResolveLabelsMock.Set(
		func(_ context.Context, refs []domain.LabelRef) (map[string]string, error) {
			calls++
			seen += len(refs)
			out := make(map[string]string, len(refs))
			for _, r := range refs {
				out["panorama:"+r.ID] = "pano-" + r.ID
			}
			return out, nil
		})

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", true)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), calls, 2) // 600 ссылок = 500 + 100
	assert.Equal(s.T(), seen, 600)
	// Подписи и из первой, и из последней порции — ничего не потерялось.
	assert.Equal(s.T(), refs["visible_panorama_ids:1"], "pano-1")
	assert.Equal(s.T(), refs["visible_panorama_ids:600"], "pano-600")
}

func (s *AuditRefsSuite) TestWantRefsFalseSkipsBothResolvers() {
	// Экспорт CSV снимков не печатает; моки без ожиданий провалят тест, если
	// резолверы всё же позовут.
	s.audit.ListEntriesMock.Return([]domain.AuditEntry{s.entry()}, 0, nil)

	_, _, refs, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditPrincipal{IsOwner: true}, "tok", false)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), refs == nil)
}

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

const (
	actorID   = "1422cb9d-f3d8-4193-b6fa-bf8afd288dde"
	companyID = "a70f43f8-69a8-4358-9ed1-b5af54d5a2e3"
)

type AuditLabelsSuite struct {
	suite.Suite
	cat  *mocks.CatalogMock
	aud  *mocks.AuditMock
	aut  *mocks.AuthMock
	svc  *service.Gateway
	ctx  context.Context
	page []domain.AuditEntry
}

func TestAuditLabelsSuite(t *testing.T) {
	suite.Run(t, new(AuditLabelsSuite))
}

func (s *AuditLabelsSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.cat = mocks.NewCatalogMock(mc)
	s.aud = mocks.NewAuditMock(mc)
	s.aut = mocks.NewAuthMock(mc)
	s.svc = service.New(s.cat, mocks.NewContentMock(mc), mocks.NewMeshMock(mc),
		mocks.NewUploadMock(mc), s.aud, s.aut)
	s.ctx = s.T().Context()
	s.page = []domain.AuditEntry{{
		ID: 1, ActorID: actorID, CompanyID: companyID,
		Entity: "placement", Action: "placement.update",
		NewRow: `{"id":65,"label":"Test","territory_id":1}`,
	}}
}

// listAsRoot drives the real entry point, since the labelling is only reachable
// through it.
func (s *AuditLabelsSuite) list() ([]domain.AuditEntry, error) {
	s.aud.ListEntriesMock.Return(s.page, 0, nil)
	// wantRefs=false: подписи внутри снимков — предмет audit_refs_test.go, а
	// здесь проверяются подписи уровня записи.
	out, _, _, err := s.svc.ListAudit(s.ctx, domain.AuditQuery{}, domain.AuditScope{All: true}, "tok", false)
	return out, err
}

func (s *AuditLabelsSuite) TestLabelsAreAttached() {
	s.aut.ResolveUserLoginsMock.Return(map[string]string{
		actorID: "vbncursed", companyID: "vbncursed1",
	}, nil)
	s.cat.ResolveTerritorySlugsMock.Return(map[int64]string{1: "dji-wp-46-cut"}, nil)

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].ActorLogin, "vbncursed")
	assert.Equal(s.T(), out[0].CompanyLogin, "vbncursed1")
	assert.Equal(s.T(), out[0].TerritorySlug, "dji-wp-46-cut")
}

// Один поход на сервис на страницу, а не по одному на запись: экспорт тянет
// страницы по 200 строк, и построчные вызовы дали бы сотни round trip'ов.
func (s *AuditLabelsSuite) TestOneCallPerServicePerPage() {
	s.page = append(s.page, s.page[0], s.page[0])
	s.aut.ResolveUserLoginsMock.Return(map[string]string{}, nil)
	s.cat.ResolveTerritorySlugsMock.Return(map[int64]string{}, nil)

	_, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), s.aut.ResolveUserLoginsAfterCounter(), uint64(1))
	assert.Equal(s.T(), s.cat.ResolveTerritorySlugsAfterCounter(), uint64(1))
}

// Недоступный auth оставляет журнал читаемым: подписи пустые, id на месте.
// Отдать 500 вместо страницы с UUID было бы хуже того, что было до подписей.
func (s *AuditLabelsSuite) TestResolverFailureDoesNotFailThePage() {
	s.aut.ResolveUserLoginsMock.Return(nil, errors.New("auth is down"))
	s.cat.ResolveTerritorySlugsMock.Return(nil, errors.New("catalog is down"))

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].ActorLogin, "")
	assert.Equal(s.T(), out[0].ActorID, actorID)
	assert.Equal(s.T(), out[0].TerritorySlug, "")
}

// У сущности без родительской территории каталог не спрашивают вовсе.
func (s *AuditLabelsSuite) TestEntityWithoutATerritorySkipsTheCatalog() {
	s.page = []domain.AuditEntry{{
		ID: 2, ActorID: actorID, Entity: "session", Action: "auth.login",
	}}
	s.aut.ResolveUserLoginsMock.Return(map[string]string{actorID: "vbncursed"}, nil)

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].ActorLogin, "vbncursed")
	assert.Equal(s.T(), s.cat.ResolveTerritorySlugsAfterCounter(), uint64(0))
}

// Битый снимок не должен стоить читателю страницу.
func (s *AuditLabelsSuite) TestUnparseableSnapshotIsSkipped() {
	s.page[0].NewRow = "{not json"
	s.aut.ResolveUserLoginsMock.Return(map[string]string{}, nil)

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].TerritorySlug, "")
	assert.Equal(s.T(), s.cat.ResolveTerritorySlugsAfterCounter(), uint64(0))
}

// Удаление оставляет только old_row, и родителя надо искать там.
func (s *AuditLabelsSuite) TestDeleteFallsBackToTheOldSnapshot() {
	s.page[0].NewRow = ""
	s.page[0].OldRow = `{"id":65,"territory_id":7}`
	s.page[0].Action = "placement.delete"
	s.aut.ResolveUserLoginsMock.Return(map[string]string{}, nil)
	s.cat.ResolveTerritorySlugsMock.Return(map[int64]string{7: "mr-1-wo"}, nil)

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out[0].TerritorySlug, "mr-1-wo")
}

func (s *AuditLabelsSuite) TestEmptyPageAsksNobody() {
	s.page = nil

	out, err := s.list()

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 0)
	assert.Equal(s.T(), s.aut.ResolveUserLoginsAfterCounter(), uint64(0))
	assert.Equal(s.T(), s.cat.ResolveTerritorySlugsAfterCounter(), uint64(0))
}

package service_test

import (
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *AuditLabelsSuite) TestActorsAreLabelledAndSortedByLogin() {
	s.aud.ListActorsMock.Return([]string{actorID, companyID}, nil)
	s.aut.ResolveUserLoginsMock.Return(map[string]string{
		actorID: "vbncursed", companyID: "andrch71",
	}, nil)

	out, err := s.svc.ListAuditActors(s.ctx, true, "", "tok")

	assert.NilError(s.T(), err)
	// Алфавит, а не свежесть активности: список выбирают глазами.
	assert.Equal(s.T(), out[0].Login, "andrch71")
	assert.Equal(s.T(), out[1].Login, "vbncursed")
}

func (s *AuditLabelsSuite) TestActorsAsksNobodyWhenTheJournalIsEmpty() {
	s.aud.ListActorsMock.Return(nil, nil)

	out, err := s.svc.ListAuditActors(s.ctx, true, "", "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 0)
	assert.Equal(s.T(), s.aut.ResolveUserLoginsAfterCounter(), uint64(0))
}

// В отличие от подписей в записях, здесь провал разрешения возвращается, а не
// проглатывается: дропдаун из UUID'ов — это выбор наугад, что хуже честной
// ошибки.
func (s *AuditLabelsSuite) TestActorsSurfaceAResolverFailure() {
	s.aud.ListActorsMock.Return([]string{actorID}, nil)
	s.aut.ResolveUserLoginsMock.Return(nil, errors.New("auth is down"))

	_, err := s.svc.ListAuditActors(s.ctx, true, "", "tok")

	assert.Error(s.T(), err, "auth is down")
}

// Тот же fail-closed инвариант, что у чтения журнала: принципал без компании и
// без owner-флага получает отказ, а не пустой фильтр.
func (s *AuditLabelsSuite) TestActorsRefuseAPrincipalWithoutAScope() {
	_, err := s.svc.ListAuditActors(s.ctx, false, "", "tok")

	assert.Assert(s.T(), errors.Is(err, domain.ErrForbidden))
}

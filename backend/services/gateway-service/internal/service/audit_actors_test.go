package service_test

import (
	"context"
	"errors"
	"fmt"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

func (s *AuditLabelsSuite) TestActorsAreLabelledAndSortedByLogin() {
	s.aud.ListActorsMock.Return([]string{actorID, companyID}, nil)
	s.aut.ResolveUserLoginsMock.Return(map[string]string{
		actorID: "vbncursed", companyID: "andrch71",
	}, nil)

	out, err := s.svc.ListAuditActors(s.ctx, domain.AuditPrincipal{IsOwner: true}, "tok")

	assert.NilError(s.T(), err)
	// Алфавит, а не свежесть активности: список выбирают глазами.
	assert.Equal(s.T(), out[0].Login, "andrch71")
	assert.Equal(s.T(), out[1].Login, "vbncursed")
}

func (s *AuditLabelsSuite) TestActorsAsksNobodyWhenTheJournalIsEmpty() {
	s.aud.ListActorsMock.Return(nil, nil)

	out, err := s.svc.ListAuditActors(s.ctx, domain.AuditPrincipal{IsOwner: true}, "tok")

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

	_, err := s.svc.ListAuditActors(s.ctx, domain.AuditPrincipal{IsOwner: true}, "tok")

	assert.Error(s.T(), err, "auth is down")
}

// Тот же fail-closed инвариант, что у чтения журнала: принципал без компании и
// без owner-флага получает отказ, а не пустой фильтр.
func (s *AuditLabelsSuite) TestActorsRefuseAPrincipalWithoutAScope() {
	_, err := s.svc.ListAuditActors(s.ctx, domain.AuditPrincipal{}, "tok")

	assert.Assert(s.T(), errors.Is(err, domain.ErrForbidden))
}

// Список акторов ничем не ограничен: это все, кто когда-либо касался данных
// компании, и он только растёт — журнал append-only. Потолок 500 у auth
// подбирался под другого потребителя, подписывание страницы, где ids не
// превышают 400. Без нарезки фильтр начинал падать на 501-м акторе и уже не
// восстанавливался никогда.
func (s *AuditLabelsSuite) TestActorsBeyondTheAuthCapAreStillResolved() {
	const n = 1201
	ids := make([]string, n)
	want := make(map[string]string, n)
	for i := range ids {
		ids[i] = fmt.Sprintf("00000000-0000-0000-0000-%012d", i)
		want[ids[i]] = fmt.Sprintf("user%d", i)
	}
	s.aud.ListActorsMock.Return(ids, nil)
	var batches []int
	s.aut.ResolveUserLoginsMock.Set(
		func(_ context.Context, _ string, chunk []string) (map[string]string, error) {
			batches = append(batches, len(chunk))
			got := make(map[string]string, len(chunk))
			for _, id := range chunk {
				got[id] = want[id]
			}
			return got, nil
		})

	out, err := s.svc.ListAuditActors(s.ctx, domain.AuditPrincipal{IsOwner: true}, "tok")

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), n)
	// 500 + 500 + 201: ни один батч не превышает потолок auth.
	assert.DeepEqual(s.T(), batches, []int{500, 500, 201})
}

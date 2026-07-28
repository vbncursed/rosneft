package service_test

import (
	"context"
	"errors"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service/mocks"
)

// Actors backs the journal's actor filter, which has to offer everyone in the
// reader's scope — not merely whoever appears on the page currently loaded.

// Тот же fail-closed инвариант, что и у List, и по той же причине: скоупленный
// запрос без company id выродится в «строки, где company_id IS NULL», а это
// ровно действия Root'а и системы, которых Company Owner видеть не должен.
// Отказ вместо выполнения означает, что баг наверху даст ошибку, а не утечку.
func (s *ListSuite) TestActorsScopedReadRequiresCompany() {
	svc := service.New(mocks.NewStoreMock(s.mc))

	_, err := svc.Actors(s.T().Context(), domain.Filter{AllCompanies: false, CompanyID: ""})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *ListSuite) TestActorsPassesTheScopeThrough() {
	var got domain.Filter
	store := mocks.NewStoreMock(s.mc).DistinctActorsMock.Set(
		func(_ context.Context, f domain.Filter) ([]string, error) {
			got = f
			return []string{"a", "b"}, nil
		})
	svc := service.New(store)

	ids, err := svc.Actors(s.T().Context(), domain.Filter{CompanyID: "company-1"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(ids), 2)
	assert.Equal(s.T(), got.CompanyID, "company-1")
	assert.Equal(s.T(), got.AllCompanies, false)
}

func (s *ListSuite) TestActorsForRootNeedsNoCompany() {
	store := mocks.NewStoreMock(s.mc).DistinctActorsMock.Return([]string{"a"}, nil)
	svc := service.New(store)

	ids, err := svc.Actors(s.T().Context(), domain.Filter{AllCompanies: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(ids), 1)
}

func (s *ListSuite) TestActorsPropagatesAStoreFailure() {
	store := mocks.NewStoreMock(s.mc).DistinctActorsMock.Return(nil, errors.New("db is down"))
	svc := service.New(store)

	_, err := svc.Actors(s.T().Context(), domain.Filter{AllCompanies: true})

	assert.Error(s.T(), err, "db is down")
}

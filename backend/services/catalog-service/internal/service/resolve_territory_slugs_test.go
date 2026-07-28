package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/service/mocks"
)

// ResolveTerritorySlugs labels territory ids for the audit journal, which knows
// a placement's parent only as the number sitting in its row snapshot.

type ResolveTerritorySlugsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestResolveTerritorySlugsSuite(t *testing.T) {
	suite.Run(t, new(ResolveTerritorySlugsSuite))
}

func (s *ResolveTerritorySlugsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ResolveTerritorySlugsSuite) TestEmptyListSkipsTheRepository() {
	// Мок без ожиданий: minimock провалит тест, если репозиторий всё же позовут.
	got, err := s.svc.ResolveTerritorySlugs(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveTerritorySlugsSuite) TestIdsAreDeduplicated() {
	// Страница журнала обычно про одну территорию, и посылать её id пятьдесят
	// раз незачем.
	var seen []int64
	s.repo.ResolveTerritorySlugsMock.Set(
		func(_ context.Context, ids []int64) (map[int64]string, error) {
			seen = ids
			return map[int64]string{}, nil
		})

	_, err := s.svc.ResolveTerritorySlugs(s.ctx, []int64{1, 1, 1, 7})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(seen), 2)
}

func (s *ResolveTerritorySlugsSuite) TestNonPositiveIdsAreDropped() {
	// Ноль — это «поля не было в снимке», а не территория.
	var seen []int64
	s.repo.ResolveTerritorySlugsMock.Set(
		func(_ context.Context, ids []int64) (map[int64]string, error) {
			seen = ids
			return map[int64]string{}, nil
		})

	_, err := s.svc.ResolveTerritorySlugs(s.ctx, []int64{0, 1, -5})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen, []int64{1})
}

func (s *ResolveTerritorySlugsSuite) TestOversizedRequestIsRefused() {
	ids := make([]int64, 501)
	for i := range ids {
		ids[i] = int64(i + 1)
	}

	_, err := s.svc.ResolveTerritorySlugs(s.ctx, ids)

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveTerritorySlugsSuite) TestUnknownIdIsOmittedNotAnError() {
	// Журнал помнит удалённые территории; их отсутствие в карте нормально.
	s.repo.ResolveTerritorySlugsMock.Return(map[int64]string{1: "dji-wp-46-cut"}, nil)

	got, err := s.svc.ResolveTerritorySlugs(s.ctx, []int64{1, 999})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got[1], "dji-wp-46-cut")
	assert.Equal(s.T(), got[999], "")
}

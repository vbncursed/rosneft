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

// ResolveLabels называет строки каталога для журнала аудита: снимок знает
// модель или панораму только числом.

type ResolveLabelsSuite struct {
	suite.Suite
	repo *mocks.RepositoryMock
	svc  *service.Catalog
	ctx  context.Context
}

func TestResolveLabelsSuite(t *testing.T) {
	suite.Run(t, new(ResolveLabelsSuite))
}

func (s *ResolveLabelsSuite) SetupTest() {
	s.repo = mocks.NewRepositoryMock(minimock.NewController(s.T()))
	s.svc = service.New(s.repo)
	s.ctx = s.T().Context()
}

func (s *ResolveLabelsSuite) TestEmptyListSkipsTheRepository() {
	// Мок без ожиданий: minimock провалит тест, если репозиторий всё же позовут.
	got, err := s.svc.ResolveLabels(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestRefsAreGroupedByKindAndDeduplicated() {
	var seen map[string][]int64
	s.repo.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]int64) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "model", ID: 7},
		{Kind: "territory", ID: 12},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["model"], []int64{7})
	assert.DeepEqual(s.T(), seen["territory"], []int64{12})
}

func (s *ResolveLabelsSuite) TestSameIdUnderTwoKindsIsNotCollapsed() {
	// Модель 7 и панорама 7 — разные строки; схлопывание их по числу было бы
	// ровно той коллизией, ради которой ключ несёт вид.
	var seen map[string][]int64
	s.repo.ResolveLabelsMock.Set(
		func(_ context.Context, byKind map[string][]int64) (map[string]string, error) {
			seen = byKind
			return map[string]string{}, nil
		})

	_, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "panorama", ID: 7},
	})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen["model"], []int64{7})
	assert.DeepEqual(s.T(), seen["panorama"], []int64{7})
}

func (s *ResolveLabelsSuite) TestUnknownKindAndNonPositiveIdAreDropped() {
	// Ноль — «поля не было в снимке». Незнакомый вид — перекос выкатки.
	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "wormhole", ID: 1},
		{Kind: "model", ID: 0},
		{Kind: "model", ID: -5},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *ResolveLabelsSuite) TestOversizedRequestIsRefused() {
	refs := make([]domain.LabelRef, 501)
	for i := range refs {
		refs[i] = domain.LabelRef{Kind: "model", ID: int64(i + 1)}
	}

	_, err := s.svc.ResolveLabels(s.ctx, refs)

	assert.Assert(s.T(), errors.Is(err, domain.ErrInvalidInput))
}

func (s *ResolveLabelsSuite) TestUnknownIdIsOmittedNotAnError() {
	// Журнал помнит удалённые модели; их отсутствие в карте нормально.
	s.repo.ResolveLabelsMock.Return(map[string]string{"model:7": "pump-01"}, nil)

	got, err := s.svc.ResolveLabels(s.ctx, []domain.LabelRef{
		{Kind: "model", ID: 7},
		{Kind: "model", ID: 999},
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got["model:7"], "pump-01")
	assert.Equal(s.T(), got["model:999"], "")
}

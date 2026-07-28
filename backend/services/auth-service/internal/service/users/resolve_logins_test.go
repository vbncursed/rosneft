package users_test

import (
	"context"
	"errors"
	"fmt"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/auth-service/internal/domain"
)

// ResolveLogins подписывает id, которые вызывающий уже видит в журнале аудита.
// Скоупа по created_by здесь нет намеренно: он не совпадает с областью журнала,
// и ровно из-за этого несовпадения собственные действия пользователя раньше
// отображались сырым UUID. Вместо скоупа — потолок на размер запроса.

func (s *UsersSuite) TestResolveLoginsSkipsTheStoreOnAnEmptyList() {
	// Мок без ожиданий: minimock провалит тест, если стор всё же позовут.
	got, err := s.svc.ResolveLogins(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

func (s *UsersSuite) TestResolveLoginsDeduplicatesIds() {
	// Страница журнала на 50 записей почти всегда сделана двумя-тремя людьми,
	// и посылать в SQL пятьдесят одинаковых id незачем.
	id := "288094d3-0d12-47f8-8833-cc940a080b62"
	var seen []string
	s.st.ResolveLoginsMock.Set(func(_ context.Context, ids []string) (map[string]string, error) {
		seen = ids
		return map[string]string{}, nil
	})

	_, err := s.svc.ResolveLogins(s.ctx, []string{id, id, id})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(seen), 1)
}

func (s *UsersSuite) TestResolveLoginsDropsEmptyIds() {
	// Системная запись несёт пустой актор. Он не пользователь и в запрос
	// попадать не должен.
	id := "288094d3-0d12-47f8-8833-cc940a080b62"
	var seen []string
	s.st.ResolveLoginsMock.Set(func(_ context.Context, ids []string) (map[string]string, error) {
		seen = ids
		return map[string]string{}, nil
	})

	_, err := s.svc.ResolveLogins(s.ctx, []string{"", id, ""})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), seen, []string{id})
}

func (s *UsersSuite) TestResolveLoginsRefusesAnOversizedRequest() {
	// Без потолка внутренний вызов превращается в выгрузку всех логинов.
	ids := make([]string, 501)
	for i := range ids {
		ids[i] = fmt.Sprintf("288094d3-0d12-47f8-8833-cc940a08%04d", i)
	}

	_, err := s.svc.ResolveLogins(s.ctx, ids)

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *UsersSuite) TestResolveLoginsRefusesANonUuid() {
	// Строка не-UUID в uuid[] даёт SQLSTATE 22P02 и 500-ю — тот же баг, что
	// чинили для фильтра актора в журнале. Отбиваем до SQL.
	_, err := s.svc.ResolveLogins(s.ctx, []string{"123"})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *UsersSuite) TestResolveLoginsOmitsUnknownIdsWithoutFailing() {
	// Журнал append-only и помнит удалённых. Отсутствие в карте — нормальное
	// состояние: вызывающий покажет UUID, как и раньше.
	known := "288094d3-0d12-47f8-8833-cc940a080b62"
	gone := "a70f43f8-69a8-4358-9ed1-b5af54d5a2e3"
	s.st.ResolveLoginsMock.Return(map[string]string{known: "vbncursed1"}, nil)

	got, err := s.svc.ResolveLogins(s.ctx, []string{known, gone})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got[known], "vbncursed1")
	assert.Equal(s.T(), got[gone], "")
}

func (s *UsersSuite) TestResolveLoginsPropagatesAStoreFailure() {
	s.st.ResolveLoginsMock.Return(nil, errors.New("db is down"))

	_, err := s.svc.ResolveLogins(s.ctx, []string{"288094d3-0d12-47f8-8833-cc940a080b62"})

	assert.Error(s.T(), err, "db is down")
}

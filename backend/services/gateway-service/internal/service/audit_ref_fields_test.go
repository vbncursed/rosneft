package service

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// collectRefs вынимает из снимков значения полей-ссылок. Тест внутри пакета:
// функция не экспортируется, потому что её единственный потребитель —
// resolveRowRefs соседним файлом.

func TestCollectRefsReadsBothSnapshots(t *testing.T) {
	// Изменённому полю нужны подписи обоих значений, иначе стрелка «было →
	// стало» показывает одну сторону расшифрованной, а другую нет.
	entries := []domain.AuditEntry{{
		Entity: "user_role",
		OldRow: `{"user_id":"u-1","role_id":"r-old"}`,
		NewRow: `{"user_id":"u-1","role_id":"r-new"}`,
	}}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "role", "r-old"))
	assert.Assert(t, hasRef(got, "role", "r-new"))
	assert.Assert(t, hasRef(got, "user", "u-1"))
}

func TestCollectRefsIgnoresEntitiesWithoutRefFields(t *testing.T) {
	// Страница пользовательских событий не должна платить за разбор JSON.
	entries := []domain.AuditEntry{{
		Entity: "user",
		NewRow: `{"id":"u-1","email":"a@b.c","username":"ivan"}`,
	}}

	assert.Equal(t, len(collectRefs(entries)), 0)
}

func TestCollectRefsExpandsArrayValues(t *testing.T) {
	// placements.visible_panorama_ids — массив; подпись нужна каждому элементу.
	entries := []domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"territory_id":12,"model_id":7,"visible_panorama_ids":[2,5]}`,
	}}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "territory", "12"))
	assert.Assert(t, hasRef(got, "model", "7"))
	assert.Assert(t, hasRef(got, "panorama", "2"))
	assert.Assert(t, hasRef(got, "panorama", "5"))
}

func TestCollectRefsSurvivesBrokenSnapshot(t *testing.T) {
	// Сломанный снимок не должен стоить читателю всей страницы.
	entries := []domain.AuditEntry{
		{Entity: "placement", NewRow: `{ this is not json`},
		{Entity: "placement", NewRow: `{"model_id":7}`},
	}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "model", "7"))
}

func TestCollectRefsSkipsNullAndZero(t *testing.T) {
	// null — «связи нет», ноль — «поля не было»; ни то ни другое не ссылка.
	entries := []domain.AuditEntry{{
		Entity: "placement",
		NewRow: `{"model_id":null,"territory_id":0}`,
	}}

	assert.Equal(t, len(collectRefs(entries)), 0)
}

func TestCollectRefsDeduplicatesAcrossThePage(t *testing.T) {
	// Страница обычно про одну территорию; слать её id пятьдесят раз незачем.
	entries := []domain.AuditEntry{
		{Entity: "placement", NewRow: `{"territory_id":12}`},
		{Entity: "panorama", NewRow: `{"territory_id":12}`},
	}

	assert.Equal(t, len(collectRefs(entries)), 1)
}

func TestRefKeyJoinsFieldAndValue(t *testing.T) {
	assert.Equal(t, refKey("role_id", "r-1"), "role_id:r-1")
}

func hasRef(refs []domain.LabelRef, kind, id string) bool {
	for _, r := range refs {
		if r.Kind == kind && r.ID == id {
			return true
		}
	}
	return false
}

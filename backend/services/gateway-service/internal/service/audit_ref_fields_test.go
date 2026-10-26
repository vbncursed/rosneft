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

func TestCollectRefsNamesGroups(t *testing.T) {
	// A move between groups changes placements.group_id; the group's entry
	// itself points at its territory.
	entries := []domain.AuditEntry{
		{Entity: "placement", OldRow: `{"group_id":null}`, NewRow: `{"group_id":4}`},
		{Entity: "placement_group", NewRow: `{"id":4,"territory_id":12,"title":"North"}`},
	}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "placement_group", "4"))
	assert.Assert(t, hasRef(got, "territory", "12"))
}

func TestCollectRefsNamesAPanoramaPhasesTerritory(t *testing.T) {
	// The phase flag's only reference is its territory; phase and hidden are
	// plain values, shown as they are.
	entries := []domain.AuditEntry{
		{Entity: "panorama_phase", NewRow: `{"territory_id":12,"phase":"post","hidden":true}`},
	}

	got := collectRefs(entries)

	assert.Equal(t, len(got), 1)
	assert.Assert(t, hasRef(got, "territory", "12"))
}

func TestCollectRefsNamesAZoneItsTerritoryAndAuthor(t *testing.T) {
	entries := []domain.AuditEntry{
		{Entity: "zone", NewRow: `{"id":7,"territory_id":12,"title":"Camp","created_by":"u-9"}`},
	}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "territory", "12"))
	assert.Assert(t, hasRef(got, "user", "u-9"))
}

// A zone's tag row has no id or territory of its own: it points at its zone and
// its tag.
func TestCollectRefsResolvesAZoneTagThroughItsZone(t *testing.T) {
	entries := []domain.AuditEntry{{Entity: "zone_tag", NewRow: `{"zone_id":7,"tag_id":3}`}}

	got := collectRefs(entries)

	assert.Assert(t, hasRef(got, "zone", "7"))
	assert.Assert(t, hasRef(got, "model_tag", "3"))
}

// A calibration point has a composite key and no label: it points at its
// document.
func TestCollectRefsResolvesACalibrationThroughItsDocument(t *testing.T) {
	entries := []domain.AuditEntry{{Entity: "calibration", NewRow: `{"document_id":9,"idx":0,"page":1}`}}

	got := collectRefs(entries)

	assert.Equal(t, len(got), 1)
	assert.Assert(t, hasRef(got, "document", "9"))
}

// model_tag rows hold only slug and title: nothing to resolve.
func TestCollectRefsSkipsModelTagRows(t *testing.T) {
	entries := []domain.AuditEntry{{Entity: "model_tag", NewRow: `{"id":3,"slug":"camp","title":"Camp"}`}}

	assert.Equal(t, len(collectRefs(entries)), 0)
}

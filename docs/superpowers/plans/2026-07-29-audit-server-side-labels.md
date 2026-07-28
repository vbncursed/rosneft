# Подписи акторов и территорий на сервере — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Журнал аудита отдаёт человекочитаемые подписи вместо сырых id — логин актора, логин владельца компании, слаг территории — одинаково в JSON и в CSV, и без всякой зависимости от прав вызывающего на чтение пользователей.

**Architecture:** Разрешение id в имена выполняется **один раз на запрос** в гейтвее, у сервиса-владельца данных: логины у auth, слаги территорий у catalog. Оба сервиса получают по одному узкому внутреннему RPC, принимающему список id. Фронтенд перестаёт разрешать что-либо сам: `user-directory.ts` и прокидывание `actors` через три компонента удаляются.

**Tech Stack:** Go 1.26.5, gRPC/protobuf (buf), PostgreSQL, oapi-codegen, React 19, openapi-typescript.

## Global Constraints

- Бэкенд: `make lint && make test` из `backend/`, 0 issues по 12 модулям. Фронтенд: `yarn lint && yarn test && yarn test:spa` из `frontend/`.
- **Лимит 200 строк на файл** — на фронтенде ESLint, на бэкенде вручную.
- Один concern на файл; методы сервиса — по файлу на метод (принято в этом репозитории).
- Тесты бэкенда: `testify/suite` + `gotest.tools/v3/assert` + `minimock`; assert'ы остаются `gotest.tools` даже внутри suite (`assert.X(s.T(), …)`).
- Go 1.26: `t.Context()` в тестах, `errors.AsType`, `slices`/`maps`, `min`/`max`, `for i := range n`.
- Ошибки — сентинелы в `domain/errors.go`; транспорт переводит их в `codes.*`. **Клиент гейтвея обязан звать `grpcerr.MapStatus`** — иначе InvalidArgument доедет до HTTP как 500 (ровно этот баг чинили в `79bd9ec` и `6baf26b`).
- Актор мутаций публикуется через `pkg/audittx.Run`; здесь мутаций нет, только чтение.
- После правки `.proto` — `make proto-gen`; после правки `openapi.yaml` — `make openapi-gen` в бэкенде и `yarn openapi:generate` во фронтенде.
- Комментарии по-русски, объясняют «почему».
- **Прод-деплой** правки `ops/prometheus/*` или конфигов требует пересоздания контейнера, а не reload — но здесь конфиги не меняются, только образы `auth`, `catalog`, `gateway`.

---

## Что установлено разведкой

- `auth.GetUser` **скоупится** по `created_by` (`services/auth-service/internal/service/users/get.go:15` → `s.ownership(...)`), а `ListUsers` фильтрует `WHERE u.created_by = $1` (`storage/users/list.go:16-19`). Ни то ни другое не годится: запрашивающего в своём же списке нет по построению, и это уже дало баг с `who: <uuid>`.
- `company_id` в журнале — это **id пользователя**, владельца компании (результат `ResolveOwningAdmin`), а не отдельная сущность. Подпись для него — тот же логин.
- proto-сообщение `catalog.Territory` **не содержит числового id** (только `slug`, `title`, …, поле 7). Поэтому существующий `ListTerritories` карту `id → slug` дать не может.
- `territory_id` есть у пяти таблиц: `panoramas`, `placements`, `territory_artifacts`, `territory_assignments`, `territory_documents`. Из них аудируются четыре — `territory_artifacts` триггера не несёт. Значит territory-подпись имеет смысл для сущностей `placement`, `panorama`, `document`, `territory_assignment`; у самой `territory` слаг уже лежит в `entity_label`.
- CSV сейчас: `at, actor_id, company_id, action, entity, entity_id, entity_label, result` (`httpapi/audit_csv.go:19-22`, `auditCSVRow` на строке 77).

---

## File Structure

| Файл | Что делает |
| --- | --- |
| `proto/rosneft/auth/v1/auth.proto` (изменить) | `ResolveUserLogins(ids) → map<id, login>` — внутренний, без скоупа. |
| `backend/services/auth-service/internal/storage/users/resolve_logins.go` (создать) | `SELECT id, username FROM users WHERE id = ANY($1)`. |
| `backend/services/auth-service/internal/service/users/resolve_logins.go` (создать) | Пропуск пустого списка, дедупликация, потолок на размер. |
| `backend/services/auth-service/internal/transport/grpcapi/resolve_logins.go` (создать) | Обёртка RPC. |
| `proto/rosneft/catalog/v1/catalog.proto` (изменить) | `ResolveTerritorySlugs(ids) → map<id, slug>`. Новый RPC, а не поле в `Territory`: публичная форма сообщения не меняется. |
| `backend/services/catalog-service/internal/storage/territories/resolve_slugs.go` (создать) | `SELECT id, slug FROM territories WHERE id = ANY($1)`. |
| `backend/services/catalog-service/internal/service/*/resolve_slugs.go` (создать) | Сервисный метод. |
| `backend/services/catalog-service/internal/transport/grpcapi/resolve_slugs.go` (создать) | Обёртка RPC. |
| `backend/services/gateway-service/internal/domain/audit.go` (изменить) | `AuditEntry` получает `ActorLogin`, `CompanyLogin`, `TerritorySlug`. |
| `backend/services/gateway-service/internal/service/audit_labels.go` (создать) | Сбор id со страницы, два вызова, заполнение подписей. Здесь же разбор `territory_id` из снимка. |
| `backend/services/gateway-service/internal/service/audit.go` (изменить) | `ListAudit` вызывает подписывание перед возвратом. |
| `backend/services/gateway-service/internal/clients/{auth,catalog}/*.go` (изменить) | Клиентские методы, **с `grpcerr.MapStatus`**. |
| `backend/services/gateway-service/api/openapi.yaml` (изменить) | `AuditEntry`: `actorLogin`, `companyLogin`, `territorySlug`. Новый `GET /api/audit/actors`. |
| `backend/services/audit-service/internal/storage/distinct_actors.go` (создать) | `SELECT DISTINCT actor_id … WHERE <scope>` — для дропдауна фильтра. |
| `backend/services/audit-service/internal/{service,transport/grpcapi}/actors.go` (создать) | Сервис + RPC поверх него, та же fail-closed проверка компании, что в `List`. |
| `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go` (изменить) | Три новые колонки. |
| `frontend/src/audit/domain/audit-entry.ts` (изменить) | Три новых поля. |
| `frontend/src/audit/infrastructure/audit-gateway.ts` (изменить) | Маппинг новых полей; `fetchAuditActors`. |
| `frontend/src/audit/presentation/components/{audit-panel,audit-table,audit-row,filter-options}.tsx` (изменить) | Читают подписи из записи; проп `actors` уходит. |
| `frontend/src/auth/application/user-directory.{ts,spec.tsx}` (**удалить**) | Больше не нужен: разрешение ушло на сервер. |

---

## Task 1: auth отдаёт логины по списку id

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto`
- Create: `backend/services/auth-service/internal/storage/users/resolve_logins.go`
- Create: `backend/services/auth-service/internal/service/users/resolve_logins.go`
- Create: `backend/services/auth-service/internal/transport/grpcapi/resolve_logins.go`
- Test: `backend/services/auth-service/internal/service/users/resolve_logins_test.go`

**Interfaces:**
- Produces: `ResolveUserLogins(ResolveUserLoginsRequest{repeated string ids}) → ResolveUserLoginsResponse{map<string,string> logins}`. Отсутствующий id просто не появляется в ответе — это не ошибка.
- Сервисный метод: `func (s *Service) ResolveLogins(ctx context.Context, ids []string) (map[string]string, error)`.

**Почему без скоупа — и почему это не дыра.** Этот RPC внутренний: он вызывается только гейтвеем и только для id, которые вызывающий **уже видит** в записях, пропущенных областью журнала. Подписать уже видимый UUID логином не раскрывает ничего нового. Скоуп по `created_by` здесь применить нельзя именно потому, что он не совпадает с областью журнала — на этом и сломалась предыдущая попытка. Ограничение вместо скоупа — потолок на длину списка, чтобы вызов нельзя было превратить в выгрузку всех пользователей.

- [ ] **Step 1: Написать падающий тест**

```go
// resolve_logins_test.go, пакет users_test
func (s *ResolveSuite) TestEmptyListSkipsTheStore() {
	svc := users.New(mocks.NewStoreMock(s.mc) /* + прочие зависимости как в соседних тестах */)

	got, err := svc.ResolveLogins(s.T().Context(), nil)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 0)
}

// Дедупликация: страница журнала на 50 записей почти всегда сделана двумя-тремя
// людьми, и посылать в SQL пятьдесят одинаковых id незачем.
func (s *ResolveSuite) TestIdsAreDeduplicated() {
	var got []string
	store := mocks.NewStoreMock(s.mc).ResolveLoginsMock.Set(
		func(_ context.Context, ids []string) (map[string]string, error) {
			got = ids
			return map[string]string{}, nil
		})
	svc := users.New(store /* … */)

	_, err := svc.ResolveLogins(s.T().Context(), []string{"a", "b", "a", "a"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(got), 2)
}

// Потолок: без него внутренний вызов превращается в выгрузку всех логинов.
func (s *ResolveSuite) TestOverTheCapIsRefused() {
	svc := users.New(mocks.NewStoreMock(s.mc) /* … */)
	ids := make([]string, 501)
	for i := range ids {
		ids[i] = fmt.Sprintf("id-%d", i)
	}

	_, err := svc.ResolveLogins(s.T().Context(), ids)

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// Неизвестный id — не ошибка: журнал помнит удалённых, а карта просто их
// не содержит, и вызывающий покажет UUID, как и раньше.
func (s *ResolveSuite) TestUnknownIdIsOmittedNotAnError() {
	store := mocks.NewStoreMock(s.mc).ResolveLoginsMock.Return(
		map[string]string{"known": "vbncursed1"}, nil)
	svc := users.New(store /* … */)

	got, err := svc.ResolveLogins(s.T().Context(), []string{"known", "gone"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got["known"], "vbncursed1")
	assert.Equal(s.T(), got["gone"], "")
}
```

Точный конструктор `users.New` и набор моков — скопировать из соседнего теста в том же пакете, не выдумывать.

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend/services/auth-service && go test -race ./internal/service/users/...`
Expected: FAIL — метода `ResolveLogins` нет.

- [ ] **Step 3: Реализовать storage**

```go
// resolve_logins.go
// ResolveLogins отдаёт «id → username» для найденных id. Отсутствующие просто
// не попадают в карту: журнал помнит удалённых пользователей, и их отсутствие
// здесь — нормальное состояние, а не ошибка.
func (s *Store) ResolveLogins(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, username FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("users.ResolveLogins: %w", err)
	}
	defer rows.Close()
	out := make(map[string]string, len(ids))
	for rows.Next() {
		var id, login string
		if err := rows.Scan(&id, &login); err != nil {
			return nil, fmt.Errorf("users.ResolveLogins: scan: %w", err)
		}
		out[id] = login
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("users.ResolveLogins: rows: %w", err)
	}
	return out, nil
}
```

Замечание про типы: `users.id` — UUID, а `ids` приходят строками. `pgx` приводит `text[]` к `uuid[]` при сравнении не всегда; если запрос упадёт на приведении — сравнивать через `id::text = ANY($1)` и **это единственная допустимая правка**: подставлять невалидный UUID в `uuid[]` даст тот же 22P02, что чинили в `79bd9ec`. Валидацию формата на входе добавить в сервис (см. Step 4), а не полагаться на базу.

- [ ] **Step 4: Реализовать сервис**

```go
const resolveCap = 500

// ResolveLogins подписывает id, которые вызывающий уже видит. Скоупа по
// created_by здесь нет намеренно: он не совпадает с областью журнала, и именно
// из-за этого несовпадения собственные действия пользователя раньше
// отображались сырым UUID. Вместо скоупа — потолок на размер запроса.
func (s *Service) ResolveLogins(ctx context.Context, ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	if len(ids) > resolveCap {
		return nil, fmt.Errorf("users.ResolveLogins: %w: at most %d ids", domain.ErrInvalidInput, resolveCap)
	}
	uniq := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, dup := seen[id]; dup || id == "" {
			continue
		}
		// Невалидный UUID отсекаем здесь: в SQL он даёт 22P02 и 500-ю.
		if uuid.Validate(id) != nil {
			return nil, fmt.Errorf("users.ResolveLogins: %w: id must be a uuid", domain.ErrInvalidInput)
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	return s.store.ResolveLogins(ctx, uniq)
}
```

Добавить `ResolveLogins` в интерфейс стора рядом с остальными методами и перегенерировать minimock (`go generate ./...` в модуле).

- [ ] **Step 5: proto + транспорт**

```proto
// Внутренний: подписывает id, которые вызывающий уже видит в журнале.
// Скоупа по created_by нет намеренно — он не совпадает с областью журнала.
rpc ResolveUserLogins(ResolveUserLoginsRequest) returns (ResolveUserLoginsResponse);

message ResolveUserLoginsRequest { repeated string ids = 1; }
message ResolveUserLoginsResponse { map<string, string> logins = 1; }
```

Run: `cd backend && make proto-gen`

Обёртка транспорта — по образцу соседнего файла в `grpcapi/`, с `mapError(err)`.

- [ ] **Step 6: Гейт и коммит**

Run: `cd backend && make lint && make test`
```bash
git add backend/proto backend/services/auth-service && git commit -m "feat(auth): resolve user ids to logins for internal callers"
```

---

## Task 2: catalog отдаёт слаги территорий по списку id

**Files:**
- Modify: `backend/proto/rosneft/catalog/v1/catalog.proto`
- Create: `backend/services/catalog-service/internal/storage/territories/resolve_slugs.go`
- Create: сервисный метод и обёртка RPC по образцу Task 1
- Test: сервисный тест по образцу Task 1

**Interfaces:**
- Produces: `ResolveTerritorySlugs(ResolveTerritorySlugsRequest{repeated int64 ids}) → ResolveTerritorySlugsResponse{map<int64,string> slugs}`.

Новый RPC, а не поле `id` в существующем сообщении `Territory`: добавление поля меняет публичную форму, которую отдаёт `GET /api/territories` и читает вся сцена, а нужна здесь только внутренняя выборка. `id` территории — `int64`, как в базе.

- [ ] **Step 1–6:** повторить структуру Task 1. Тесты: пустой список пропускает стор; id дедуплицируются; потолок 500; неизвестный id опускается. Валидация формата не нужна — id числовой, приводить нечего.

```go
// resolve_slugs.go
func (s *Store) ResolveSlugs(ctx context.Context, ids []int64) (map[int64]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, slug FROM territories WHERE id = ANY($1)`, ids)
	// … дальше как в Task 1
}
```

```bash
git commit -m "feat(catalog): resolve territory ids to slugs for internal callers"
```

---

## Task 3: гейтвей подписывает страницу журнала

**Files:**
- Modify: `backend/services/gateway-service/internal/domain/audit.go`
- Create: `backend/services/gateway-service/internal/service/audit_labels.go`
- Modify: `backend/services/gateway-service/internal/service/audit.go`
- Modify: клиенты `internal/clients/auth/` и `internal/clients/catalog/`
- Test: `backend/services/gateway-service/internal/service/audit_labels_test.go`

**Interfaces:**
- `domain.AuditEntry` получает `ActorLogin`, `CompanyLogin`, `TerritorySlug string`.
- `func (g *Gateway) labelAuditEntries(ctx context.Context, entries []domain.AuditEntry) []domain.AuditEntry` — **никогда не возвращает ошибку**: см. ниже.
- Клиентские методы: `auth.ResolveUserLogins(ctx, ids) (map[string]string, error)`, `catalog.ResolveTerritorySlugs(ctx, ids) (map[int64]string, error)`. Оба **обязаны** оборачивать ошибку через `grpcerr.MapStatus(err, nil)`.

**Решение, которое надо принять осознанно: подписи не роняют запрос.** Если auth или catalog недоступны, журнал отдаётся с пустыми подписями и сырыми id, а не 500-й. Читаемость — удобство; кто, что и когда — суть, и она уже в записи. Провал разрешения логируется, не возвращается (правило «либо логировать, либо возвращать» соблюдено: возврата нет).

- [ ] **Step 1: Написать падающий тест**

Ключевые случаи: два вызова на страницу, а не по одному на запись; сущность без территории не попадает в запрос слагов; недоступный auth не роняет страницу; `company_id` подписывается из той же карты, что и актор; системная запись с пустым актором подписи не получает и в запрос не попадает.

```go
// Ровно два похода наружу на страницу, сколько бы записей в ней ни было —
// иначе экспорт на 200 строк даёт 400 round trip'ов.
func (s *LabelsSuite) TestOneCallPerServicePerPage() { /* счётчики в моках */ }

// Недоступный auth оставляет журнал читаемым: подписи пустые, id на месте.
func (s *LabelsSuite) TestResolverFailureDoesNotFailThePage() {
	auth := mocks.NewAuthMock(s.mc).ResolveUserLoginsMock.Return(nil, errors.New("down"))
	// … catalog отвечает нормально
	out := g.labelAuditEntries(s.T().Context(), []domain.AuditEntry{{ActorID: "x"}})
	assert.Equal(s.T(), out[0].ActorLogin, "")
	assert.Equal(s.T(), out[0].ActorID, "x")
}
```

- [ ] **Step 2: Реализовать `audit_labels.go`**

Разбор `territory_id` из снимка: снимки — сырой JSON в строке. Брать `newRow`, при пустом — `oldRow` (удаление). Разбирать в `map[string]any` и читать `territory_id` как `float64` (JSON-число), приводя к `int64`. Собирать только для сущностей `placement`, `panorama`, `document`, `territory_assignment` — у остальных поля нет, и лишний разбор JSON на каждой строке не нужен.

Собрать множества → два вызова → заполнить поля. Ошибку каждого вызова логировать и продолжать с пустой картой.

- [ ] **Step 3: Позвать из `ListAudit`** — после `g.audit.ListEntries`, до возврата.

- [ ] **Step 4: Гейт и коммит**

---

## Task 4: openapi, DTO и CSV

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go` (`auditEntryToAPI`)
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go`
- Modify: `frontend/src/shared/infrastructure/api/dto.ts` (генерируется)

- [ ] **Step 1: openapi** — в `AuditEntry` добавить три поля с описаниями:

```yaml
        actorLogin:
          type: string
          description: Login of the acting user; empty for a system change or if resolution failed.
        companyLogin:
          type: string
          description: Login of the company owner the entry is scoped to; empty for Root and system changes.
        territorySlug:
          type: string
          description: Slug of the parent territory for placements, panoramas, documents and assignments; empty otherwise.
```

- [ ] **Step 2: Регенерация** — `cd backend && make openapi-gen`, затем `cd frontend && yarn openapi:generate`.

- [ ] **Step 3: CSV**

```go
var auditCSVHeader = []string{
	"at", "actor_id", "actor_login", "company_id", "company_login",
	"action", "entity", "entity_id", "entity_label", "territory", "result",
}
```

Колонки-подписи ставятся **рядом** с id, а не вместо: id — то, что однозначно, логин — то, что читается, и в аудите нужны оба. Порядок существующих колонок не меняется, только добавляются новые — иначе чужие разборщики CSV поедут молча.

`auditCSVRow` дополнить теми же значениями в том же порядке.

- [ ] **Step 4: Гейт и коммит**

---

## Task 5: список акторов для фильтра

**Files:**
- Create: `backend/services/audit-service/internal/storage/distinct_actors.go`
- Create: `backend/services/audit-service/internal/service/actors.go`
- Create: `backend/services/audit-service/internal/transport/grpcapi/actors.go`
- Modify: `backend/proto/rosneft/audit/v1/audit.proto`
- Modify: `backend/services/gateway-service/api/openapi.yaml` — `GET /api/audit/actors`
- Modify: гейтвей: клиент, сервис, роут, права (`audit:read`)

**Зачем отдельно:** подписи в записях покрывают показанную страницу, а дропдаун фильтра должен перечислять всех акторов области, включая тех, чьих записей на текущей странице нет.

- [ ] **Step 1:** `SELECT DISTINCT actor_id FROM audit_log WHERE <тот же scope, что в List> AND actor_id IS NOT NULL`. **Та же fail-closed проверка компании**, что в `service/list.go:26-28`: скоупленный запрос без company id отклоняется, а не выполняется — иначе вернутся ровно Root'овы и системные акторы.
- [ ] **Step 2:** гейтвей разрешает полученные id в логины тем же `ResolveUserLogins` и отдаёт `[{id, login}]`, отсортированный по логину.
- [ ] **Step 3:** роут под `audit:read` в `route_permissions.go` и `bootstrap/transport.go` — **обе** точки, иначе роут окажется без гейта.
- [ ] **Step 4:** Гейт и коммит.

---

## Task 6: фронтенд читает готовые подписи

**Files:**
- Modify: `frontend/src/audit/domain/audit-entry.ts`, `infrastructure/audit-gateway.ts`
- Modify: `presentation/components/{audit-panel,audit-table,audit-row,filter-options}.tsx`
- **Delete:** `frontend/src/auth/application/user-directory.ts` и `user-directory.spec.tsx`
- Modify: `frontend/src/shared/presentation/components/…` — ничего; трогать не нужно

- [ ] **Step 1:** три поля в `AuditEntry`, маппинг в гейтвее контекста.
- [ ] **Step 2:** `audit-row` показывает `entry.actorLogin || entry.actorId.slice(0, 8)` — деградация остаётся, но теперь она означает «сервис подписей был недоступен», а не «у тебя нет прав».
- [ ] **Step 3:** столбец `territorySlug` — добавить в строку журнала там, где он есть; сущности без территории оставляют место пустым.
- [ ] **Step 4:** `actorOptions` строится из `fetchAuditActors`, проп `actors` уходит из панели, таблицы и строки.
- [ ] **Step 5:** удалить `user-directory.*`; убедиться, что `useUserDirectory` больше нигде не упоминается (`grep -rn useUserDirectory src/`).
- [ ] **Step 6:** Полный гейт, коммит.

---

## Self-Review — покрытие

| Требование | Задача |
| --- | --- |
| CSV: логин актора | 1, 3, 4 |
| CSV: логин компании | 1, 3, 4 |
| CSV: название территории | 2, 3, 4 |
| `who: <uuid>` у не-Root — навсегда | 1, 3, 6 |
| Независимость от `users:read` | 1 (без скоупа), 6 (удаление каталога) |
| Дропдаун актора перечисляет всю область | 5 |
| Ни один запрос не роняется из-за подписей | 3, Step 2 |
| Два похода наружу на страницу, не N | 3, тест `TestOneCallPerServicePerPage` |
| Невалидный UUID не даёт 500 | 1, Step 4 |
| Порядок существующих колонок CSV сохранён | 4, Step 3 |

## Скипнуто

| Что | Когда |
| --- | --- |
| Денормализация логина в `audit_log` при записи | Если переименование пользователя начнёт искажать историю: сейчас показывается текущий логин, а не тогдашний |
| Кэш подписей между запросами | Если два RPC на страницу станут заметны в латентности |
| Название модели для placement | Если из журнала понадобится понимать, *что* разместили, а не только где |
| Подпись у `entity_label` для `user` (там email) | Отдельная миграция триггера; подействует только на будущие записи |

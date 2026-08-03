# Strict Journal Separation & Role Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Развести компанейский журнал и собственный по разным маршрутам так, чтобы показать чужие действия в `/account` было структурно невозможно; называть роль заголовком, а не слагом; уместить таблицу журнала в узкий контейнер.

**Architecture:** Новый маршрут `GET /api/audit/mine` строит скоуп из принципала и игнорирует параметр `actor` целиком — сужение принадлежит маршруту, а не гранту. `audit:read_own` перестаёт открывать `/api/audit`. Заголовки ролей едут вместе с `/api/auth/me` новым полем `roleTitles`. Таблица переходит на container query.

**Tech Stack:** Go 1.26.5 (gateway-service, auth-service), protobuf + buf, oapi-codegen, openapi-typescript, TypeScript + React 19, Tailwind CSS 4.

**Спека:** [`docs/superpowers/specs/2026-08-03-audit-separation-and-role-titles-design.md`](../specs/2026-08-03-audit-separation-and-role-titles-design.md)

## Global Constraints

- **Кап 200 строк на файл** — ESLint во фронте (`max-lines`, skipBlankLines + skipComments), проверка руками в бэкенде.
- **`make -C backend check` перед каждым коммитом, трогающим Go.** ~80 с.
- **Тесты в Go:** `testify/suite` для группировки + `gotest.tools/v3/assert` (`assert.X(s.T(), …)`, не `s.Equal()`), моки через `minimock`, контроллер строится в `SetupTest` через `minimock.NewController(s.T())`.
- **Modern Go 1.26:** `t.Context()` в тестах, `for i := range n`, `errors.AsType[T]`, `new(val)`.
- **Никакой ручной мемоизации в React.** В проекте включён React Compiler; `useMemo`/`useCallback`, которые он не может сохранить, роняют линт. Это уже случилось на ветке progressive-lod.
- **Никакого `"use client"`.**
- **Генерация, а не ручная правка:** `httpapi/openapi_gen.go`, `proto/gen/`, `frontend/src/shared/infrastructure/api/dto.ts` — вывод генераторов. Меняется источник, потом запускается генератор.
- **Ветка `dev`.** В `main` не коммитим.

## Порядок

Часть 1 (задачи 1-5) — маршрут и разделение грантов. Часть 2 (задачи 6-8) — заголовки ролей. Часть 3 (задача 9) — вёрстка. Части независимы; порядок выбран по убыванию важности, а не по зависимостям.

## Структура файлов

**Бэкенд, изменяемые:**
- `backend/services/gateway-service/api/openapi.yaml` — новый путь `/api/audit/mine`; в `Me` добавляется `roleTitles`.
- `backend/services/gateway-service/internal/service/audit.go` — `ListAudit` перестаёт сам звать `AuditScope`, скоуп приходит аргументом.
- `backend/services/gateway-service/internal/service/audit_scope.go` — `AuditScope` теряет ветку `read_own`, появляется `AuditOwnScope`.
- `backend/services/gateway-service/internal/transport/httpapi/audit.go` — обработчик `ListMyAudit`.
- `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go` — карта грантов.
- `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go` — вызов `ListAudit` получил аргумент.
- `backend/services/gateway-service/internal/transport/authhttp/dto.go` — `roleTitles` в ответе.
- `backend/proto/rosneft/auth/v1/auth.proto` — `map<string,string> role_titles` в `User`.
- `backend/services/auth-service/internal/domain/user.go`, `internal/storage/users/permissions.go`, `internal/storage/users/get.go`, `internal/storage/users/list.go`, `internal/transport/grpcapi/converters.go`.

**Фронтенд, изменяемые:**
- `frontend/src/audit/infrastructure/audit-gateway.ts` — `fetchMyAuditPage`.
- `frontend/src/audit/application/use-audit-log.ts` — принимает фетчер.
- `frontend/src/audit/presentation/components/my-activity-section.tsx` — ходит на `/mine`.
- `frontend/src/auth/domain/principal.ts`, `frontend/src/auth/infrastructure/auth-gateway.ts` — `roleTitles`.
- `frontend/src/app-shell/user-menu.tsx` — рисует заголовок.
- `frontend/src/audit/presentation/components/audit-table.tsx` — container query.

**Создаваемые:**
- `backend/services/gateway-service/internal/transport/httpapi/audit_mine_test.go`
- `frontend/src/app-shell/user-menu.spec.tsx`

---

### Task 1: Развести скоуп на два — компанейский и собственный

Сейчас `AuditScope` решает «свои или все» по грантам: предпочитает `audit:read`, откатывается на `audit:read_own`. После правки решение принимает маршрут, а функция отвечает на один вопрос каждая.

**Files:**
- Modify: `backend/services/gateway-service/internal/service/audit_scope.go`
- Test: `backend/services/gateway-service/internal/service/audit_scope_test.go`

**Interfaces:**
- Consumes: `domain.AuditPrincipal{IsOwner bool, UserID, Company string, Perms []string}`, `domain.AuditScope{All bool, Company, Actor string}` — оба существуют.
- Produces: `func AuditScope(p domain.AuditPrincipal) (domain.AuditScope, error)` — теперь **только** `audit:read`; `func AuditOwnScope(p domain.AuditPrincipal) (domain.AuditScope, error)` — пин на актора.

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `audit_scope_test.go`:

```go
func (s *AuditScopeSuite) TestReadOwnNoLongerOpensTheCompanyJournal() {
	p := domain.AuditPrincipal{UserID: "u1", Company: "c1", Perms: []string{"audit:read_own"}}

	_, err := service.AuditScope(p)

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}

func (s *AuditScopeSuite) TestOwnScopePinsToTheActor() {
	p := domain.AuditPrincipal{UserID: "u1", Company: "c1", Perms: []string{"audit:read_own"}}

	sc, err := service.AuditOwnScope(p)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sc.Actor, "u1")
	assert.Equal(s.T(), sc.Company, "c1")
	assert.Equal(s.T(), sc.All, false)
}

// audit:read must keep reaching the own-journal too: a Company Owner holds both
// grants and would otherwise lose their own account page.
func (s *AuditScopeSuite) TestOwnScopeAcceptsTheWiderGrant() {
	p := domain.AuditPrincipal{UserID: "u1", Company: "c1", Perms: []string{"audit:read"}}

	sc, err := service.AuditOwnScope(p)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sc.Actor, "u1")
}

// Root is pinned to itself here rather than given All: the page is "my
// activity", and a Root reading it means their own actions, not everyone's.
func (s *AuditScopeSuite) TestOwnScopePinsRootToo() {
	p := domain.AuditPrincipal{IsOwner: true, UserID: "root"}

	sc, err := service.AuditOwnScope(p)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), sc.Actor, "root")
	assert.Equal(s.T(), sc.All, true)
}

func (s *AuditScopeSuite) TestOwnScopeRefusesAGrantlessPrincipal() {
	p := domain.AuditPrincipal{UserID: "u1", Company: "c1"}

	_, err := service.AuditOwnScope(p)

	assert.ErrorIs(s.T(), err, domain.ErrForbidden)
}
```

Открыть файл и сверить имя сьюта и способ импорта (`service.AuditScope` против `AuditScope`) с существующими тестами — правки выше написаны под внешний тест-пакет, а файл может быть внутренним. Привести к тому, что там уже есть.

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
cd backend/services/gateway-service && go test ./internal/service/ -run AuditScope -v
```

Ожидается: `AuditOwnScope undefined`, а `TestReadOwnNoLongerOpensTheCompanyJournal` — FAIL, потому что сегодня `read_own` возвращает скоуп, а не ошибку.

- [ ] **Step 3: Реализовать**

Заменить содержимое `audit_scope.go` на:

```go
package service

import (
	"slices"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// AuditScope maps a principal onto the company journal's filter.
//
// Root reads every row. A holder of audit:read is pinned to their own company,
// taken from the principal and never from the request — a client-supplied
// company id would let one Company Owner read another's history.
//
// audit:read_own does NOT reach here. It opens /api/audit/mine and nothing
// else: the two journals are separate routes, so "whose rows" is decided by
// which route was called rather than by which grant the caller happens to hold.
// Deciding it by grant is what let a Company Owner — who holds both — see the
// whole company under a heading that said "My activity".
//
// A caller who is neither Root nor attached to a company is refused rather than
// given an empty filter: an empty company with All=false matches the rows whose
// company_id IS NULL, which are precisely Root's and the system's actions.
// Failing closed turns an upstream bug into an error instead of a disclosure.
func AuditScope(p domain.AuditPrincipal) (domain.AuditScope, error) {
	if p.IsOwner {
		return domain.AuditScope{All: true}, nil
	}
	if p.Company == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if slices.Contains(p.Perms, "audit:read") {
		return domain.AuditScope{Company: p.Company}, nil
	}
	return domain.AuditScope{}, domain.ErrForbidden
}

// AuditOwnScope maps a principal onto their own actions.
//
// The actor is always the caller's own id — including for Root, who reads this
// route to see what they did rather than what everyone did. Either grant
// reaches it: audit:read_own by definition, and audit:read because a Company
// Owner holds only that one in some deployments and must not lose their own
// account page.
//
// Company is carried alongside Actor even though the actor alone already
// identifies the rows. It costs nothing and keeps the filter true if a user id
// is ever reused across tenants.
func AuditOwnScope(p domain.AuditPrincipal) (domain.AuditScope, error) {
	if p.UserID == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if p.IsOwner {
		return domain.AuditScope{All: true, Actor: p.UserID}, nil
	}
	if p.Company == "" {
		return domain.AuditScope{}, domain.ErrForbidden
	}
	if slices.Contains(p.Perms, "audit:read") || slices.Contains(p.Perms, "audit:read_own") {
		return domain.AuditScope{Company: p.Company, Actor: p.UserID}, nil
	}
	return domain.AuditScope{}, domain.ErrForbidden
}
```

- [ ] **Step 4: Прогнать тесты**

```bash
cd backend/services/gateway-service && go test ./internal/service/ -run AuditScope -v
```

Ожидается: PASS всех тестов сьюта, включая существующие про Root и про пустую компанию.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/internal/service/audit_scope.go \
        backend/services/gateway-service/internal/service/audit_scope_test.go
git commit -m "refactor(gateway): split the audit scope into company and own

Deciding 'whose rows' by grant is what let a Company Owner — who holds both
audit:read and audit:read_own — see the whole company under a heading that
said My activity. Each function now answers one question, and the route picks
which one applies."
```

---

### Task 2: `ListAudit` принимает скоуп, а не выводит его

**Files:**
- Modify: `backend/services/gateway-service/internal/service/audit.go`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go` (вызов в `ListAudit`)
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit_csv.go` (вызов)

**Interfaces:**
- Consumes: `AuditScope` / `AuditOwnScope` из задачи 1.
- Produces: `func (g *Gateway) ListAudit(ctx context.Context, q domain.AuditQuery, sc domain.AuditScope, token string, wantRefs bool) ([]domain.AuditEntry, int64, map[string]string, error)` — вместо `p domain.AuditPrincipal` теперь `sc domain.AuditScope`, и метод больше не возвращает ошибку скоупа.

- [ ] **Step 1: Переписать сигнатуру**

В `service/audit.go` заменить докблок и тело `ListAudit` на:

```go
// ListAudit reads one page of the journal within the given scope.
//
// The scope arrives already resolved — the caller picked AuditScope or
// AuditOwnScope according to which route was hit. Resolving it here instead
// would put the "company or mine" decision back inside a function both routes
// share, which is exactly the shape that leaked the company into /account.
//
// The tenant filter is never taken from q: the handler fills in only the
// user-facing filters (actor, action, entity, time range, paging). Accepting a
// company id from the request would let one Company Owner read another's
// history.
//
// token is the caller's bearer, forwarded to auth so the actor ids in the
// result can be turned into logins. It carries no authority of its own here:
// the scope above is what limits the rows, and the token only proves to auth
// that a real session is asking.
//
// wantRefs asks for the dictionary naming the ids inside the row snapshots. The
// CSV export passes false: it prints no snapshots, and it pages the whole
// result 200 rows at a time, so it would buy a dictionary per page and throw
// each away.
//
// A scope carrying an Actor OVERWRITES whatever actor filter the request
// carried rather than merging with it: the pin is the boundary, and honouring
// ?actor= alongside it would let a pinned caller ask about somebody else.
func (g *Gateway) ListAudit(
	ctx context.Context, q domain.AuditQuery, sc domain.AuditScope, token string, wantRefs bool,
) ([]domain.AuditEntry, int64, map[string]string, error) {
	q.AllCompanies = sc.All
	q.CompanyID = sc.Company
	if sc.Actor != "" {
		q.ActorID = sc.Actor
	}
	entries, next, err := g.audit.ListEntries(ctx, q)
	if err != nil {
		return nil, 0, nil, err
	}
	entries = g.labelAuditEntries(ctx, token, entries)
	if !wantRefs {
		return entries, next, nil, nil
	}
	return entries, next, g.resolveRowRefs(ctx, token, entries), nil
}
```

- [ ] **Step 2: Поправить вызывающих**

В `httpapi/audit.go`, метод `ListAudit`, заменить первые строки на:

```go
	sc, err := service.AuditScope(auditPrincipal(ctx))
	if err != nil {
		return ListAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	}
	entries, next, refs, err := s.svc.ListAudit(ctx,
		auditQueryFromParams(req.Params), sc, authhttp.Token(ctx), true)
```

Добавить импорт пакета `service`, если его ещё нет. Ветку `case isForbidden(err):` в `switch` ниже **оставить**: `ListEntries` тоже умеет её вернуть.

В `audit_csv.go` вызовов **два** — строки 64 и 90 (первая страница и цикл догрузки). Скоуп разрешается **один раз** до цикла и передаётся в оба:

```go
	sc, err := service.AuditScope(p)
	if err != nil {
		// тот же ответ, что и сегодня на ошибку скоупа в этом обработчике —
		// сверить по существующей ветке и повторить
	}
```

CSV остаётся за `audit:read`, поэтому `AuditOwnScope` там не появляется.

- [ ] **Step 3: Поправить тесты сервиса**

`ListAudit` вызывается из тестов в пяти местах, и все передают принципала:

```
internal/service/audit_labels_test.go:57
internal/service/audit_refs_test.go:58, 71, 83, 95, 115
```

Везде одна и та же замена: `domain.AuditPrincipal{IsOwner: true}` → `domain.AuditScope{All: true}`. Это те же тесты о тех же данных — они проверяют разметку и ссылки, а не скоуп, и после правки продолжают проверять ровно то же.

```bash
cd backend/services/gateway-service && \
  grep -rn "svc.ListAudit" internal/service/ | wc -l
```

Ожидается: 6 вхождений (пять в refs, одно в labels). Если больше — правятся все.

- [ ] **Step 4: Собрать и прогнать тесты пакета**

```bash
cd backend/services/gateway-service && go build ./... && go test ./internal/... 2>&1 | tail -20
```

Ожидается: сборка проходит, тесты зелёные. Если что-то падает — разобраться до продолжения, а не править дальше.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/internal/service/ \
        backend/services/gateway-service/internal/transport/httpapi/
git commit -m "refactor(gateway): ListAudit takes a resolved scope

The route picks the scope; the reader applies it. Keeping the choice inside a
function both routes share is what let one of them mean something else."
```

---

### Task 3: Маршрут `/api/audit/mine`

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml`
- Modify: `backend/services/gateway-service/internal/transport/httpapi/audit.go`
- Regenerate: `backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go`

**Interfaces:**
- Consumes: `AuditOwnScope` (задача 1), `ListAudit` с аргументом скоупа (задача 2).
- Produces: `operationId: listMyAudit`, метод `func (s *Server) ListMyAudit(ctx context.Context, req ListMyAuditRequestObject) (ListMyAuditResponseObject, error)`.

- [ ] **Step 1: Описать путь в спеке**

В `api/openapi.yaml` сразу после блока `/api/audit:` (он заканчивается перед `/api/audit/actors:`) добавить:

```yaml
  /api/audit/mine:
    get:
      operationId: listMyAudit
      summary: Read your own actions
      description: >
        The caller's own entries, newest first. The actor is taken from the
        session and a submitted `actor` parameter is IGNORED, not merged — this
        route cannot be talked into showing somebody else's rows whatever the
        caller holds. That is the whole reason it exists separately from
        /api/audit, whose scope is the company.

        Requires audit:read_own or audit:read (Root is pinned to its own actions
        here too, not given every row).
      tags: [audit]
      parameters:
        - name: action
          in: query
          schema: { type: string }
          description: Exact action, e.g. territory.update.
        - name: entity
          in: query
          schema: { type: string }
          description: Exact entity kind, e.g. territory.
        - name: from
          in: query
          schema: { type: string, format: date-time }
        - name: to
          in: query
          schema: { type: string, format: date-time }
        - name: cursor
          in: query
          schema: { type: integer, format: int64 }
          description: Return entries with id strictly below this value.
        - name: limit
          in: query
          schema: { type: integer, default: 50, maximum: 200 }
      responses:
        '200':
          description: One page of your own entries
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuditPage' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/Internal' }
```

Параметра `actor` здесь нет намеренно: маршрут его не принимает, и спеке незачем обещать то, что игнорируется.

Заодно поправить описание `/api/audit` — фразу «Requires the audit:read permission (Root bypasses it)» дополнить: «audit:read_own does not reach this route; it opens /api/audit/mine instead.»

- [ ] **Step 2: Перегенерировать стабы**

```bash
cd /Users/vbncursed/programming/rosneft/backend && make openapi-gen
git diff --stat services/gateway-service/internal/transport/httpapi/openapi_gen.go
```

Ожидается: в диффе появились `ListMyAudit`, `ListMyAuditRequestObject`, `ListMyAuditParams`. Сборка сейчас **сломана** — `Server` не реализует новый метод интерфейса. Это ожидаемо и чинится следующим шагом.

- [ ] **Step 3: Написать падающий тест**

Создать `backend/services/gateway-service/internal/transport/httpapi/audit_mine_test.go`. Сверить со стилем соседнего `audit_csv_test.go` — как там строится `Server`, как мокается `svc`, как подкладывается принципал в контекст — и повторить его. Смысл теста:

```go
// The point of the route: a submitted actor is ignored, not merged. Anything
// else and the separation is a convention rather than a boundary.
func (s *ListMyAuditSuite) TestIgnoresASubmittedActor() {
	// принципал: UserID "me", Company "c1", Perms ["audit:read"]
	// запрос: ?actor=someone-else
	// ожидание: мок ListEntries получил query с ActorID == "me"
}

func (s *ListMyAuditSuite) TestReadOwnIsAccepted() {
	// принципал с одним audit:read_own → 200
}

func (s *ListMyAuditSuite) TestGrantlessPrincipalIsRefused() {
	// принципал без audit-грантов → 403
}
```

Тела дописать по образцу соседнего файла: моки там уже сгенерированы, изобретать новые не нужно.

- [ ] **Step 4: Реализовать обработчик**

В `httpapi/audit.go` дописать после `ListAudit`:

```go
// ListMyAudit returns one page of the caller's own actions.
//
// The scope comes from AuditOwnScope, which pins the actor to the session's
// user id. ListMyAuditParams carries no actor field at all — the route does not
// accept one — so there is nothing here to merge or forget to overwrite.
func (s *Server) ListMyAudit(ctx context.Context, req ListMyAuditRequestObject) (ListMyAuditResponseObject, error) {
	sc, err := service.AuditOwnScope(auditPrincipal(ctx))
	if err != nil {
		return ListMyAudit403JSONResponse{ForbiddenJSONResponse: ForbiddenJSONResponse{
			Code: apperr.SlugForbidden, Message: "no audit scope for this principal",
		}}, nil
	}
	entries, next, refs, err := s.svc.ListAudit(ctx, myAuditQuery(req.Params), sc, authhttp.Token(ctx), true)
	switch {
	case isInvalid(err):
		return ListMyAudit400JSONResponse{BadRequestJSONResponse: errResp(err)}, nil
	case err != nil:
		return ListMyAudit500JSONResponse{InternalJSONResponse: internalResp(err)}, nil
	}

	page := AuditPage{Entries: make([]AuditEntry, len(entries))}
	for i, e := range entries {
		page.Entries[i] = auditEntryToAPI(e)
	}
	if next > 0 {
		page.NextCursor = &next
	}
	if len(refs) > 0 {
		page.Refs = &refs
	}
	return ListMyAudit200JSONResponse(page), nil
}

// myAuditQuery mirrors auditQueryFromParams minus the actor: ListMyAuditParams
// has no such field, because the route does not accept one.
func myAuditQuery(p ListMyAuditParams) domain.AuditQuery {
	q := domain.AuditQuery{}
	if p.Action != nil {
		q.Action = *p.Action
	}
	if p.Entity != nil {
		q.Entity = *p.Entity
	}
	if p.From != nil {
		q.From = *p.From
	}
	if p.To != nil {
		q.To = *p.To
	}
	if p.Cursor != nil {
		q.Cursor = *p.Cursor
	}
	if p.Limit != nil {
		q.Limit = *p.Limit
	}
	return q
}
```

- [ ] **Step 5: Проверить кап и прогнать тесты**

```bash
cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run Audit -v 2>&1 | tail -20
wc -l internal/transport/httpapi/audit.go
```

Ожидается: тесты зелёные, файл ≤ 200 строк. Если перерос — вынести `ListMyAudit` + `myAuditQuery` в `audit_mine.go`; пакет и так держит один концерн на файл.

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/api/openapi.yaml \
        backend/services/gateway-service/internal/transport/httpapi/
git commit -m "feat(gateway): GET /api/audit/mine — your own actions, structurally

The route takes no actor parameter at all, so there is nothing to merge and
nothing to forget to overwrite. /account can no longer be pointed at the
company journal by a client that omits a filter."
```

---

### Task 4: Развести гранты по маршрутам

**Files:**
- Modify: `backend/services/gateway-service/internal/transport/authhttp/route_permissions.go`
- Test: `backend/services/gateway-service/internal/transport/authhttp/route_permissions_test.go`

**Interfaces:**
- Consumes: маршрут из задачи 3.
- Produces: карта `routePerms` с тремя изменёнными/новыми строками.

- [ ] **Step 1: Написать падающий тест**

Открыть `route_permissions_test.go`, найти, как он проверяет карту, и в том же стиле добавить:

```go
func (s *RoutePermsSuite) TestOwnJournalAndCompanyJournalDoNotShareGrants() {
	assert.DeepEqual(s.T(), routePerms["GET /api/audit"], []string{"audit:read"})
	assert.DeepEqual(s.T(), routePerms["GET /api/audit/actors"], []string{"audit:read"})
	assert.DeepEqual(s.T(), routePerms["GET /api/audit/mine"], []string{"audit:read_own", "audit:read"})
}
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run RoutePerms -v
```

Ожидается: FAIL — сегодня `GET /api/audit` несёт оба гранта, а `/api/audit/mine` в карте нет вовсе.

- [ ] **Step 3: Правка карты**

В `route_permissions.go` заменить три строки и докблок над картой:

```go
// routePerms maps "METHOD <chi route pattern>" to the permissions that open it —
// holding ANY of them is enough. Only mutations are listed; reads need any
// authenticated principal.
//
// The two journals are separate routes with separate grants, and that is the
// boundary: audit:read reads the company's history, audit:read_own reads your
// own, and neither reaches the other's route. Merging them here — one route,
// both grants, scope decided downstream — is what let /account render the whole
// company under a "My activity" heading.
var routePerms = map[string][]string{
	// The gated reads: the journals are not open to every authenticated
	// principal the way the content endpoints are.
	"GET /api/audit":        {"audit:read"},
	"GET /api/audit/actors": {"audit:read"},
	// Either grant opens the own-journal: a Company Owner may hold only the
	// wider one, and must not lose their own account page over it.
	"GET /api/audit/mine": {"audit:read_own", "audit:read"},
```

Остальные строки карты не трогать.

- [ ] **Step 4: Прогнать тесты**

```bash
cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -v 2>&1 | tail -20
```

Ожидается: PASS. Если какой-то существующий тест утверждает, что `read_own` открывает `/api/audit`, — это как раз то поведение, которое мы меняем: тест правится вместе с картой, но правку надо назвать в сообщении коммита, а не сделать молча.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/internal/transport/authhttp/
git commit -m "feat(gateway): audit:read_own no longer opens the company journal

Measured before removing it: the grant belongs to editor, viewer and owner, and
/admin/audit is gated on audit:read (routes/admin-audit.tsx:13), so none of the
three could reach the company journal through the UI anyway. The permission was
unreachable, not merely unused."
```

---

### Task 5: Фронт ходит на собственный журнал

**Files:**
- Modify: `frontend/src/audit/infrastructure/audit-gateway.ts`
- Modify: `frontend/src/audit/application/use-audit-log.ts`
- Modify: `frontend/src/audit/presentation/components/my-activity-section.tsx`
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`

**Interfaces:**
- Consumes: `/api/audit/mine` из задачи 3.
- Produces: `fetchMyAuditPage(filters: AuditFilters, cursor: number | null): Promise<AuditPage>`; `useAuditLog(filters, fetchPage = fetchAuditPage)`.

- [ ] **Step 1: Перегенерировать DTO**

```bash
cd frontend && yarn openapi:generate && git diff --stat src/shared/infrastructure/api/dto.ts
```

Ожидается: в диффе появился путь `/api/audit/mine`.

- [ ] **Step 2: Добавить фетчер**

В `audit/infrastructure/audit-gateway.ts` после `fetchAuditPage` дописать:

```ts
// fetchMyAuditPage reads the own-journal. The actor is not a parameter here —
// the route takes it from the session and ignores anything sent — so filters.actor
// is dropped rather than forwarded, and the query string cannot widen the read.
export async function fetchMyAuditPage(
  filters: AuditFilters,
  cursor: number | null,
): Promise<AuditPage> {
  const dto = await httpGet<AuditPageDto>(
    `/api/audit/mine${toQuery({ ...filters, actor: "" }, cursor)}`,
  );
  return {
    entries: dto.entries.map(toEntry),
    nextCursor: dto.nextCursor && dto.nextCursor > 0 ? dto.nextCursor : null,
    refs: dto.refs ?? {},
  };
}
```

- [ ] **Step 3: Параметризовать хук**

В `audit/application/use-audit-log.ts` заменить сигнатуру и `queryKey`:

```ts
export function useAuditLog(
  filters: AuditFilters,
  fetchPage: (f: AuditFilters, cursor: number | null) => Promise<AuditPage> = fetchAuditPage,
  scope: "company" | "mine" = "company",
) {
  const query = useInfiniteQuery({
    // scope is part of the key: the two journals answer differently for the
    // same filters, and sharing a cache entry would show one under the other.
    queryKey: ["audit", scope, filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => fetchPage(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
```

Дописать импорт типа `AuditPage` из гейтвея. Остальное тело не трогать.

- [ ] **Step 4: Переключить секцию и переписать ложный комментарий**

В `my-activity-section.tsx` заменить импорт и вызов:

```ts
import { fetchMyAuditPage } from "@/audit/infrastructure/audit-gateway";
```

```ts
  const { entries, refs, isLoading, error, hasMore, loadMore, isLoadingMore } =
    useAuditLog(EMPTY_FILTERS, fetchMyAuditPage, "mine");
```

И заменить докблок над компонентом:

```tsx
// Секция «мои действия» на странице аккаунта. Ходит на /api/audit/mine —
// отдельный маршрут, который берёт актора из сессии и не принимает его
// параметром. Раньше здесь звался общий /api/audit в расчёте на то, что шлюз
// сузит выборку; для Company Owner, у которого есть и audit:read, он её не
// сужал, и раздел показывал историю всей компании.
//
// Фильтров нет намеренно: маршрут отдаёт одного актора, и фильтр по актору
// предлагал бы выбор из одного значения.
//
// Экспорта тоже нет — CSV остаётся за audit:read, это выгрузка истории всей
// компании.
```

- [ ] **Step 5: Проверить**

```bash
cd frontend
yarn lint; echo "LINT=$?"
yarn build > /dev/null 2>&1; echo "BUILD=$?"
yarn test:spa > /dev/null 2>&1; echo "SPA=$?"
```

Ожидается: три нуля. **Не заворачивать `yarn lint` в пайп** — код возврата тогда придёт от последней команды пайпа, а не от eslint; на ветке progressive-lod это уже пропустило падающий линт в коммит.

- [ ] **Step 6: Живая проверка**

Стенд поднят (`docker compose up -d`, `yarn dev --port 3000`). Войти как `cotest` / `Passw0rd!2026` — это Company Owner с обоими грантами, то есть ровно тот случай, где баг проявлялся.

```bash
# Ожидание: единственный актор — свой id.
curl -s -b cookies.txt "http://localhost:8080/api/audit/mine?limit=200" | jq -r '.entries[].actorId' | sort -u
# Ожидание: тот же результат — параметр проигнорирован, а не применён.
curl -s -b cookies.txt "http://localhost:8080/api/audit/mine?limit=200&actor=00000000-0000-0000-0000-000000000000" | jq -r '.entries[].actorId' | sort -u
```

Затем открыть `/account` в браузере и убедиться, что в разделе «My activity» стоит только своё имя, а `/admin/audit` по-прежнему показывает всю компанию.

- [ ] **Step 7: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/audit/ frontend/src/shared/infrastructure/api/dto.ts
git commit -m "fix(frontend): the account journal reads the own-journal route

It called /api/audit with no filter and trusted the gateway to narrow the read.
For a Company Owner, who holds audit:read as well, the gateway did not narrow
it, so a section headed My activity listed the whole company."
```

---

### Task 6: Заголовки ролей в auth-service

**Files:**
- Modify: `backend/proto/rosneft/auth/v1/auth.proto`
- Modify: `backend/services/auth-service/internal/domain/user.go`
- Modify: `backend/services/auth-service/internal/storage/users/permissions.go`
- Modify: `backend/services/auth-service/internal/storage/users/get.go`
- Modify: `backend/services/auth-service/internal/storage/users/list.go`
- Modify: `backend/services/auth-service/internal/transport/grpcapi/converters.go`
- Regenerate: `backend/proto/gen/go/rosneft/auth/v1/`

**Interfaces:**
- Consumes: таблицы `user_roles` и `roles` — обе уже соединяются существующими запросами.
- Produces: `domain.User.RoleTitles map[string]string`; поле `map<string, string> role_titles = 12;` в `User`.

- [ ] **Step 1: Поле в proto**

В `auth.proto`, в `message User`, после `repeated string onboarding_tours_seen = 11;` добавить:

```proto
  // role_titles maps each slug in role_slugs to its human-readable title, so a
  // client can name a role without a second call. It is a map rather than a
  // parallel array because slugs are the stable key everything else here is
  // addressed by, and a parallel array would silently desync on reorder.
  //
  // A slug missing from the map is possible in principle (role deleted between
  // the two reads) and clients must fall back to the slug rather than render
  // nothing.
  map<string, string> role_titles = 12;
```

- [ ] **Step 2: Перегенерировать**

```bash
cd /Users/vbncursed/programming/rosneft/backend && make proto-gen
git diff --stat proto/gen/go/rosneft/auth/v1/
```

Ожидается: `GetRoleTitles()` появился в сгенерированном коде.

- [ ] **Step 3: Домен и хранилище**

В `internal/domain/user.go` после `OnboardingToursSeen` добавить:

```go
	// RoleTitles maps each slug in RoleSlugs to the role's display title.
	// Filled by the same query that loads the slugs — the join is already there.
	RoleTitles map[string]string
```

В `internal/storage/users/permissions.go` заменить `roleSlugs` на версию, читающую и заголовок:

```go
// roleSlugs returns the user's role slugs and their titles. Both come from the
// same row: the join onto roles is needed for the slug anyway, so the title is
// one more column rather than a second query.
func (s *Store) roleSlugs(ctx context.Context, id string) ([]string, map[string]string, error) {
	const q = `SELECT r.slug, r.title FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1 ORDER BY r.slug`
	rows, err := s.pool.Query(ctx, q, id)
	if err != nil {
		return nil, nil, fmt.Errorf("users.roleSlugs: %w", err)
	}
	defer rows.Close()
	slugs := make([]string, 0, 4)
	titles := make(map[string]string, 4)
	for rows.Next() {
		var slug, title string
		if err := rows.Scan(&slug, &title); err != nil {
			return nil, nil, fmt.Errorf("users.roleSlugs: scan: %w", err)
		}
		slugs = append(slugs, slug)
		titles[slug] = title
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("users.roleSlugs: rows: %w", err)
	}
	return slugs, titles, nil
}
```

В `get.go`, функция `hydrate`, поправить вызов:

```go
	roles, titles, err := s.roleSlugs(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	perms, err := s.Permissions(ctx, u.ID)
	if err != nil {
		return domain.User{}, err
	}
	u.RoleSlugs, u.RoleTitles, u.Permissions = roles, titles, perms
	return u, nil
```

Для батчевого пути (`roleSlugsByUsers`, используется в `list.go`) сделать то же самое: добавить `r.title` в SELECT и вернуть вторым значением `map[string]map[string]string`, затем в `list.go:56` заполнить `out[i].RoleTitles`. Точные строки сверить по файлу — они могли сдвинуться.

- [ ] **Step 4: Конвертер**

В `internal/transport/grpcapi/converters.go` рядом с `RoleSlugs: u.RoleSlugs,` добавить:

```go
		RoleTitles:          u.RoleTitles,
```

- [ ] **Step 5: Проверить**

```bash
cd backend/services/auth-service && go build ./... && go test ./... 2>&1 | tail -10
```

Ожидается: сборка и тесты зелёные. Тесты хранилища здесь без Docker не идут — это ожидаемо, покрытие даёт живая проверка в задаче 8.

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/proto/ backend/services/auth-service/
git commit -m "feat(auth): carry role titles alongside role slugs

The join onto roles was already there for the slug, so the title is one more
column rather than a second query. Without it a client can only print the slug,
and slug 'admin' is titled 'Company Owner' while a different role is slugged
'owner' — so the raw slug names another role that exists."
```

---

### Task 7: Заголовки доезжают до `/api/auth/me`

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml` (схема `Me`)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/dto.go`
- Regenerate: `frontend/src/shared/infrastructure/api/dto.ts`

**Interfaces:**
- Consumes: `role_titles` из задачи 6.
- Produces: поле `roleTitles: Record<string, string>` в ответе `/api/auth/me` и во всех ответах, которые отдают пользователя.

- [ ] **Step 1: Схема**

В `openapi.yaml`, в схеме `Me` (строка ~444), после `roleSlugs` добавить:

```yaml
        roleTitles:
          type: object
          additionalProperties: { type: string }
          description: >
            Slug → display title for each entry in roleSlugs. A slug absent from
            the map means the role was deleted between reads; render the slug.
```

То же самое — в схему пользователя для админских ответов (строка ~551), чтобы `userToJSON` не отдавал поле в одном месте и не отдавал в другом.

- [ ] **Step 2: DTO шлюза**

В `authhttp/dto.go` в `userJSON` после `RoleSlugs` добавить:

```go
	RoleTitles  map[string]string `json:"roleTitles,omitzero"`
```

и в `userToJSON` после `RoleSlugs`:

```go
		RoleTitles:          u.GetRoleTitles(),
```

`omitzero`, а не `omitempty` — это правило проекта для map/slice/struct.

- [ ] **Step 3: Перегенерировать клиентские типы**

```bash
cd frontend && yarn openapi:generate && git diff --stat src/shared/infrastructure/api/dto.ts
```

- [ ] **Step 4: Проверить**

```bash
cd /Users/vbncursed/programming/rosneft/backend && go build ./... 2>&1 | tail -5
cd ../frontend && yarn lint; echo "LINT=$?"
```

Ожидается: сборка чистая, линт `0`.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/api/openapi.yaml \
        backend/services/gateway-service/internal/transport/authhttp/dto.go \
        frontend/src/shared/infrastructure/api/dto.ts
git commit -m "feat(gateway): /api/auth/me carries role titles"
```

---

### Task 8: Меню пользователя показывает заголовок

**Files:**
- Modify: `frontend/src/auth/domain/principal.ts`
- Modify: `frontend/src/auth/infrastructure/auth-gateway.ts`
- Modify: `frontend/src/app-shell/user-menu.tsx`
- Create: `frontend/src/app-shell/user-menu.spec.tsx`

**Interfaces:**
- Consumes: `roleTitles` из задачи 7.
- Produces: `Principal.roleTitles: Record<string, string>`.

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/app-shell/user-menu.spec.tsx`. Сверить со стилем соседнего spec, который рендерит компонент (например `audit/presentation/components/my-activity-section.spec.tsx`) — как там подкладывается `CurrentUserContext` и роутер, — и повторить. Смысл:

```tsx
test("names the role by its title, not its slug", () => {
  // principal: roleSlugs ["admin"], roleTitles { admin: "Company Owner" }
  // ожидание: в меню есть "Company Owner" и нет "admin"
});

test("falls back to the slug when the title is missing", () => {
  // principal: roleSlugs ["ghost"], roleTitles {}
  // ожидание: в меню есть "ghost" — роль удалили, но показать что-то надо
});
```

Меню открывается по клику на кнопку с инициалами, так что тест должен сначала кликнуть.

- [ ] **Step 2: Убедиться, что тест падает**

```bash
cd frontend && yarn test:spa src/app-shell/user-menu.spec.tsx 2>&1 | tail -12
```

Ожидается: FAIL — рендерится «admin», ожидалось «Company Owner».

- [ ] **Step 3: Поле в домене и маппинг**

В `auth/domain/principal.ts` в `interface Principal` после `roleSlugs` добавить:

```ts
  // Slug → title for each entry in roleSlugs. A missing slug means the role was
  // deleted after it was granted; callers render the slug rather than nothing.
  roleTitles: Record<string, string>;
```

В `auth/infrastructure/auth-gateway.ts` рядом с `roleSlugs: d.roleSlugs ?? [],` добавить:

```ts
    roleTitles: d.roleTitles ?? {},
```

Прогнать `yarn lint` — компилятор укажет все места, где `Principal` конструируется без нового поля (тесты, фикстуры). Дописать `roleTitles: {}` в каждое.

- [ ] **Step 4: Меню**

В `app-shell/user-menu.tsx` заменить блок плашек:

```tsx
              <p className="mt-1 flex flex-wrap gap-1">
                {p.roleSlugs.map((r) => (
                  <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">
                    {/* Заголовок, а не слаг: слаг `admin` озаглавлен «Company
                        Owner», а слаг `owner` — это другая роль, «People &
                        Roles Manager». Показ слага здесь называл роль чужим
                        именем, а не сокращал её собственное. */}
                    {p.roleTitles[r] ?? r}
                  </span>
                ))}
              </p>
```

- [ ] **Step 5: Проверить**

```bash
cd frontend
yarn test:spa src/app-shell/user-menu.spec.tsx 2>&1 | tail -8
yarn lint; echo "LINT=$?"
yarn test > /dev/null 2>&1; echo "TEST=$?"
yarn test:spa > /dev/null 2>&1; echo "SPA=$?"
```

Ожидается: спека зелёная, три нуля.

- [ ] **Step 6: Живая проверка**

Пересобрать и перезапустить `auth` и `gateway`, сверив время образа — `docker compose build` умеет молча оставить старый и написать «Started»:

```bash
cd /Users/vbncursed/programming/rosneft
docker compose build auth gateway
docker image inspect andrey-auth --format '{{.Created}}'
docker image inspect andrey-gateway --format '{{.Created}}'
docker compose up -d auth gateway
curl -s -b cookies.txt http://localhost:8080/api/auth/me | jq -c '{roleSlugs, roleTitles}'
```

Ожидается: `{"roleSlugs":["admin"],"roleTitles":{"admin":"Company Owner"}}`. Затем открыть меню в браузере и увидеть «Company Owner».

- [ ] **Step 7: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/auth/ frontend/src/app-shell/
git commit -m "fix(frontend): the user menu names the role, not its slug

Slug 'admin' is titled 'Company Owner' and a different role is slugged 'owner',
so printing the raw slug named another role that exists — not an abbreviation
of the right one."
```

---

### Task 9: Таблица журнала подстраивается под контейнер

**Files:**
- Modify: `frontend/src/audit/presentation/components/audit-table.tsx`
- Modify: `frontend/src/audit/presentation/components/audit-row.tsx`

**Interfaces:**
- Consumes: ничего.
- Produces: та же таблица, читаемая и в `max-w-3xl` (`/account`), и в `max-w-6xl` (`/admin/audit`).

- [ ] **Step 1: Замерить «до»**

Открыть `/account` в браузере, снять скриншот раздела «My activity». Это база сравнения; вёрстка тестом не проверяется, и единственная честная проверка — до/после.

- [ ] **Step 2: Container query в таблице**

В `audit-table.tsx` заменить обёртку и шапку:

```tsx
  return (
    // @container, а не медиазапрос: одна и та же таблица живёт в двух
    // контейнерах разной ширины — max-w-6xl в консоли и max-w-3xl в /account.
    // Брейкпоинт смотрит на окно и про контейнер не знает, поэтому на широком
    // мониторе узкий /account получал сетку, рассчитанную на консоль: на
    // колонку «What» оставалось ~164px под строки вида
    // "document.delete · test · dji-wp-46-cut".
    <div className="@container overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="hidden gap-3 border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500 @2xl:grid @2xl:grid-cols-[9rem_1fr_8rem_4rem] @4xl:grid-cols-[11rem_1fr_10rem_5rem]">
        <span>When</span>
        <span>What</span>
        <span>Who</span>
        <span className="justify-self-end">Detail</span>
      </div>
```

- [ ] **Step 3: Тот же шаблон в строке**

В `audit-row.tsx` заменить сетку строки (строка 22):

```tsx
      <div className="grid grid-cols-1 items-baseline gap-1 px-4 py-3 @2xl:grid-cols-[9rem_1fr_8rem_4rem] @2xl:gap-3 @4xl:grid-cols-[11rem_1fr_10rem_5rem]">
```

Шаблоны должны совпадать с шапкой символ в символ — это две независимые сетки, которые выглядят одной колонкой только пока совпадают. Если они разъедутся, шапка перестанет стоять над своими колонками, и никакой тест этого не заметит.

- [ ] **Step 4: Проверить обе страницы**

```bash
cd frontend && yarn lint; echo "LINT=$?"; yarn build > /dev/null 2>&1; echo "BUILD=$?"
```

Затем глазами:
- `/account` — колонки «What» и «Who» не наползают, слаг территории не рвётся по дефису;
- `/admin/audit` — вид не изменился относительно сегодняшнего;
- окно шириной ~700px — таблица схлопывается в одну колонку, как раньше;
- строка с длинным слагом территории и раскрытым diff читается.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/audit/presentation/components/audit-table.tsx \
        frontend/src/audit/presentation/components/audit-row.tsx
git commit -m "fix(frontend): the journal table sizes to its container, not the window

One table lives in two containers — max-w-6xl in the console, max-w-3xl in
/account — and the grid was sized for the wider one. On a wide monitor the
media query said 'plenty of room' while /account had ~164px for a column
holding 'document.delete · test · dji-wp-46-cut'."
```

---

### Task 10: Сквозная проверка и PR

**Files:** нет.

- [ ] **Step 1: Полный гейт**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check; echo "BACKEND=$?"
cd frontend
yarn lint; echo "LINT=$?"
yarn build > /dev/null 2>&1; echo "BUILD=$?"
yarn test > /dev/null 2>&1; echo "TEST=$?"
yarn test:spa > /dev/null 2>&1; echo "SPA=$?"
```

Ожидается: пять нулей. Пайпы вокруг `yarn lint` не использовать.

- [ ] **Step 2: Матрица доступа на живом стенде**

Пересобрать `gateway` и `auth`, сверить время образов, поднять. Затем для каждой из двух учёток:

| кто | `/api/audit` | `/api/audit/mine` | `/api/audit.csv` |
| --- | --- | --- | --- |
| `cotest` (Company Owner, оба гранта) | 200, вся компания | 200, только свои | 200 |
| пользователь с ролью `viewer` (только `read_own`) | **403** | 200, только свои | **403** |
| `admin` (Root) | 200, всё | 200, только свои | 200 |

Учётку `viewer` создать через `/admin/users`, если её нет. Проверить, что для `read_own` попытка подставить чужой `actor` в `/mine` ничего не меняет.

- [ ] **Step 3: Грепнуть протухшие утверждения**

```bash
cd /Users/vbncursed/programming/rosneft
grep -rn "audit:read_own\|read_own" CLAUDE.md backend/CLAUDE.md backend/services/audit-service/README.md docs/ 2>/dev/null | grep -v "docs/superpowers/specs/2026-08-03\|docs/superpowers/plans/2026-08-03"
```

Правки заведомо нужны в `CLAUDE.md` (раздел `GET /api/audit` — «Two grants reach it») и в `backend/CLAUDE.md` (раздел «Audit journal» — «AuditScope prefers the wider one and **overwrites** the `actor` query parameter in read_own mode»). Оба утверждения после этой работы ложны.

- [ ] **Step 4: Обновить документацию и закоммитить**

Привести найденное к правде: два маршрута, два гранта, `AuditScope` больше не выбирает между ними, `/api/audit/mine` не принимает `actor` вовсе.

```bash
git add CLAUDE.md backend/CLAUDE.md
git commit -m "docs: the two journals are separate routes with separate grants"
```

- [ ] **Step 5: PR**

```bash
git push -u origin dev
gh pr create --base main --head dev --title "Строгое разделение журналов и заголовки ролей" --body "$(cat <<'EOF'
Три бага из одного отчёта.

**`/account` показывал историю всей компании.** Секция звала `/api/audit` без
фильтра и полагалась на шлюз, а `AuditScope` предпочитает `audit:read` над
`audit:read_own` — Company Owner держит оба. Починено не клиентским фильтром:
разделение, которое держится на том, что клиент не забыл параметр, строгим не
является. Появился `GET /api/audit/mine`, который не принимает `actor` вовсе,
и гранты разведены по маршрутам.

Цена снятия `audit:read_own` с `/api/audit` измерена: право есть у `editor`,
`viewer` и `owner`, но `/admin/audit` гейтится `audit:read`, так что через
интерфейс ни одна из ролей туда и не попадала.

**Меню называло роль слагом.** Слаг `admin` озаглавлен «Company Owner», а слаг
`owner` — это «People & Roles Manager», то есть показывалось имя другой
существующей роли. Заголовки поехали в `/api/auth/me`.

**Таблица журнала не помещалась в `/account`.** Сетка рассчитана на `max-w-6xl`
консоли, а контейнер `max-w-3xl` оставлял ~164px на колонку «What». Медиазапрос
здесь не лечит — узок контейнер, а не окно; перешли на container query.

Матрица доступа проверена на живом стенде: <вставить результаты шага 2>.

Спека: docs/superpowers/specs/2026-08-03-audit-separation-and-role-titles-design.md
План: docs/superpowers/plans/2026-08-03-audit-separation-and-role-titles.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Код-ревью**

Запустить `/code-review` на PR. Находки с уверенностью ниже 80 в комментарии не попадут — если находка своя и проверена, чинить всё равно.

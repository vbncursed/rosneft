# Изоляция тенантов и сессия в куке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть межтенантный доступ к дочерним ресурсам территории, перевести сессию в httpOnly-куку и убрать анонимный доступ к бинарным ассетам и потоку событий.

**Architecture:** Проверка принадлежности территории переезжает из обработчиков в middleware, привязанный к префиксу шаблона маршрута, — так её нельзя забыть на новом дочернем ресурсе. Сессия переезжает в httpOnly-куку, что попутно даёт `<img>`, `<iframe>`, `EventSource` и загрузчикам three.js возможность носить авторизацию без единой правки в местах загрузки; для этого дев приводится к одно-origin топологии прода. Только после этого ассеты и SSE закрываются обычным `Authenticate`.

**Tech Stack:** Go 1.26.5, chi v5, go-chi/cors, pgx/v5, testify/suite + gotest.tools/v3/assert, minimock; фронт — Vite 8, React 19, TanStack Router/Query, vitest.

**Спека:** [`docs/superpowers/specs/2026-07-29-rbac-tenant-isolation-design.md`](../specs/2026-07-29-rbac-tenant-isolation-design.md)

## Как продолжить в новой сессии

Состояние на 2026-07-29: спека и план написаны и закоммичены, **ни одна задача
не начата**. Ветка `dev`, на два коммита впереди `main` (`b32c2e7` спека,
`bd3934e` план), рабочее дерево чистое. Предыдущее направление — журнал
изменений — доведено и слито (PR #15, `main` на `44d7b92`).

Чтобы продолжить, скажите Клоду примерно так:

> Продолжаем изоляцию тенантов по плану
> `docs/superpowers/plans/2026-07-29-rbac-tenant-isolation.md`, inline через
> executing-plans. Загрузи `ponytail:ponytail`,
> `modern-go-guidelines:use-modern-go`, `cc-skills-golang:golang-how-to`,
> `golang-testing`, `golang-database`.

Отмечайте выполненные шаги галочками прямо здесь — этот файл и есть трекер
состояния, ничего другого сверять не нужно.

**Что легко упустить, начав заново:**

- **Порядок задач 1→5 обязателен.** Задача 5 закрывает `/api/assets`; выполненная
  раньше задач 2–4 она сломает просмотр сцен, потому что куке будет не на чём
  приехать.
- **Живой проверке нужны два тенанта.** В локальной базе от прошлой сессии уже
  есть `cotest` (Company Owner) и `vtest` (viewer), пароль у обоих
  `Passw0rd!2026`; Root — `admin` / `change-me-now`. Для задачи 1 нужен **второй**
  Company Owner со своей территорией, его придётся создать.
- **Не доверяйте пересборке образа на слово.** `docker compose up -d --build`
  здесь умеет молча оставить старый образ и написать «Started» — сверяйте
  `docker image inspect andrey-<svc> --format '{{.Created}}'`. На этом уже
  потерян один неверный вывод.
- **Прод-развёртывание из этого плана не делается.** Ветка сливается в `main`
  через PR; выкатка на `85.192.26.113` — отдельное действие с бэкапом базы.

## Global Constraints

- Go **1.26.5** во всех модулях; **200 строк на файл**; один метод — один файл в `storage/`, `service/`, `transport/`.
- Тесты: `testify/suite` + `gotest.tools/v3/assert` + `minimock`. Ассерты — `assert.X(s.T(), …)`, не `s.Equal()`. Контроллер строится в `SetupTest` через `minimock.NewController(s.T())`.
- **Перед каждым коммитом Go:** `make -C backend check` (~80 с). Хук `.githooks/pre-commit` запускает его сам.
- Фронт перед коммитом: `yarn lint && yarn test && yarn test:spa` из `frontend/`.
- `proto/` не меняется. `openapi.yaml` не меняется: контракт тот же, меняется только способ переноса сессии.
- Комментарии — на языке файла: в `gateway-service` английский, во фронтовом `audit/` встречается русский.
- Ветка — `dev`, коммиты атомарные, по задаче.
- **Порядок задач 1→5 обязателен.** Задача 5 закрывает ассеты; выполненная раньше задачи 4 она сломает просмотр сцен.

---

### Task 1: Гейт на границе территории

**Files:**
- Create: `backend/services/gateway-service/internal/transport/httpapi/territory_gate.go`
- Create: `backend/services/gateway-service/internal/transport/httpapi/territory_gate_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`

**Interfaces:**
- Consumes: `authhttp.Scope(ctx) (adminID string, allAccess bool)`; `Service.GetTerritory(ctx, slug, scopeAdminID)` — обе уже существуют.
- Produces: `(*Server).RequireTerritoryAccess(next http.Handler) http.Handler` — монтируется в `/api`-подроутере после `RequirePermissionForRoute`.

- [x] **Step 1: Написать падающий тест**

Create `backend/services/gateway-service/internal/transport/httpapi/territory_gate_test.go`:

```go
package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// TerritoryGateSuite covers the middleware that keeps one tenant out of
// another's territory.
//
// The chi mechanics are the point of these tests, not an incidental detail. chi
// builds its chain as chain(middlewares, routeHTTP), so a Use middleware on a
// plain Mux runs BEFORE the route is matched and would see an empty
// RoutePattern — the gate would then never fire and never say so. It works here
// only because the middleware sits on the inline sub-router from r.Group, which
// the parent reaches after matching. That is worth pinning down rather than
// reasoning about.
type TerritoryGateSuite struct {
	suite.Suite
}

func TestTerritoryGateSuite(t *testing.T) { suite.Run(t, new(TerritoryGateSuite)) }

// fakeScope injects a principal the way authhttp.Authenticate would.
type gateCase struct {
	adminID   string
	allAccess bool
}

// router mirrors how InitRouter mounts the gate: inside r.Group, after the
// permission middleware. Anything that differs here proves nothing about
// production.
func (s *TerritoryGateSuite) router(svc Service, sc gateCase) http.Handler {
	srv := New(svc)
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(withTestScope(req.Context(), sc)))
			})
		})
		api.Use(srv.RequireTerritoryAccess)
		ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
		api.Get("/api/territories/{slug}/placements", ok)
		api.Put("/api/territories/{slug}/placements/{id}", ok)
		api.Get("/api/territories/{slug}/documents", ok)
		api.Get("/api/territories/{slug}", ok)
		api.Post("/api/territories", ok)
		api.Get("/api/models", ok)
	})
	return r
}

func (s *TerritoryGateSuite) do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func (s *TerritoryGateSuite) TestScopedCallerReachesOwnTerritory() {
	svc := gateServiceStub{territory: func(_ context.Context, slug, scope string) error {
		assert.Equal(s.T(), slug, "mine")
		assert.Equal(s.T(), scope, "admin-1", "the gate must pass the principal's scope, not an empty one")
		return nil
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/mine/placements").Code, http.StatusOK)
}

// The whole reason this middleware exists: ten of the thirteen child routes had
// no scope check at all.
func (s *TerritoryGateSuite) TestScopedCallerIsRefusedAnotherTenantsTerritory() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		return domain.ErrTerritoryNotFound
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/territories/theirs/placements"},
		{http.MethodPut, "/api/territories/theirs/placements/7"},
		{http.MethodGet, "/api/territories/theirs/documents"},
		{http.MethodGet, "/api/territories/theirs"},
	} {
		rec := s.do(h, c.method, c.path)
		assert.Equal(s.T(), rec.Code, http.StatusNotFound, "%s %s", c.method, c.path)
		// 403 would confirm the territory exists. The body must be
		// indistinguishable from a genuinely missing slug too.
		assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
	}
}

func (s *TerritoryGateSuite) TestRootSkipsTheLookupEntirely() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("Root must not cost a catalog round trip")
		return nil
	}}
	h := s.router(svc, gateCase{allAccess: true})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/any/placements").Code, http.StatusOK)
}

// Fail closed: a principal that is neither Root nor attached to a company gets
// nothing, rather than a lookup with an empty scope that would match everything.
func (s *TerritoryGateSuite) TestPrincipalWithoutACompanyIsRefused() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("an unscoped principal must be refused before the lookup")
		return nil
	}}
	h := s.router(svc, gateCase{})

	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/territories/x/placements").Code, http.StatusNotFound)
}

// Routes without a {slug} must pass through untouched — creating a territory has
// no territory to check yet.
func (s *TerritoryGateSuite) TestRoutesWithoutASlugArePassedThrough() {
	svc := gateServiceStub{territory: func(context.Context, string, string) error {
		s.T().Fatal("a slugless route must not reach the lookup")
		return nil
	}}
	h := s.router(svc, gateCase{adminID: "admin-1"})

	assert.Equal(s.T(), s.do(h, http.MethodPost, "/api/territories").Code, http.StatusOK)
	assert.Equal(s.T(), s.do(h, http.MethodGet, "/api/models").Code, http.StatusOK)
}
```

- [x] **Step 2: Написать вспомогательные заглушки теста**

В том же файле, в конце:

```go
// gateServiceStub implements only what the gate calls. Embedding Service leaves
// every other method nil — a call to one panics, which is the desired signal:
// the gate must touch nothing else.
type gateServiceStub struct {
	Service
	territory func(ctx context.Context, slug, scope string) error
}

func (g gateServiceStub) GetTerritory(ctx context.Context, slug, scope string) (domain.Territory, error) {
	if err := g.territory(ctx, slug, scope); err != nil {
		return domain.Territory{}, err
	}
	return domain.Territory{Slug: slug}, nil
}
```

Контекст принципала кодируется неэкспортируемыми ключами внутри `authhttp`, а
гейт и его тест живут в `httpapi`. Поэтому тест не воспроизводит эту кодировку у
себя — иначе он проверял бы копию, которая молча разойдётся с оригиналом, — а
зовёт конструктор из самого `authhttp`. Объявить в `territory_gate_test.go`:

```go
// withTestScope reproduces what authhttp.Authenticate puts on the context, using
// authhttp's own exported entry point so the test cannot drift from production.
func withTestScope(ctx context.Context, c gateCase) context.Context {
	if c.allAccess {
		return authhttp.NewTestContext(ctx, true, "")
	}
	return authhttp.NewTestContext(ctx, false, c.adminID)
}
```

и добавить в `backend/services/gateway-service/internal/transport/authhttp/principal.go`:

```go
// NewTestContext builds a principal context outside a real request. It exists
// because the territory gate lives in another package and cannot reach the
// unexported context keys; keeping the construction here means the gate's tests
// exercise the same encoding Authenticate writes, not a copy of it.
func NewTestContext(ctx context.Context, isOwner bool, owningAdmin string) context.Context {
	return withPrincipal(ctx, "test-user", nil, isOwner, owningAdmin, owningAdmin)
}
```

- [x] **Step 3: Добавить тест покрытия по спецификации**

Добавить в `territory_gate_test.go`. Проверка соседняя с `spec_coverage_test.go`,
но защищает другое: тот стережёт, чтобы маршрут не выпал из документации, этот —
чтобы дочерний ресурс территории не выпал из-под гейта.

```go
// Every documented territory path must be addressed the one way the gate
// understands. A future route that reaches a territory by a different shape —
// /api/territories/by-id/{id}/placements, say — would be invisible to the
// middleware and open to every tenant, and nothing else in the suite would
// notice.
//
// Deliberately scoped to /api/territories: /api/models/{slug} also carries a
// slug and legitimately has no territory gate, models being a shared library.
func (s *TerritoryGateSuite) TestEveryTerritoryPathIsAddressedBySlug() {
	sw, err := GetSpec()
	assert.NilError(s.T(), err)

	children := 0
	for path := range sw.Paths.Map() {
		if !strings.HasPrefix(path, "/api/territories") {
			continue
		}
		if path == "/api/territories" { // the collection: nothing to scope yet
			continue
		}
		assert.Assert(s.T(), strings.HasPrefix(path, territoryScopedPrefix),
			"%s reaches a territory without a {slug} in the gated position, so "+
				"RequireTerritoryAccess never sees it", path)
		children++
	}
	// Guard the guard: a spec that failed to load would pass the loop silently.
	assert.Assert(s.T(), children >= 13, "expected at least 13 territory paths, saw %d", children)
}
```

- [x] **Step 4: Запустить тесты, убедиться что падают**

Run: `cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run TestTerritoryGateSuite`
Expected: FAIL — `srv.RequireTerritoryAccess undefined`.

- [x] **Step 5: Реализовать middleware**

Create `backend/services/gateway-service/internal/transport/httpapi/territory_gate.go`:

```go
package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// territoryScopedPrefix is the route-pattern prefix every child resource of a
// territory shares. Thirteen routes sit under it today, and any added later is
// covered the moment it is registered — which is the point. The hole this closes
// was not a missing check but a check that had to be remembered thirteen times
// and was remembered three.
const territoryScopedPrefix = "/api/territories/{slug}"

// RequireTerritoryAccess refuses a caller any route under a territory they are
// not assigned to.
//
// It answers 404, never 403: a 403 confirms the territory exists, and to another
// tenant it must not. The body matches a genuinely missing slug for the same
// reason.
//
// MUST be mounted after RequirePermissionForRoute — the permission check touches
// no network, so a caller heading for a 403 should not first buy a catalog round
// trip.
//
// ponytail: one extra indexed lookup per child request, including the scene
// bundle where it duplicates that handler's own scoping. Cache within the
// request if it ever shows up in a profile.
func (s *Server) RequireTerritoryAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if !strings.HasPrefix(chi.RouteContext(ctx).RoutePattern(), territoryScopedPrefix) {
			next.ServeHTTP(w, r)
			return
		}

		scopeAdminID, allAccess := authhttp.Scope(ctx)
		if allAccess {
			next.ServeHTTP(w, r)
			return
		}
		// An empty scope on a non-Root principal is an upstream bug. Refusing is
		// the safe reading: passing "" to the catalog disables the filter and
		// would open every territory.
		if scopeAdminID == "" {
			writeTerritoryMissing(w)
			return
		}
		if _, err := s.svc.GetTerritory(ctx, chi.URLParam(r, "slug"), scopeAdminID); err != nil {
			writeTerritoryMissing(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeTerritoryMissing(w http.ResponseWriter) {
	apperr.Write(w, http.StatusNotFound, apperr.SlugNotFound, "territory not found")
}
```

`apperr.SlugNotFound` — существующая константа со значением `"not_found"`
(`backend/pkg/apperr/apperr.go:22`), та же, которой отвечают обработчики.

- [x] **Step 6: Запустить тест, убедиться что проходит**

Run: `cd backend/services/gateway-service && go test ./internal/transport/httpapi/ -run TestTerritoryGateSuite -v`
Expected: PASS, 5 тестов.

- [x] **Step 7: Смонтировать в роутере**

Modify `backend/services/gateway-service/internal/bootstrap/transport.go` — в блоке `r.Group`:

```go
	r.Group(func(api chi.Router) {
		api.Use(authH.Authenticate)
		api.Use(authhttp.RequirePermissionForRoute)
		// After the permission gate on purpose: that one costs no network, so a
		// caller already heading for a 403 does not first buy a catalog lookup.
		api.Use(apiServer.RequireTerritoryAccess)
		api.Use(httpapi.ETagMiddleware)
		api.Use(newCompressor().Handler)
```

- [x] **Step 8: Прогнать тесты шлюза**

Run: `cd backend/services/gateway-service && go build ./... && go test ./...`
Expected: PASS.

- [x] **Step 9: Проверить вживую на двух тенантах**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose up -d --build gateway
# Залогиниться под Company Owner тенанта A, создать территорию.
# Залогиниться под Company Owner тенанта B и обратиться к территории A:
#   curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $B" \
#     http://localhost:8080/api/territories/<slug-A>/placements
```

Expected: `404` у чужого тенанта на плейсментах, панорамах, документах и артефактах; `200` у своего; Root видит всё.

- [x] **Step 10: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/
git commit -m "fix(gateway): refuse cross-tenant access to a territory's child resources"
```

---

### Task 2: Дев на одно-origin

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/.env.development`

**Interfaces:**
- Consumes: ничего.
- Produces: дев-сервер на `:3000`, проксирующий `/api` на шлюз; `VITE_API_URL` пустой, как в проде. Задача 4 полагается на это — кука без одного origin не поедет в `<img>` и `<iframe>`.

- [x] **Step 1: Включить прокси по умолчанию**

Modify `frontend/vite.config.ts`:

```ts
  server: {
    // Port 3000, not Vite's 5173: PASSKEY_RP_ORIGINS is pinned to
    // http://localhost:3000, and a mismatched origin fails every WebAuthn
    // ceremony with an opaque client-side SecurityError and no server log.
    port: 3000,
    // /api is proxied by DEFAULT so dev matches production's topology, where
    // nginx serves the SPA and proxies /api to the gateway. Same origin is what
    // lets the session cookie ride on <img>, <iframe> (pdf.js) and EventSource
    // without withCredentials anywhere — and it removes the class of bug this
    // repo already hit once, where dev and prod differed and prod silently
    // built against undefined/api/…
    //
    // VITE_DEV_PROXY overrides the target, e.g. to run the SPA against prod.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY ?? "http://localhost:8080",
        changeOrigin: true,
        secure: true,
      },
    },
  },
```

- [x] **Step 2: Обнулить базовый URL в деве**

Modify `frontend/.env.development`:

```
# Empty on purpose, same as .env.production. Vite proxies /api to the gateway,
# so the SPA is single-origin with the API in dev exactly as it is in prod. A
# non-empty value here would reintroduce cross-origin requests, and with them
# the need for withCredentials in every fetch, EventSource and pdf.js load.
VITE_API_URL=
```

- [x] **Step 3: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d
cd frontend && yarn dev &
sleep 5
curl -s -o /dev/null -w 'через прокси: %{http_code}\n' http://localhost:3000/api/healthz
```

Expected: `200` — запрос ушёл на Vite и был проксирован на шлюз.

Открыть `http://localhost:3000`, войти, открыть территорию: сцена, панорамы и
документы грузятся. В DevTools → Network все запросы к `/api/...` относительные,
без хоста `localhost:8080`.

- [x] **Step 4: Прогнать фронтовые проверки**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS. `vite.config.ts` задаёт `VITE_API_URL` для vitest отдельно, поэтому тесты не зависят от `.env.development`.

- [x] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/vite.config.ts frontend/.env.development
git commit -m "build(frontend): make dev single-origin like production"
```

---

### Task 3: Кука — бэкенд

**Files:**
- Create: `backend/services/gateway-service/internal/transport/authhttp/cookie.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/respond.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/middleware.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/handlers.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/passkey.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/users.go`, `roles.go` (замена `bearer(r)`)
- Modify: `backend/services/gateway-service/internal/config/config.go`
- Modify: `backend/services/gateway-service/cmd/gateway/main.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`, `serve.go`
- Create: `backend/services/gateway-service/internal/transport/authhttp/cookie_test.go`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `config.Config`.
- Produces:
  - `authhttp.CookieOptions{Secure bool; TTL time.Duration}`, передаётся в `authhttp.New`
  - `sessionToken(r *http.Request) string` — кука, иначе Bearer
  - `(*Handlers).setSession(w, token)` / `(*Handlers).clearSession(w)`
  - `Authenticate` кладёт в контекст **использованный** токен

- [ ] **Step 1: Написать падающий тест**

Create `backend/services/gateway-service/internal/transport/authhttp/cookie_test.go`:

```go
// In-package: sessionToken and the cookie helpers are unexported.
package authhttp

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type CookieSuite struct{ suite.Suite }

func TestCookieSuite(t *testing.T) { suite.Run(t, new(CookieSuite)) }

func (s *CookieSuite) handlers(secure bool) *Handlers {
	return &Handlers{cookie: CookieOptions{Secure: secure, TTL: 720 * time.Hour}}
}

func (s *CookieSuite) TestSetSessionCarriesTheHardeningAttributes() {
	rec := httptest.NewRecorder()

	s.handlers(true).setSession(rec, "tok-1")

	c := rec.Result().Cookies()[0]
	assert.Equal(s.T(), c.Name, sessionCookieName)
	assert.Equal(s.T(), c.Value, "tok-1")
	assert.Equal(s.T(), c.HttpOnly, true, "a readable cookie is the localStorage problem again")
	assert.Equal(s.T(), c.Secure, true)
	assert.Equal(s.T(), c.Path, "/")
	// Lax is what stands in for a CSRF token: a cross-site POST does not carry
	// it, and this API changes state only through POST/PUT/PATCH/DELETE.
	assert.Equal(s.T(), c.SameSite, http.SameSiteLaxMode)
	assert.Equal(s.T(), c.MaxAge, int((720 * time.Hour).Seconds()))
}

// Local dev runs over plain http, where a Secure cookie is simply never sent —
// the flag has to follow config, and the default has to be the safe one.
func (s *CookieSuite) TestSecureFollowsConfig() {
	rec := httptest.NewRecorder()

	s.handlers(false).setSession(rec, "tok-1")

	assert.Equal(s.T(), rec.Result().Cookies()[0].Secure, false)
}

func (s *CookieSuite) TestClearSessionExpiresTheCookie() {
	rec := httptest.NewRecorder()

	s.handlers(true).clearSession(rec)

	c := rec.Result().Cookies()[0]
	assert.Equal(s.T(), c.Name, sessionCookieName)
	assert.Equal(s.T(), c.Value, "")
	assert.Assert(s.T(), c.MaxAge < 0, "MaxAge must be negative to delete, got %d", c.MaxAge)
}

func (s *CookieSuite) TestSessionTokenPrefersTheCookie() {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "from-cookie"})
	r.Header.Set("Authorization", "Bearer from-header")

	assert.Equal(s.T(), sessionToken(r), "from-cookie")
}

// The Bearer path stays: curl, tests and non-browser clients have no cookie jar,
// and httpOnly protects against a token at rest, not against the header itself.
func (s *CookieSuite) TestSessionTokenFallsBackToBearer() {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Authorization", "Bearer from-header")

	assert.Equal(s.T(), sessionToken(r), "from-header")
}

func (s *CookieSuite) TestSessionTokenIsEmptyWithNeither() {
	assert.Equal(s.T(), sessionToken(httptest.NewRequest(http.MethodGet, "/", nil)), "")
}
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run TestCookieSuite`
Expected: FAIL — `Handlers.cookie undefined`, `sessionToken undefined`.

- [ ] **Step 3: Реализовать куку**

Create `backend/services/gateway-service/internal/transport/authhttp/cookie.go`:

```go
package authhttp

import (
	"net/http"
	"time"
)

// sessionCookieName is the browser's copy of the session token.
const sessionCookieName = "andrey_session"

// CookieOptions is the deployment-dependent half of the cookie.
type CookieOptions struct {
	// Secure defaults to true in config: a misconfigured production is worse
	// than a broken local dev, and local compose turns it off explicitly
	// because dev runs over plain http.
	Secure bool
	// TTL should not exceed auth's absolute session TTL. Exceeding it is
	// harmless — the session expires first, ValidateToken returns 401 and the
	// client is sent to login — but it costs the user a pointless round trip.
	TTL time.Duration
}

// setSession hands the browser an httpOnly copy of the session token.
//
// httpOnly is the point: a token in localStorage is readable by any script that
// gets injected, and that is the one a persistent XSS exfiltrates. SameSite=Lax
// is what stands in for a CSRF token — a cross-site POST does not carry the
// cookie, and this API changes state only through POST/PUT/PATCH/DELETE, never
// through a GET that Lax would allow.
func (h *Handlers) setSession(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(h.cookie.TTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clearSession deletes the cookie. The attributes must match the ones it was set
// with, or the browser keeps the original alongside the deletion.
func (h *Handlers) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}
```

- [ ] **Step 4: Заменить `bearer` на `sessionToken`**

Modify `backend/services/gateway-service/internal/transport/authhttp/respond.go` — заменить `bearer` целиком:

```go
// sessionToken returns the caller's session token: the cookie first, the
// Authorization header second.
//
// The cookie wins because a browser that has one is the normal case and the
// header would only be there by accident. The header stays supported because
// curl, the tests and any non-browser client have no cookie jar — httpOnly
// protects a token at rest in the browser, which is what gets stolen, not the
// header on a request somebody deliberately made.
func sessionToken(r *http.Request) string {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	const p = "Bearer "
	h := r.Header.Get("Authorization")
	if len(h) > len(p) && h[:len(p)] == p {
		return h[len(p):]
	}
	return ""
}
```

Run: `cd backend/services/gateway-service && grep -rln 'bearer(r)' internal/ | xargs sed -i '' 's/bearer(r)/sessionToken(r)/g'`
Expected: 28 замен в `handlers.go`, `middleware.go`, `passkey.go`, `users.go`, `roles.go`.

Обновить и сообщение в `Authenticate`:

```go
		token := sessionToken(r)
		if token == "" {
			apperr.Write(w, http.StatusUnauthorized, apperr.SlugUnauthenticated, "missing session")
			return
		}
```

- [ ] **Step 5: Ставить и снимать куку в потоках входа**

Modify `handlers.go` — в `login`, после `if token != "" { h.recordLogin(...) }`:

```go
	// A 2FA challenge is not a completed login: the cookie is issued only once a
	// session token exists, which for the 2FA path happens in login2FA.
	if token != "" {
		h.recordLogin(r, "auth.login", token)
		h.setSession(w, token)
	}
```

в `login2FA`, перед `writeJSON`:

```go
	h.recordLogin(r, "auth.login_2fa", token)
	h.setSession(w, token)
```

в `logout`, перед `w.WriteHeader`:

```go
	// Cleared even though the server-side session is already gone: a stale
	// cookie would send one doomed request per page load until it expired.
	h.clearSession(w)
	w.WriteHeader(http.StatusNoContent)
```

Modify `passkey.go` — в `passkeyLoginFinish`, перед `writeJSON`:

```go
	h.recordLogin(r, "auth.login_passkey", token)
	h.setSession(w, token)
```

`passkeyRegisterFinish` куку **не** ставит: регистрация ключа выполняется уже
вошедшим пользователем и новой сессии не выдаёт.

- [ ] **Step 6: Пробросить конфиг**

Modify `internal/config/config.go` — в структуру:

```go
	CookieSecure      bool          `mapstructure:"cookie-secure"`
	SessionCookieTTL  time.Duration `mapstructure:"session-cookie-ttl"`
```

и дефолты:

```go
	v.SetDefault("cookie-secure", true)
	v.SetDefault("session-cookie-ttl", 720*time.Hour)
```

Modify `cmd/gateway/main.go` — флаги:

```go
	flags.Bool("cookie-secure", true, "mark the session cookie Secure; disable only for plain-http local dev")
	flags.Duration("session-cookie-ttl", 720*time.Hour, "session cookie Max-Age; should not exceed auth's absolute session TTL")
```

Modify `authhttp.New` — принять опции и положить в `Handlers`:

```go
func New(client *auth.Client, twofa *twofa.Client, passkey *passkey.Client, audit *audit.Client,
	logger *slog.Logger, cookie CookieOptions) *Handlers {
	return &Handlers{client: client, twofa: twofa, passkey: passkey, audit: audit, logger: logger, cookie: cookie}
}
```

Добавить поле `cookie CookieOptions` в структуру `Handlers`.

Обновить оба вызова `authhttp.New`:

- `internal/bootstrap/serve.go:82` — добавить шестым аргументом
  `authhttp.CookieOptions{Secure: cfg.CookieSecure, TTL: cfg.SessionCookieTTL}`.
- `internal/bootstrap/spec_coverage_test.go` — `authhttp.CookieOptions{}`.

Modify `docker-compose.yml` — в сервис `gateway`, в `environment`:

```yaml
      # Local dev is plain http, where a Secure cookie is never sent. The code
      # defaults to true so a misconfigured production fails safe.
      GATEWAY_COOKIE_SECURE: "false"
```

- [ ] **Step 7: Запустить тесты**

Run: `cd backend/services/gateway-service && go build ./... && go test ./... -v -run "Cookie|Auth"`
Expected: PASS.

- [ ] **Step 8: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d --build gateway && sleep 12
curl -s -i -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"change-me-now"}' | grep -i '^set-cookie'
# Кука должна работать сама, без заголовка:
curl -s -c /tmp/jar -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"change-me-now"}' >/dev/null
curl -s -b /tmp/jar -o /dev/null -w 'по куке: %{http_code}\n' http://localhost:8080/api/auth/me
```

Expected: `Set-Cookie: andrey_session=…; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` (без `Secure`, потому что compose его выключил); `по куке: 200`.

- [ ] **Step 9: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/ docker-compose.yml
git commit -m "feat(gateway): carry the session in an httpOnly cookie"
```

---

### Task 4: Кука — фронтенд

**Files:**
- Create: `frontend/src/auth/infrastructure/session-marker.ts`
- Create: `frontend/src/auth/infrastructure/session-marker.spec.ts`
- Delete: `frontend/src/auth/infrastructure/token-store.ts`, `token-store.spec.ts`
- Modify: `frontend/src/shared/infrastructure/http/client.ts`
- Modify: `frontend/src/auth/infrastructure/auth-login.ts`, `passkey-gateway.ts`
- Modify: `frontend/src/routes/guard.ts`
- Modify: `frontend/src/metrics/application/use-panel-series.ts`
- Modify: `frontend/src/audit/infrastructure/audit-gateway.ts`
- Modify: `frontend/src/upload/infrastructure/upload-gateway.ts`
- Modify: спеки, ссылающиеся на `token-store`: `auth-login.spec.ts`, `passkey-gateway.spec.ts`, `client.spec.ts`, `guard.spec.ts`, `guard-permission.spec.ts`, `console-landing.spec.ts`, `upload-gateway.spec.ts`

**Interfaces:**
- Consumes: кука, которую ставит бэкенд (Task 3); одно-origin (Task 2).
- Produces: `isAuthed(): boolean`, `markAuthed(): void`, `clearAuthed(): void`.

- [ ] **Step 1: Написать падающий тест маркера**

Create `frontend/src/auth/infrastructure/session-marker.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isAuthed, markAuthed, clearAuthed } from "@/auth/infrastructure/session-marker";

beforeEach(() => localStorage.clear());

describe("session marker", () => {
  it("reports no session before anyone logs in", () => {
    expect(isAuthed()).toBe(false);
  });

  it("remembers that a session was established", () => {
    markAuthed();
    expect(isAuthed()).toBe(true);
  });

  it("forgets on logout", () => {
    markAuthed();
    clearAuthed();
    expect(isAuthed()).toBe(false);
  });

  // The marker is not a credential and must never be mistaken for one: the
  // session itself lives in an httpOnly cookie this code cannot read.
  it("stores no secret", () => {
    markAuthed();
    const stored = Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join(";");
    expect(stored).toBe("andrey.authed=1");
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/session-marker.spec.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать маркер и удалить хранилище токена**

Create `frontend/src/auth/infrastructure/session-marker.ts`:

```ts
// The session itself is an httpOnly cookie the browser sends on its own and this
// code cannot read. What is left here is a flag saying a session was once
// established, so the route guard can bounce an anonymous visitor without an
// awaited round trip.
//
// It holds no secret and is not trusted: exactly as before, validity is checked
// by the first meQuery, whose 401 sends the user to /login. The flag can be
// stale — a server-side logout or a revoked session leaves it set — and that is
// the same behaviour the token had.
const KEY = "andrey.authed";

export function isAuthed(): boolean {
  return localStorage.getItem(KEY) === "1";
}

export function markAuthed(): void {
  localStorage.setItem(KEY, "1");
}

export function clearAuthed(): void {
  localStorage.removeItem(KEY);
}
```

Run: `cd frontend && rm src/auth/infrastructure/token-store.ts src/auth/infrastructure/token-store.spec.ts`

- [ ] **Step 4: Убрать заголовок из HTTP-клиента**

Modify `frontend/src/shared/infrastructure/http/client.ts`:

```ts
import { HttpError, type ApiError } from "@/shared/infrastructure/http/http-error";
import { clearAuthed } from "@/auth/infrastructure/session-marker";

const API_BASE = import.meta.env.VITE_API_URL;

async function send<T>(path: string, init: RequestInit, parseJson: boolean): Promise<T> {
  // No Authorization header: the session is an httpOnly cookie, and the SPA is
  // single-origin with the API in both dev and prod, so the browser attaches it
  // to every request here without being asked.
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // 401 = session expired or revoked. Drop the marker and bounce to /login —
    // unless we're already on /login (a bad-credentials login also 401s; let it
    // surface).
    if (res.status === 401 && !location.pathname.startsWith("/login")) {
      clearAuthed();
      location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
```

Остальная часть файла без изменений.

- [ ] **Step 5: Перевести остальные места**

`frontend/src/auth/infrastructure/auth-login.ts` — заменить импорт и три вызова:

```ts
import { markAuthed, clearAuthed } from "@/auth/infrastructure/session-marker";
```
`setToken(r.token)` → `markAuthed()`, `clearToken()` → `clearAuthed()`.

`frontend/src/auth/infrastructure/passkey-gateway.ts` — `setToken(r.token)` → `markAuthed()`.

`frontend/src/routes/guard.ts` — импорт `isAuthed`, и:

```ts
export function requireAuth(location: Target): void {
  if (!isAuthed()) {
    throw redirect({ to: "/login", search: { next: location.href } });
  }
}
```

`frontend/src/metrics/application/use-panel-series.ts`,
`frontend/src/audit/infrastructure/audit-gateway.ts`,
`frontend/src/upload/infrastructure/upload-gateway.ts` — во всех трёх убрать
`getToken()` и заголовок `Authorization` из их собственных `fetch`. Кука едет на
одно-origin запросах сама. Комментарий над каждым:

```ts
// No Authorization header: the session cookie rides on this same-origin fetch.
```

- [ ] **Step 6: Починить спеки**

В `auth-login.spec.ts`, `passkey-gateway.spec.ts`, `client.spec.ts`,
`guard.spec.ts`, `guard-permission.spec.ts`, `console-landing.spec.ts`,
`upload-gateway.spec.ts` заменить импорты и вызовы `token-store` на
`session-marker`: `setToken("tok")` → `markAuthed()`, `getToken()` → `isAuthed()`.

В `client.spec.ts` тест, проверявший наличие заголовка `Authorization`, заменить
на обратный:

```ts
it("sends no Authorization header — the session is a cookie", async () => {
  markAuthed();
  await httpGet("/api/thing");
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
});
```

- [ ] **Step 7: Прогнать фронтовые проверки**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS. `yarn lint` включает `tsc --noEmit`, поэтому пропущенная ссылка на удалённый `token-store` не проскочит.

- [ ] **Step 8: Проверить вживую**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d && cd frontend && yarn dev
```

Войти на `http://localhost:3000`. В DevTools → Application → Cookies должна быть
`andrey_session` с `HttpOnly`. В localStorage — только `andrey.authed=1`, без
токена. Открыть территорию: сцена, панорамы и PDF грузятся. Выйти — кука снята,
переход на `/login`.

- [ ] **Step 9: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/
git commit -m "feat(frontend): rely on the session cookie instead of a stored token"
```

---

### Task 5: Ассеты и SSE за аутентификацией

**Files:**
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go`
- Modify: `frontend/src/shared/infrastructure/asset-url.ts` (комментарий)

**Interfaces:**
- Consumes: куку (Task 3, 4) и одно-origin (Task 2). **Раньше них не выполнять** — иначе просмотр сцен сломается.
- Produces: `401` на `/api/assets/{hash}` и `/api/jobs/{id}/events` без сессии.

- [ ] **Step 1: Закрыть маршруты**

Modify `backend/services/gateway-service/internal/bootstrap/transport.go`:

```go
	// Binary asset proxy + SSE — outside the JSON middleware chain, but no
	// longer outside authentication. Both were reachable anonymously: the hash
	// and the job id are unguessable, so this was a capability URL rather than
	// an open door, but a capability URL has no revocation. Behind the session
	// it inherits one — logout, freeze and a role change all kill it at once.
	//
	// Not territory-scoped, and that is not an omission: a blob hash addresses
	// content and is deduplicated across territories and models, so there is no
	// single territory to check it against. Any authenticated caller who knows a
	// hash can fetch it; after RequireTerritoryAccess, hashes are only handed to
	// callers already inside the tenant.
	r.With(authH.Authenticate).Get("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.With(authH.Authenticate).Head("/api/assets/{hash}", assetProxy.ServeHTTP)
	r.With(authH.Authenticate).Get("/api/jobs/{id}/events", apiServer.WatchJobEvents)
```

- [ ] **Step 2: Обновить комментарий на фронте**

Modify `frontend/src/shared/infrastructure/asset-url.ts`:

```ts
// assetUrl returns the URL for a converted binary artifact. Relative in both dev
// and prod: nginx serves the SPA and proxies /api in production, Vite does the
// same in dev, so the SPA is single-origin with the API. That is what lets the
// httpOnly session cookie ride on three.js loader requests, <img> thumbnails and
// the pdf.js <iframe> — /api/assets/* requires a session and none of those can
// carry an Authorization header.
export function assetUrl(hash: string): string {
  return `${import.meta.env.VITE_API_URL}/api/assets/${encodeURIComponent(hash)}`;
}
```

- [ ] **Step 3: Проверить отказ без сессии**

```bash
cd /Users/vbncursed/programming/rosneft && docker compose up -d --build gateway && sleep 12
curl -s -o /dev/null -w 'ассет без сессии: %{http_code}\n' http://localhost:8080/api/assets/deadbeef
curl -s -o /dev/null -w 'SSE без сессии:   %{http_code}\n' http://localhost:8080/api/jobs/abc/events
curl -s -c /tmp/jar -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"change-me-now"}' >/dev/null
curl -s -b /tmp/jar -o /dev/null -w 'ассет по куке:    %{http_code}\n' http://localhost:8080/api/assets/deadbeef
```

Expected: `401`, `401`, затем `404` — сессия принята, блоба с таким хешем просто нет.

- [ ] **Step 4: Проверить, что просмотр не сломался**

```bash
cd frontend && yarn dev
```

Открыть территорию с моделями, панорамами и документом. Ожидаемо: GLB, превью,
панорама и PDF грузятся; в Network у запросов к `/api/assets/*` статус 200 и
уходит кука. Открыть ту же страницу в приватном окне без входа — `/login`.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/gateway-service/ frontend/src/shared/infrastructure/asset-url.ts
git commit -m "fix(gateway): require a session for binary assets and the job stream"
```

---

### Task 6: Документация

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/README.md`
- Modify: `backend/services/gateway-service/README.md`

**Interfaces:**
- Consumes: всё построенное в задачах 1–5. Кода не меняет.

- [ ] **Step 1: Корневой CLAUDE.md**

Добавить в раздел про эндпоинты шлюза:

```markdown
- **Every route under `/api/territories/{slug}` is gated by `RequireTerritoryAccess`**, a middleware keyed on the route-pattern prefix. A new child resource inherits the gate the moment it is registered — do not add a per-handler scope check instead, that is the shape that failed. It answers 404, never 403: a 403 confirms the territory exists, and to another tenant it must not.
- `GET /api/assets/{hash}` and `GET /api/jobs/{id}/events` **require a session**. Both used to be anonymous; the hash and job id are unguessable, so it was a capability URL rather than an open door, but a capability URL has no revocation.
```

И заменить абзац про `VITE_API_URL`:

```markdown
Client env is `VITE_API_URL` — **empty in both dev and prod**. nginx serves the SPA and proxies `/api` in production; Vite's dev server proxies `/api` by default in development. Single origin is not a convenience: it is what lets the httpOnly session cookie ride on `<img>`, the pdf.js `<iframe>` and three.js loader requests, none of which can carry an Authorization header. `VITE_DEV_PROXY` overrides the dev target. Dev runs on port **3000** — `PASSKEY_RP_ORIGINS` is pinned to it.
```

- [ ] **Step 2: backend/CLAUDE.md**

Добавить после раздела про журнал аудита:

```markdown
## Tenant isolation

Scope is enforced by `httpapi.RequireTerritoryAccess`, mounted in the `/api`
group after `RequirePermissionForRoute` (the permission check costs no network,
so a caller heading for a 403 should not first buy a catalog lookup). It matches
on the route-pattern prefix `/api/territories/{slug}`, so all thirteen child
routes — and any added later — are covered without anyone remembering.

That shape is deliberate. The hole it closed was not a missing check but a check
that had to be threaded through thirteen handlers and reached three of them.

`GetTerritory` and `GetSceneBundle` keep their own scope argument even though the
middleware now covers them. Removing it would make handler correctness depend on
the middleware being mounted, and this codebase already has a route that escapes
the group and wires its gates by hand (`/api/audit.csv`).

## Session cookie

The session travels as `andrey_session`: httpOnly, `SameSite=Lax`, `Path=/`,
`Secure` from `GATEWAY_COOKIE_SECURE` (default **true**; local compose sets it
false because dev is plain http). `sessionToken(r)` reads the cookie first and
the `Authorization` header second — Bearer stays supported for curl, tests and
non-browser clients.

`SameSite=Lax` is what stands in for a CSRF token: a cross-site POST does not
carry the cookie, and this API changes state only through POST/PUT/PATCH/DELETE.
Adding a state-changing GET would quietly break that, so do not.

The login response still returns the token in its body — otherwise a non-browser
client has no way to obtain a Bearer. XSS can therefore read a token at the
moment of login, but not one lying at rest, and the one lying at rest is what
gets stolen.
```

- [ ] **Step 3: frontend/README.md и gateway README**

В `frontend/README.md` — раздел про запуск: порт 3000 теперь дефолт, `/api`
проксируется, `VITE_API_URL` пустой.

В `backend/services/gateway-service/README.md` — таблицу переменных дополнить
`GATEWAY_COOKIE_SECURE` и `GATEWAY_SESSION_COOKIE_TTL`; в описание маршрутов
добавить, что ассеты и SSE требуют сессии, а всё под `/api/territories/{slug}`
проходит гейт территории.

- [ ] **Step 4: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add CLAUDE.md backend/CLAUDE.md frontend/README.md backend/services/gateway-service/README.md
git commit -m "docs(rbac): territory gate, session cookie, single-origin dev"
```

---

## Финальная проверка

- [ ] **Полный прогон**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
cd frontend && yarn lint && yarn test && yarn test:spa && cd ..
docker compose up -d --build && sleep 30
curl -s -o /dev/null -w 'ассет без сессии: %{http_code}\n' http://localhost:8080/api/assets/deadbeef
```

Плюс ручная проверка двух тенантов: у чужого 404 на дочерних ресурсах, у своего
200, Root видит всё; вход ставит httpOnly-куку, в localStorage секрета нет, сцена
с моделями, панорамами и PDF грузится.

- [ ] **Открыть PR**

```bash
git push -u origin dev
gh pr create --base main --head dev \
  --title "fix(rbac): tenant isolation for territory children, session in an httpOnly cookie" \
  --body "См. docs/superpowers/specs/2026-07-29-rbac-tenant-isolation-design.md"
```

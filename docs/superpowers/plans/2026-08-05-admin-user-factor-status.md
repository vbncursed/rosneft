# Статус факторов (2FA и passkey) в `/admin/users` — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Починить колонку «2FA» в `/admin/users` (сейчас всегда «No») и добавить
рядом колонку «Passkey» — включён / не включён, без количества.

**Architecture:** `auth-service` не владеет состоянием факторов и никогда не
заполняет `totp_enabled`; наложение реального значения — работа шлюза, и сегодня
оно есть ровно в `GET /api/auth/me`. Добавляем во внутреннюю поверхность
twofa-service и passkey-service по одному **пакетному** RPC, а в шлюзе делаем
наложение единственным способом собрать пользовательский DTO — голая
`userToJSON` перестаёт существовать. Недоступность сервиса фактора даёт `null`
(«неизвестно», рисуется «—»), а не `false` и не проваленный запрос.

**Tech Stack:** Go 1.25 (buf/protoc, minimock, testify+gotest.tools, pgx),
gateway на go-chi, фронтенд — Vite + React 19 + TanStack Router/Query, vitest.

**Спека:** `docs/superpowers/specs/2026-08-05-admin-user-factor-status-design.md`

## Global Constraints

- Перед каждым коммитом, затрагивающим Go: `make -C backend check` (gofmt,
  tidy-drift, `GOWORK=off go vet`, golangci-lint, `go test -race -shuffle=on`,
  govulncheck; ~80 с).
- Фронтенд: жёсткий потолок **200 строк на файл** (ESLint `max-lines`,
  skipBlankLines + skipComments). Сгенерированные файлы освобождены явно.
- Фронтенд: **никогда** не писать `"use client"` — это Vite SPA, а не Next.js.
- Два раннера тестов на фронтенде: чистая доменная логика → `yarn test`
  (`node --test`, `*.test.ts`); jsdom/React → `yarn test:spa` (vitest,
  `*.spec.ts[x]`). Globs не пересекаются.
- Существующие RPC `TwoFAService.IsEnabled` и `PasskeyService.ListCredentials`
  **не трогаются**: на первом висит путь логина в auth-service и step-up в
  `authhttp/passkey.go:93`, на втором — страница `/account`.
- Моки minimock генерируются, а не правятся руками: в обоих сервисах есть
  `//go:generate minimock -i ... -o ./mocks -s _mock.go`.
- Миграции БД не нужны: `twofa_credentials.user_id` — PRIMARY KEY,
  `passkey_credentials` имеет `passkey_credentials_user_idx (user_id)`.
- Язык артефактов репозитория — английский: код, комментарии в коде и сообщения
  коммитов. Русский — только в `docs/superpowers/`.

---

### Task 1: Пакетные RPC в контрактах обоих сервисов

**Files:**
- Modify: `backend/proto/rosneft/twofa/v1/twofa.proto`
- Modify: `backend/proto/rosneft/passkey/v1/passkey.proto`
- Generated: `backend/proto/gen/go/rosneft/twofa/v1/*`, `backend/proto/gen/go/rosneft/passkey/v1/*`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `twofav1.EnabledForRequest{UserIds []string}` → `twofav1.EnabledForResponse{EnabledUserIds []string}`, метод `EnabledFor`
  - `passkeyv1.CredentialedUsersRequest{UserIds []string}` → `passkeyv1.CredentialedUsersResponse{UserIdsWithCredentials []string}`, метод `CredentialedUsers`
  - Геттеры: `req.GetUserIds()`, `resp.GetEnabledUserIds()`, `resp.GetUserIdsWithCredentials()`

- [ ] **Шаг 1: Добавить RPC в `twofa.proto`**

В блок `service TwoFAService`, в секцию «Internal surface», сразу после
`rpc IsEnabled(...)`:

```proto
  // EnabledFor is the batch form of IsEnabled: the admin user list needs an
  // answer per user and must not cost a round trip per user. Ids absent from
  // the response are off — unenrolled and enrolled-but-disabled are the same
  // answer to the caller, so no per-id tri-state is needed here.
  rpc EnabledFor(EnabledForRequest) returns (EnabledForResponse);
```

В конец файла, после `message VerifyResponse`:

```proto
message EnabledForRequest { repeated string user_ids = 1; }
message EnabledForResponse { repeated string enabled_user_ids = 1; }
```

- [ ] **Шаг 2: Добавить RPC в `passkey.proto`**

В блок `service PasskeyService`, в секцию «Internal surface», после
`rpc FinishLogin(...)`:

```proto
  // CredentialedUsers answers "which of these users have at least one passkey".
  // Internal surface (no token) because it is keyed on ids, not on the caller:
  // ListCredentials resolves the caller via auth.GetMe and so cannot answer for
  // anybody else. Returns ids only — never names, counts, or key material.
  rpc CredentialedUsers(CredentialedUsersRequest) returns (CredentialedUsersResponse);
```

В конец файла, после `message Credential`:

```proto
message CredentialedUsersRequest { repeated string user_ids = 1; }
message CredentialedUsersResponse { repeated string user_ids_with_credentials = 1; }
```

- [ ] **Шаг 3: Сгенерировать Go-код**

```bash
make -C backend proto-gen
```

- [ ] **Шаг 4: Проверить, что типы появились и всё собирается**

```bash
cd backend/proto && grep -c "EnabledForRequest\|CredentialedUsersRequest" gen/go/rosneft/twofa/v1/twofa.pb.go gen/go/rosneft/passkey/v1/passkey.pb.go
cd backend && GOWORK=off go vet ./... 2>&1 | head
```

Ожидается: ненулевые счётчики в обоих файлах, `go vet` без ошибок в модуле
`proto`. Сервисы ещё не реализуют новые методы — это нормально: встроенные
`UnimplementedTwoFAServiceServer` / `UnimplementedPasskeyServiceServer` дают
заглушки, и компиляция не ломается.

- [ ] **Шаг 5: Коммит**

```bash
git add backend/proto
git commit -m "proto: batch factor lookups for twofa and passkey"
```

---

### Task 2: `EnabledFor` в twofa-service

**Files:**
- Modify: `backend/services/twofa-service/internal/service/twofa/twofa.go` (интерфейс `Store`)
- Modify: `backend/services/twofa-service/internal/storage/credentials/store.go`
- Modify: `backend/services/twofa-service/internal/service/twofa/query.go`
- Modify: `backend/services/twofa-service/internal/transport/grpcapi/server.go` (интерфейс `Service`)
- Modify: `backend/services/twofa-service/internal/transport/grpcapi/query.go`
- Regenerate: `backend/services/twofa-service/internal/service/twofa/mocks/store_mock.go`
- Test: `backend/services/twofa-service/internal/service/twofa/twofa_test.go`

**Interfaces:**
- Consumes: `twofav1.EnabledForRequest/Response` из Task 1.
- Produces: `(*twofa.Service).EnabledFor(ctx context.Context, userIDs []string) ([]string, error)` — возвращает подмножество `userIDs`, у которых 2FA включена; порядок не гарантирован; пустой вход → `nil, nil` без похода в стор.

- [ ] **Шаг 1: Написать падающие тесты**

В `twofa_test.go`, в конец файла (сьют `TwoFASuite` уже поднимает
`s.st *mocks.StoreMock`, `s.svc`, `s.ctx` в `SetupTest`):

```go
// The batch form the admin user list depends on. Ids the store does not report
// are off; nothing is invented for them here.
func (s *TwoFASuite) TestEnabledForReturnsOnlyTheEnabledIds() {
	s.st.EnabledForMock.Expect(s.ctx, []string{"a", "b"}).Return([]string{"a"}, nil)

	got, err := s.svc.EnabledFor(s.ctx, []string{"a", "b"})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []string{"a"})
}

// An empty batch must not reach the database. The gateway calls this on every
// admin list render, including one with no rows to show.
func (s *TwoFASuite) TestEnabledForSkipsTheStoreOnAnEmptyBatch() {
	got, err := s.svc.EnabledFor(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got == nil)
}

// A store failure is not "nobody has 2FA on" — it is no answer at all, and the
// caller has to be able to tell the difference.
func (s *TwoFASuite) TestEnabledForPropagatesTheStoreError() {
	s.st.EnabledForMock.Expect(s.ctx, []string{"a"}).Return(nil, errors.New("db down"))

	_, err := s.svc.EnabledFor(s.ctx, []string{"a"})

	assert.ErrorContains(s.T(), err, "db down")
}
```

Добавить `"errors"` в импорты файла, если его там ещё нет.

- [ ] **Шаг 2: Запустить и убедиться, что не компилируется**

```bash
cd backend/services/twofa-service && go test ./internal/service/twofa/ -run TestTwoFASuite 2>&1 | head -20
```

Ожидается: ошибка компиляции — `s.st.EnabledForMock undefined` и
`s.svc.EnabledFor undefined`.

- [ ] **Шаг 3: Расширить интерфейс `Store`**

В `internal/service/twofa/twofa.go`:

```go
type Store interface {
	Get(ctx context.Context, userID string) (domain.Credential, error)
	Set(ctx context.Context, userID string, enabled bool, secret []byte) error
	// EnabledFor returns the subset of userIDs with 2FA switched on.
	EnabledFor(ctx context.Context, userIDs []string) ([]string, error)
}
```

- [ ] **Шаг 4: Реализовать запрос в хранилище**

В `internal/storage/credentials/store.go`, после `Set`:

```go
// EnabledFor returns the subset of userIDs whose 2FA is switched on. An id with
// no row and an id with a row that has enabled = false are both simply absent:
// to a caller asking "is 2FA on", unenrolled and disabled are one answer.
func (s *Store) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	const q = `SELECT user_id FROM twofa_credentials WHERE user_id = ANY($1) AND enabled`
	rows, err := s.pool.Query(ctx, q, userIDs)
	if err != nil {
		return nil, fmt.Errorf("credentials.EnabledFor: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("credentials.EnabledFor: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
```

- [ ] **Шаг 5: Реализовать метод сервиса**

В `internal/service/twofa/query.go`, сразу после `IsEnabled`:

```go
// EnabledFor is the batch form of IsEnabled. The admin user list asks for N
// users at once; N round trips for N rows is the shape this exists to avoid.
func (s *Service) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	return s.store.EnabledFor(ctx, userIDs)
}
```

- [ ] **Шаг 6: Перегенерировать моки**

```bash
cd backend/services/twofa-service && go generate ./internal/service/twofa/
```

- [ ] **Шаг 7: Прогнать тесты сервиса**

```bash
cd backend/services/twofa-service && go test -race ./internal/service/twofa/ -run TestTwoFASuite -v 2>&1 | tail -30
```

Ожидается: PASS, включая три новых теста.

- [ ] **Шаг 8: Пробросить метод через gRPC**

В `internal/transport/grpcapi/server.go` добавить в интерфейс `Service` строку
после `IsEnabled`:

```go
	EnabledFor(ctx context.Context, userIDs []string) ([]string, error)
```

В `internal/transport/grpcapi/query.go`, после `IsEnabled`:

```go
// EnabledFor answers the batch question for the gateway's admin user list.
func (s *Server) EnabledFor(ctx context.Context, req *twofav1.EnabledForRequest) (*twofav1.EnabledForResponse, error) {
	ids, err := s.svc.EnabledFor(ctx, req.GetUserIds())
	if err != nil {
		return nil, mapErr(err)
	}
	return &twofav1.EnabledForResponse{EnabledUserIds: ids}, nil
}
```

- [ ] **Шаг 9: Полный гейт и коммит**

```bash
make -C backend check
git add backend/services/twofa-service
git commit -m "feat(twofa): batch EnabledFor lookup for the admin user list"
```

---

### Task 3: `CredentialedUsers` в passkey-service

**Files:**
- Modify: `backend/services/passkey-service/internal/service/passkey/passkey.go` (интерфейс `Store`)
- Modify: `backend/services/passkey-service/internal/storage/credentials/store.go`
- Modify: `backend/services/passkey-service/internal/service/passkey/manage.go`
- Modify: `backend/services/passkey-service/internal/transport/grpcapi/server.go` (интерфейс `Service`)
- Create: `backend/services/passkey-service/internal/transport/grpcapi/query.go`
- Regenerate: `backend/services/passkey-service/internal/service/passkey/mocks/store_mock.go`
- Create: `backend/services/passkey-service/internal/service/passkey/manage_test.go`

**Interfaces:**
- Consumes: `passkeyv1.CredentialedUsersRequest/Response` из Task 1.
- Produces: `(*passkey.Service).CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error)` — подмножество `userIDs`, у которых есть хотя бы один passkey; каждый id встречается не более одного раза; пустой вход → `nil, nil`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `internal/service/passkey/manage_test.go`:

```go
package passkey_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey"
	"github.com/vbncursed/rosneft/backend/services/passkey-service/internal/service/passkey/mocks"
)

type ManageSuite struct {
	suite.Suite
	st  *mocks.StoreMock
	svc *passkey.Service
	ctx context.Context
}

func TestManageSuite(t *testing.T) { suite.Run(t, new(ManageSuite)) }

func (s *ManageSuite) SetupTest() {
	mc := minimock.NewController(s.T())
	s.st = mocks.NewStoreMock(mc)
	s.svc = passkey.New(s.st, mocks.NewCeremoniesMock(mc), mocks.NewEngineMock(mc))
	s.ctx = s.T().Context()
}

// The admin user list needs "has at least one passkey", not the credentials
// themselves — a user with two keys is one id in the answer, not two.
func (s *ManageSuite) TestCredentialedUsersReturnsOnlyUsersThatHaveOne() {
	s.st.UsersWithCredentialsMock.Expect(s.ctx, []string{"a", "b"}).Return([]string{"a"}, nil)

	got, err := s.svc.CredentialedUsers(s.ctx, []string{"a", "b"})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, []string{"a"})
}

// An empty batch must not reach the database.
func (s *ManageSuite) TestCredentialedUsersSkipsTheStoreOnAnEmptyBatch() {
	got, err := s.svc.CredentialedUsers(s.ctx, nil)

	assert.NilError(s.T(), err)
	assert.Assert(s.T(), got == nil)
}

// A store failure is not "nobody has a passkey".
func (s *ManageSuite) TestCredentialedUsersPropagatesTheStoreError() {
	s.st.UsersWithCredentialsMock.Expect(s.ctx, []string{"a"}).Return(nil, errors.New("db down"))

	_, err := s.svc.CredentialedUsers(s.ctx, []string{"a"})

	assert.ErrorContains(s.T(), err, "db down")
}
```

- [ ] **Шаг 2: Запустить и убедиться, что не компилируется**

```bash
cd backend/services/passkey-service && go test ./internal/service/passkey/ -run TestManageSuite 2>&1 | head -20
```

Ожидается: ошибка компиляции — `UsersWithCredentialsMock undefined` и
`svc.CredentialedUsers undefined`.

- [ ] **Шаг 3: Расширить интерфейс `Store`**

В `internal/service/passkey/passkey.go`, в интерфейс `Store`:

```go
	// UsersWithCredentials returns the subset of userIDs that own at least one
	// credential — one id per user, however many keys they have.
	UsersWithCredentials(ctx context.Context, userIDs []string) ([]string, error)
```

- [ ] **Шаг 4: Реализовать запрос в хранилище**

В `internal/storage/credentials/store.go`, после `ListByUser`:

```go
// UsersWithCredentials returns the subset of userIDs owning at least one
// credential. DISTINCT, not a count: the caller asks a yes/no question, and a
// user with four keys must not appear four times in the answer.
func (s *Store) UsersWithCredentials(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	const q = `SELECT DISTINCT user_id FROM passkey_credentials WHERE user_id = ANY($1)`
	rows, err := s.pool.Query(ctx, q, userIDs)
	if err != nil {
		return nil, fmt.Errorf("credentials.UsersWithCredentials: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("credentials.UsersWithCredentials: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
```

- [ ] **Шаг 5: Реализовать метод сервиса**

В `internal/service/passkey/manage.go`, после `List`:

```go
// CredentialedUsers answers "which of these users have a passkey at all". It is
// the only way to ask about somebody else: List resolves the caller's own id
// and cannot serve the admin console.
func (s *Service) CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	return s.store.UsersWithCredentials(ctx, userIDs)
}
```

- [ ] **Шаг 6: Перегенерировать моки**

```bash
cd backend/services/passkey-service && go generate ./internal/service/passkey/
```

- [ ] **Шаг 7: Прогнать тесты сервиса**

```bash
cd backend/services/passkey-service && go test -race ./internal/service/passkey/ -v 2>&1 | tail -30
```

Ожидается: PASS, включая `TestManageSuite` и уже существующий
`login_test.go`.

- [ ] **Шаг 8: Пробросить метод через gRPC**

В `internal/transport/grpcapi/server.go` добавить в интерфейс `Service` после
`Delete`:

```go
	CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error)
```

Создать `internal/transport/grpcapi/query.go`:

```go
package grpcapi

import (
	"context"

	passkeyv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/passkey/v1"
)

// CredentialedUsers is internal surface: keyed on ids, not on a session token,
// because the question is about other users. It leaks nothing beyond the fact
// that a factor is configured — no names, no counts, no key material.
func (s *Server) CredentialedUsers(ctx context.Context, req *passkeyv1.CredentialedUsersRequest) (*passkeyv1.CredentialedUsersResponse, error) {
	ids, err := s.svc.CredentialedUsers(ctx, req.GetUserIds())
	if err != nil {
		return nil, mapErr(err)
	}
	return &passkeyv1.CredentialedUsersResponse{UserIdsWithCredentials: ids}, nil
}
```

- [ ] **Шаг 9: Полный гейт и коммит**

```bash
make -C backend check
git add backend/services/passkey-service
git commit -m "feat(passkey): batch CredentialedUsers lookup for the admin user list"
```

---

### Task 4: Тристейт в DTO шлюза — чистая часть

**Files:**
- Modify: `backend/services/gateway-service/internal/transport/authhttp/dto.go`
- Create: `backend/services/gateway-service/internal/transport/authhttp/dto_test.go`

**Interfaces:**
- Consumes: ничего (только `authv1.User`, уже есть).
- Produces:
  - `type factorSet map[string]struct{}` с методом `(factorSet).state(userID string) *bool` — `nil` при `nil`-множестве («неизвестно»), иначе указатель на `true`/`false`
  - `userToJSON(u *authv1.User, totp, passkeys factorSet) userJSON` — **сигнатура меняется**, старая двухаргументная форма исчезает
  - `usersToJSON(in []*authv1.User, totp, passkeys factorSet) []userJSON` — **сигнатура меняется**
  - поля `userJSON.TOTPEnabled *bool` и `userJSON.PasskeyEnabled *bool`

- [ ] **Шаг 1: Написать падающие тесты**

Создать `dto_test.go`:

```go
package authhttp

import (
	"encoding/json"
	"testing"

	"gotest.tools/v3/assert"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// The bug this whole change exists to remove: auth-service never fills
// totp_enabled, so anything reading the proto field reports "off" for everyone.
// The value has to come from the overlaid set and nowhere else.
func TestUserToJSONTakesTheFactorsFromTheSetsNotTheProto(t *testing.T) {
	u := &authv1.User{Id: "u1", TotpEnabled: false}

	out := userToJSON(u, factorSet{"u1": {}}, factorSet{})

	assert.Assert(t, out.TOTPEnabled != nil)
	assert.Equal(t, *out.TOTPEnabled, true)
	assert.Assert(t, out.PasskeyEnabled != nil)
	assert.Equal(t, *out.PasskeyEnabled, false)
}

// A nil set is not an empty one. Empty means "asked, nobody has it"; nil means
// the owning service never answered, and answering "No" for it is the bug.
func TestANilSetMeansUnknownNotOff(t *testing.T) {
	u := &authv1.User{Id: "u1"}

	out := userToJSON(u, nil, nil)

	assert.Assert(t, out.TOTPEnabled == nil)
	assert.Assert(t, out.PasskeyEnabled == nil)
}

// Unknown must reach the client as an absent key, not as JSON null and not as
// false — the SPA renders "—" off the absence.
func TestUnknownFactorsAreOmittedFromTheJSON(t *testing.T) {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, nil, nil))

	assert.NilError(t, err)
	assert.Assert(t, !jsonHasKey(t, body, "totpEnabled"))
	assert.Assert(t, !jsonHasKey(t, body, "passkeyEnabled"))
}

// A known-false factor must still be sent: absent and false mean different
// things, and omitempty on a *bool omits only nil.
func TestAKnownFalseFactorIsStillSent(t *testing.T) {
	body, err := json.Marshal(userToJSON(&authv1.User{Id: "u1"}, factorSet{}, factorSet{}))

	assert.NilError(t, err)
	assert.Assert(t, jsonHasKey(t, body, "totpEnabled"))
	assert.Assert(t, jsonHasKey(t, body, "passkeyEnabled"))
}

// Each user is resolved against its own id, not the first one in the batch.
func TestUsersToJSONResolvesEachUserSeparately(t *testing.T) {
	in := []*authv1.User{{Id: "a"}, {Id: "b"}}

	out := usersToJSON(in, factorSet{"b": {}}, factorSet{"a": {}})

	assert.Equal(t, len(out), 2)
	assert.Equal(t, *out[0].TOTPEnabled, false)
	assert.Equal(t, *out[0].PasskeyEnabled, true)
	assert.Equal(t, *out[1].TOTPEnabled, true)
	assert.Equal(t, *out[1].PasskeyEnabled, false)
}

func jsonHasKey(t *testing.T, body []byte, key string) bool {
	t.Helper()
	var m map[string]json.RawMessage
	assert.NilError(t, json.Unmarshal(body, &m))
	_, ok := m[key]
	return ok
}
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

```bash
cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run 'TestUser|TestANil|TestUnknown|TestAKnown' 2>&1 | head -20
```

Ожидается: ошибка компиляции — `undefined: factorSet` и неверное число
аргументов у `userToJSON`.

- [ ] **Шаг 3: Ввести `factorSet` и переключить поля на указатели**

В `dto.go`, сразу после блока `import`:

```go
// factorSet holds the user ids for which one authentication factor is on.
//
// A nil set is NOT an empty one. Empty means "we asked and nobody has it"; nil
// means the owning service (twofa / passkey) never answered, so the state is
// unknown. Collapsing that to "off" is exactly the failure this type exists to
// prevent: the admin console printing an unverified "No".
type factorSet map[string]struct{}

// state answers tri-state: nil for unknown, otherwise a pointer to on/off.
func (f factorSet) state(userID string) *bool {
	if f == nil {
		return nil
	}
	_, ok := f[userID]
	return &ok
}
```

В структуре `userJSON` заменить строку `TOTPEnabled bool ...` на:

```go
	// TOTPEnabled and PasskeyEnabled are tri-state on the wire: an absent key
	// means the owning service could not answer. They never come from the proto
	// user — auth-service does not own either factor and leaves both zero — so
	// they are filled from the overlaid factorSets and from nowhere else.
	TOTPEnabled    *bool `json:"totpEnabled,omitempty"`
	PasskeyEnabled *bool `json:"passkeyEnabled,omitempty"`
```

Поле остаётся на том же месте в структуре (после `Status`), чтобы порядок
ключей в JSON не менялся.

- [ ] **Шаг 4: Переписать конвертеры**

В `dto.go` заменить `userToJSON` и `usersToJSON` целиком:

```go
// userToJSON requires both factor sets by construction. There is deliberately
// no overload that omits them: eight handlers used to call a bare converter and
// every one of them shipped a hardcoded "2FA: off" for months. A route that
// cannot obtain the sets has to pass nil and say "unknown" out loud.
func userToJSON(u *authv1.User, totp, passkeys factorSet) userJSON {
	return userJSON{
		ID:                  u.GetId(),
		Email:               u.GetEmail(),
		Username:            u.GetUsername(),
		Status:              u.GetStatus(),
		TOTPEnabled:         totp.state(u.GetId()),
		PasskeyEnabled:      passkeys.state(u.GetId()),
		RoleSlugs:           u.GetRoleSlugs(),
		RoleTitles:          u.GetRoleTitles(),
		Permissions:         u.GetPermissions(),
		IsOwner:             u.GetIsOwner(),
		OnboardingToursSeen: u.GetOnboardingToursSeen(),
	}
}

func usersToJSON(in []*authv1.User, totp, passkeys factorSet) []userJSON {
	out := make([]userJSON, 0, len(in))
	for _, u := range in {
		out = append(out, userToJSON(u, totp, passkeys))
	}
	return out
}
```

- [ ] **Шаг 5: Прогнать новые тесты**

Пакет пока не компилируется целиком — `users.go` и `account.go` зовут старые
сигнатуры. Это ожидаемо и чинится в Task 5. Проверить сейчас только тем, что
ошибки компиляции остались **лишь** в тех двух файлах:

```bash
cd backend/services/gateway-service && go build ./internal/transport/authhttp/ 2>&1 | head -20
```

Ожидается: ошибки вида «not enough arguments in call to userToJSON» с указанием
на `users.go` и `account.go`, и никаких других.

- [ ] **Шаг 6: Коммит вместе с Task 5**

Отдельного коммита здесь нет: пакет в этой точке не собирается. Переходи к
Task 5 и коммить обе задачи одним коммитом (шаг 8 Task 5).

---

### Task 5: Наложение факторов на всех админских маршрутах шлюза

**Files:**
- Modify: `backend/services/gateway-service/internal/clients/twofa/twofa.go`
- Modify: `backend/services/gateway-service/internal/clients/passkey/passkey.go`
- Create: `backend/services/gateway-service/internal/transport/authhttp/factors.go`
- Modify: `backend/services/gateway-service/internal/transport/authhttp/users.go` (все 8 обработчиков)
- Modify: `backend/services/gateway-service/internal/transport/authhttp/account.go:12-26` (`me`)
- Test: `backend/services/gateway-service/internal/transport/authhttp/factors_test.go`

**Interfaces:**
- Consumes: `factorSet`, `userToJSON`, `usersToJSON` из Task 4; RPC из Task 1.
- Produces:
  - `(*twofa.Client).EnabledFor(ctx context.Context, userIDs []string) ([]string, error)`
  - `(*passkey.Client).CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error)`
  - `(*Handlers).factors(ctx context.Context, ids []string, wantPasskeys bool) (totp, passkeys factorSet)`
  - `(*Handlers).userJSON(ctx context.Context, u *authv1.User) userJSON`
  - `(*Handlers).usersJSON(ctx context.Context, in []*authv1.User) []userJSON`

- [ ] **Шаг 1: Написать падающий тест на деградацию**

Создать `factors_test.go`:

```go
package authhttp

import (
	"io"
	"log/slog"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
)

// deadFactorHandlers points both factor clients at a port nothing listens on.
// Dial is lazy (grpc.NewClient), so construction succeeds and the RPC fails at
// call time — the exact failure this needs, with no interface added for a test.
func deadFactorHandlers(t *testing.T) *Handlers {
	t.Helper()
	tf, err := twofa.Dial("127.0.0.1:1")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = tf.Close() })
	pk, err := passkey.Dial("127.0.0.1:1")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = pk.Close() })
	return &Handlers{twofa: tf, passkey: pk, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

// The whole point of the tri-state. A downed twofa-service must not turn into
// "this user has no 2FA" — that is indistinguishable from the bug being fixed.
func TestFactorsAreUnknownWhenTheServicesAreUnreachable(t *testing.T) {
	h := deadFactorHandlers(t)

	totp, passkeys := h.factors(t.Context(), []string{"u1"}, true)

	assert.Assert(t, totp == nil, "an unreachable twofa-service must yield unknown, not off")
	assert.Assert(t, passkeys == nil, "an unreachable passkey-service must yield unknown, not off")
	assert.Assert(t, totp.state("u1") == nil)
	assert.Assert(t, passkeys.state("u1") == nil)
}

// /api/auth/me runs on every page load and nothing there consumes the passkey
// flag, so it must not pay for the round trip. Pinned because the saving is
// invisible and a later refactor would happily "simplify" it away.
func TestFactorsSkipThePasskeyLookupWhenNotWanted(t *testing.T) {
	h := deadFactorHandlers(t)

	_, passkeys := h.factors(t.Context(), []string{"u1"}, false)

	assert.Assert(t, passkeys == nil)
}

// No ids means no rows to render — and no reason to call either service. The
// sets are empty, not unknown: "nobody" is a real answer here.
func TestFactorsSkipBothServicesOnAnEmptyBatch(t *testing.T) {
	h := deadFactorHandlers(t)

	totp, passkeys := h.factors(t.Context(), nil, true)

	assert.Assert(t, totp != nil, "an empty batch is answered, not unknown")
	assert.Assert(t, passkeys != nil)
}
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

```bash
cd backend/services/gateway-service && go test ./internal/transport/authhttp/ -run TestFactors 2>&1 | head -20
```

Ожидается: ошибка компиляции — `h.factors undefined`.

- [ ] **Шаг 3: Добавить методы в клиенты шлюза**

В `internal/clients/twofa/twofa.go`, после `IsEnabled`:

```go
// EnabledFor is the batch form of IsEnabled — one round trip for the whole
// admin user list instead of one per row.
func (c *Client) EnabledFor(ctx context.Context, userIDs []string) ([]string, error) {
	resp, err := c.cc.EnabledFor(ctx, &twofav1.EnabledForRequest{UserIds: userIDs})
	if err != nil {
		return nil, err
	}
	return resp.GetEnabledUserIds(), nil
}
```

В `internal/clients/passkey/passkey.go`, после `ListCredentials`:

```go
// CredentialedUsers reports which of userIDs own at least one passkey. Unlike
// ListCredentials it is keyed on ids rather than on the caller's token, which
// is what lets the admin console ask about somebody else.
func (c *Client) CredentialedUsers(ctx context.Context, userIDs []string) ([]string, error) {
	resp, err := c.cc.CredentialedUsers(ctx, &passkeyv1.CredentialedUsersRequest{UserIds: userIDs})
	if err != nil {
		return nil, err
	}
	return resp.GetUserIdsWithCredentials(), nil
}
```

- [ ] **Шаг 4: Написать `factors.go`**

Создать `internal/transport/authhttp/factors.go`:

```go
package authhttp

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

// factors resolves both authentication factors for ids.
//
// A service that fails to answer yields a nil set — unknown, not off — and the
// request still succeeds. That split is deliberate: /api/auth/me is on the SPA
// boot path and may not fail, and an admin console that 503s because a factor
// service blinked is worse than one that shows "—" in two columns. What it must
// never do is print a status it did not verify.
//
// wantPasskeys is false for /api/auth/me: it runs on every page load and has no
// consumer for the passkey flag, so the round trip would buy nothing.
//
// The two lookups run in sequence, not in parallel. They are local gRPC calls
// on the same host; an errgroup here would add machinery for microseconds.
func (h *Handlers) factors(ctx context.Context, ids []string, wantPasskeys bool) (totp, passkeys factorSet) {
	if len(ids) == 0 {
		// No rows to render — "nobody" is a real answer, not an unknown one.
		return factorSet{}, factorSet{}
	}
	if on, err := h.twofa.EnabledFor(ctx, ids); err == nil {
		totp = newFactorSet(on)
	} else {
		// Warn, not Error: the request survives, but a silent "—" in the console
		// has to be diagnosable from the logs.
		h.logger.Warn("2fa status unavailable", "err", err, "users", len(ids))
	}
	if !wantPasskeys {
		return totp, nil
	}
	if on, err := h.passkey.CredentialedUsers(ctx, ids); err == nil {
		passkeys = newFactorSet(on)
	} else {
		h.logger.Warn("passkey status unavailable", "err", err, "users", len(ids))
	}
	return totp, passkeys
}

func newFactorSet(ids []string) factorSet {
	f := make(factorSet, len(ids))
	for _, id := range ids {
		f[id] = struct{}{}
	}
	return f
}

// userJSON and usersJSON are how every admin handler emits a user. They exist
// so that emitting one without resolving its factors is not something a handler
// can do by accident — the bare converters in dto.go demand the sets.
func (h *Handlers) userJSON(ctx context.Context, u *authv1.User) userJSON {
	totp, passkeys := h.factors(ctx, []string{u.GetId()}, true)
	return userToJSON(u, totp, passkeys)
}

func (h *Handlers) usersJSON(ctx context.Context, in []*authv1.User) []userJSON {
	ids := make([]string, 0, len(in))
	for _, u := range in {
		ids = append(ids, u.GetId())
	}
	totp, passkeys := h.factors(ctx, ids, true)
	return usersToJSON(in, totp, passkeys)
}
```

- [ ] **Шаг 5: Перевести все восемь обработчиков `users.go`**

В `users.go` заменить каждый вызов конвертера:

| обработчик | было | стало |
| --- | --- | --- |
| `listUsers` | `writeJSON(w, http.StatusOK, usersToJSON(list))` | `writeJSON(w, http.StatusOK, h.usersJSON(r.Context(), list))` |
| `createUser` | `writeJSON(w, http.StatusCreated, userToJSON(u))` | `writeJSON(w, http.StatusCreated, h.userJSON(r.Context(), u))` |
| `getUser` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |
| `updateUser` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |
| `freezeUser` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |
| `unfreezeUser` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |
| `restoreUser` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |
| `setUserOwner` | `writeJSON(w, http.StatusOK, userToJSON(u))` | `writeJSON(w, http.StatusOK, h.userJSON(r.Context(), u))` |

`softDeleteUser` не отдаёт пользователя (204) и не меняется.

- [ ] **Шаг 6: Переписать `me` в `account.go`**

Заменить тело до `writeJSON` (строки 13–25):

```go
func (h *Handlers) me(w http.ResponseWriter, r *http.Request) {
	u, err := h.client.GetMe(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, err)
		return
	}
	// auth-service does not own 2FA state, so the proto flag is always zero;
	// overlay the real one. Passkey state is deliberately not fetched here —
	// see factors(): this route runs on every page load and nothing reads it.
	totp, _ := h.factors(r.Context(), []string{u.GetId()}, false)
	out := userToJSON(u, totp, nil)
	// The SPA's only way back to a token after a page reload.
	out.CSRFToken = h.CSRFToken(sessionToken(r))
	writeJSON(w, http.StatusOK, out)
}
```

- [ ] **Шаг 7: Прогнать все тесты пакета**

```bash
cd backend/services/gateway-service && go test -race ./internal/transport/authhttp/ -v 2>&1 | tail -40
```

Ожидается: PASS во всём пакете — новые `TestFactors*`, новые `dto_test.go` из
Task 4 и существующие `handlers_test.go` / `csrf_test.go` /
`route_permissions_test.go`.

- [ ] **Шаг 8: Полный гейт и коммит (Task 4 + Task 5)**

```bash
make -C backend check
git add backend/services/gateway-service
git commit -m "fix(gateway): overlay real 2FA and passkey status on every admin user route

auth-service never fills totp_enabled — it does not own the factor — so the
eight handlers in users.go all shipped a hardcoded \"2FA: off\". The bare
converters now demand both factor sets, which makes forgetting the overlay a
compile error rather than a silent wrong answer. An unreachable factor service
yields absent, not false: the console renders \"unknown\" instead of an
unverified \"No\"."
```

---

### Task 6: Контракт OpenAPI и регенерация

**Files:**
- Modify: `backend/services/gateway-service/api/openapi.yaml:439-459` (схема `AuthUser`)
- Generated: `backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go`
- Generated: `frontend/src/shared/infrastructure/api/dto.ts`

**Interfaces:**
- Consumes: поведение из Task 5 (поле отсутствует = неизвестно).
- Produces: `components["schemas"]["AuthUser"]` с `totpEnabled?: boolean` (уже был) и новым `passkeyEnabled?: boolean` в `dto.ts`.

- [ ] **Шаг 1: Описать оба поля в схеме**

В `openapi.yaml`, в `AuthUser`, заменить строку
`totpEnabled: { type: boolean }` на:

```yaml
        totpEnabled:
          type: boolean
          description: >
            Whether TOTP two-factor auth is on. ABSENT MEANS UNKNOWN — the
            owning service (twofa) could not be reached. Render an absent value
            as "unknown", never as "off": auth-service does not own this flag
            and the gateway overlays it, so a missing key is a failed lookup and
            not a disabled factor.
        passkeyEnabled:
          type: boolean
          description: >
            Whether the user has at least one passkey registered. Absent means
            unknown, exactly as for totpEnabled. Always absent on
            /api/auth/me — that route runs on every page load and deliberately
            does not pay for the lookup, since nothing there consumes it.
```

Обе схемы остаются без `required`, поэтому оба поля генерируются как
опциональные — что и требуется для тристейта.

- [ ] **Шаг 2: Перегенерировать Go-стабы и TS-типы**

```bash
make -C backend openapi-gen
cd frontend && yarn openapi:generate
```

- [ ] **Шаг 3: Убедиться, что оба поля появились**

```bash
cd /Users/vbncursed/programming/rosneft
grep -n "PasskeyEnabled" backend/services/gateway-service/internal/transport/httpapi/openapi_gen.go
grep -n "passkeyEnabled" frontend/src/shared/infrastructure/api/dto.ts
```

Ожидается: `PasskeyEnabled *bool \`json:"passkeyEnabled,omitempty"\`` в Go и
`passkeyEnabled?: boolean;` в TS.

- [ ] **Шаг 4: Проверить сборку обеих сторон**

```bash
cd backend && GOWORK=off go vet ./services/gateway-service/... 2>&1 | head
cd ../frontend && yarn build 2>&1 | tail -5
```

Ожидается: `go vet` чист; сборка фронтенда проходит (`Principal` ещё не
изменён, новое поле пока никем не читается).

- [ ] **Шаг 5: Коммит**

```bash
git add backend/services/gateway-service/api backend/services/gateway-service/internal/transport/httpapi frontend/src/shared/infrastructure/api/dto.ts
git commit -m "feat(api): passkeyEnabled on AuthUser, absent means unknown"
```

---

### Task 7: Тристейт в домене фронтенда

**Files:**
- Modify: `frontend/src/auth/domain/principal.ts:1-18`
- Modify: `frontend/src/auth/infrastructure/auth-gateway.ts:9-21` (`mapPrincipal`)
- Modify: `frontend/src/routes/account.tsx:26`
- Modify: `frontend/src/auth/domain/principal.test.ts:13`
- Modify: `frontend/src/app-shell/user-menu.spec.tsx:28`
- Modify: `frontend/src/routes/console-landing.spec.ts:12`
- Modify: `frontend/src/audit/presentation/components/my-activity-section.spec.tsx:34`

**Interfaces:**
- Consumes: `dto.ts` из Task 6.
- Produces: `Principal.totpEnabled: boolean | null` и `Principal.passkeyEnabled: boolean | null`. `AdminUser` — по-прежнему псевдоним `Principal`, поля наследуются.

- [ ] **Шаг 1: Изменить домен**

В `principal.ts` заменить строку `totpEnabled: boolean;` на:

```ts
  // Tri-state. null means the owning service could not be reached, so the
  // status is unknown — never collapse it to false. A confident wrong "off" in
  // the admin console is the bug this field was widened to fix.
  totpEnabled: boolean | null;
  // Whether the user has at least one passkey. null = unknown, and always null
  // on /api/auth/me, which does not fetch it.
  passkeyEnabled: boolean | null;
```

- [ ] **Шаг 2: Изменить маппер**

В `auth-gateway.ts`, в `mapPrincipal`, заменить строку
`totpEnabled: d.totpEnabled ?? false,` на:

```ts
    totpEnabled: d.totpEnabled ?? null,
    passkeyEnabled: d.passkeyEnabled ?? null,
```

- [ ] **Шаг 3: Починить единственного потребителя, который ждёт `boolean`**

В `routes/account.tsx:26`:

```tsx
        <TwoFactorSection initiallyEnabled={p.totpEnabled ?? false} />
```

Комментарий над строкой:

```tsx
        {/* Unknown degrades to "off" here on purpose: this section manages the
            user's own factor, and with twofa-service down every button in it
            fails anyway. The tri-state matters in the admin console, where one
            person reads another's security posture. */}
```

`passkeys-section.tsx:59` уже пишет `me?.totpEnabled ?? false` и правки не
требует.

- [ ] **Шаг 4: Добавить поле в четыре тестовые фикстуры**

В каждом из файлов рядом со строкой `totpEnabled: false,` добавить:

```ts
  passkeyEnabled: null,
```

Файлы: `auth/domain/principal.test.ts`, `app-shell/user-menu.spec.tsx`,
`routes/console-landing.spec.ts`,
`audit/presentation/components/my-activity-section.spec.tsx`.

- [ ] **Шаг 5: Прогнать проверки типов, линт и оба раннера**

```bash
cd frontend && yarn build && yarn lint && yarn test && yarn test:spa
```

Ожидается: всё зелёное. Если `yarn build` ругается на `totpEnabled` где-то ещё —
это потребитель, который не был учтён: привести его к `?? false`, если он
управляет собственным фактором пользователя, и к явной обработке `null`, если он
показывает чужой статус.

- [ ] **Шаг 6: Коммит**

```bash
git add frontend/src
git commit -m "feat(auth): make factor status tri-state in the domain"
```

---

### Task 8: Колонки «2FA» и «Passkey» в таблице админки

**Files:**
- Modify: `frontend/src/auth/presentation/console/user-row.tsx:18-20,55-61`
- Modify: `frontend/src/auth/presentation/console/users-table.tsx:47-58`
- Create: `frontend/src/auth/presentation/console/user-row.spec.tsx`

**Interfaces:**
- Consumes: `AdminUser.totpEnabled`, `AdminUser.passkeyEnabled` (`boolean | null`) из Task 7.
- Produces: ничего для последующих задач.

- [ ] **Шаг 1: Написать падающий тест**

Создать `user-row.spec.tsx`:

```tsx
// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import UserRow from "./user-row";
import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: "u1",
  email: "a@b.c",
  username: "ivan",
  status: "active",
  totpEnabled: false,
  passkeyEnabled: false,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
  ...over,
});

const me: Principal = user({ id: "me", username: "root", isOwner: true });

// A <tr> is invalid outside a table and React warns; the row under test is the
// component, so give it the minimum valid host.
function renderRow(u: AdminUser) {
  render(
    <table>
      <tbody>
        <UserRow u={u} me={me} roleTitle={(s) => s} act={async () => {}} onEditRoles={() => {}} />
      </tbody>
    </table>,
  );
  return screen.getAllByRole("cell");
}

// Columns are positional; getByText("Yes") would not say which factor it found.
const factorCells = (cells: HTMLElement[]) => ({ totp: cells[4], passkey: cells[5] });

afterEach(cleanup);

describe("UserRow factor columns", () => {
  it("shows Yes for an enabled factor and No for a disabled one", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: true, passkeyEnabled: false })));

    expect(within(totp).getByText("Yes")).toBeTruthy();
    expect(within(passkey).getByText("No")).toBeTruthy();
  });

  it("shows Yes in the passkey column independently of 2FA", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: false, passkeyEnabled: true })));

    expect(within(totp).getByText("No")).toBeTruthy();
    expect(within(passkey).getByText("Yes")).toBeTruthy();
  });

  // The bug this whole change exists to remove was a confident wrong "No".
  // When the owning service did not answer, the console must say so.
  it("shows a dash, not No, when a factor status is unknown", () => {
    const { totp, passkey } = factorCells(renderRow(user({ totpEnabled: null, passkeyEnabled: null })));

    expect(within(totp).getByText("—")).toBeTruthy();
    expect(within(passkey).getByText("—")).toBeTruthy();
    expect(within(totp).queryByText("No")).toBeNull();
    expect(within(passkey).queryByText("No")).toBeNull();
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

```bash
cd frontend && yarn test:spa --run src/auth/presentation/console/user-row.spec.tsx 2>&1 | tail -25
```

Ожидается: FAIL — в строке пока шесть ячеек, `cells[5]` это меню действий, и
теста на «—» не проходит ни одна ветка.

- [ ] **Шаг 3: Ввести `FactorPill` в `user-row.tsx`**

Добавить после константы `PILL`:

```tsx
// Tri-state on purpose: null means the owning service did not answer, and the
// console must not print an unverified "No" — that was the reported bug.
function FactorPill({ on }: { on: boolean | null }) {
  if (on === null) {
    return <span className={`${PILL} border-white/15 text-neutral-500`} title="Status unavailable">—</span>;
  }
  return (
    <span className={`${PILL} ${on ? "border-emerald-300/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}>
      {on ? "Yes" : "No"}
    </span>
  );
}
```

- [ ] **Шаг 4: Заменить ячейку 2FA и добавить passkey**

Заменить блок

```tsx
      <td className="px-3 py-2">
        <span className={`${PILL} ${u.totpEnabled ? "border-emerald-300/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}>
          {u.totpEnabled ? "Yes" : "No"}
        </span>
      </td>
```

на

```tsx
      <td className="px-3 py-2"><FactorPill on={u.totpEnabled} /></td>
      <td className="px-3 py-2"><FactorPill on={u.passkeyEnabled} /></td>
```

- [ ] **Шаг 5: Добавить заголовок и починить ширины в `users-table.tsx`**

В `<thead>` вставить `<th className="px-3 py-2">Passkey</th>` сразу после
`<th className="px-3 py-2">2FA</th>`.

Оба `colSpan={6}` (строки «Loading…» и «No users.») заменить на `colSpan={7}`.

`min-w-[46rem]` → `min-w-[52rem]`, и обновить комментарий над блоком: «шесть
колонок» → «семь колонок».

- [ ] **Шаг 6: Прогнать тест, линт и сборку**

```bash
cd frontend && yarn test:spa --run src/auth/presentation/console/user-row.spec.tsx 2>&1 | tail -25
yarn lint && yarn build
```

Ожидается: три теста PASS; линт чист (оба файла заметно ниже потолка в 200
строк); сборка проходит.

- [ ] **Шаг 7: Полный прогон фронтенда**

```bash
cd frontend && yarn test && yarn test:spa
```

Ожидается: оба раннера зелёные.

- [ ] **Шаг 8: Коммит**

```bash
git add frontend/src/auth/presentation/console
git commit -m "feat(admin): show real 2FA status and a passkey column in the user list"
```

---

## Проверка после сборки всего

- [ ] **Полный гейт бэкенда**

```bash
make -C backend check
```

- [ ] **Ручная проверка на локальном стенде**

Поднять стенд, войти под аккаунтом с `users:read`, открыть `/admin/users`:

1. У пользователя с включённой 2FA в колонке «2FA» — «Yes». До правки там было
   «No» для всех без исключения; если «Yes» не появился, наложение не доехало.
2. У пользователя с зарегистрированным passkey в колонке «Passkey» — «Yes».
3. Остановить twofa-service (`docker compose stop twofa-service`) и обновить
   страницу: колонка «2FA» — «—» у всех, колонка «Passkey» продолжает
   показывать «Yes»/«No», список **не** отдаёт ошибку. В логах шлюза —
   `2fa status unavailable`.
4. Поднять twofa-service обратно и убедиться, что колонка вернулась.

Фикстура с двумя арендаторами описана в памяти проекта
(`rosneft-two-tenant-test-fixture`).

---

## Расхождения с текстом спеки

Спека в разделе «Проверки» обещала тест уровня `handlers_test.go`, который
проверяет, что `listUsers` отдаёт наложенные флаги. Довести его до конца в этой
форме нельзя без интерфейса, введённого исключительно ради теста: `Handlers.client`
— конкретный `*auth.Client`, и успешный ответ auth-service в юнит-тесте не
подделать (существующий `handlers_test.go` по этой же причине тестирует только
пути отказа, через клиент на мёртвом порту).

Покрытие разложено по конвенции репозитория «решение, которому нужен тест,
живёт в чистой функции»:

- наложение как таковое — `dto_test.go` (Task 4), чистые `userToJSON` /
  `usersToJSON` над готовыми множествами;
- деградация при недоступном сервисе — `factors_test.go` (Task 5), через
  клиентов на мёртвом порту, ровно как в существующем `handlers_test.go`;
- то, что обработчики зовут именно наложение — обеспечено компилятором:
  конвертер без множеств больше не существует.

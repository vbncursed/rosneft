# Фильтры журнала аудита: дропдауны, читаемый актор, анимация diff — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать из фильтров журнала три поля со свободным вводом (Action, Entity через нативный `<select>`, Actor id как UUID), заменив их на существующий `<Dropdown>`; показывать актора email'ом вместо обрезанного UUID; починить 500-ю на невалидном `actor`; анимировать раскрытие diff.

**Architecture:** Четыре независимых слоя. (1) Бэкенд: одна проверка на границе доверия в `audit-service` закрывает оба HTTP-эндпоинта сразу. (2) Общие компоненты: `Dropdown` и `DatePicker` получают сменный класс триггера, чтобы пять контролов в одной строке фильтров выглядели одинаково; в motion-пресеты добавляется `collapse` + обёртка `MotionCollapse`. (3) Домен аудита: словарь сущностей и действий чистым модулем под `node --test`. (4) Каталог пользователей отдаётся контекстом `auth/` в виде `Map<string, string>` — примитива, а не доменной сущности, чтобы не создавать второй кросс-контекстный доменный импорт.

**Tech Stack:** Go 1.x (testify suite + minimock + gotest.tools), PostgreSQL, React 19, TypeScript strict, Tailwind CSS 4, `motion/react`, `@tanstack/react-query`, `node --test` + vitest.

## Global Constraints

- Фронтенд: все команды из `frontend/`. Бэкенд: `make test`, `make lint` из `backend/`.
- **Жёсткий лимит 200 строк на файл** во фронтенде (ESLint `max-lines`, `skipBlankLines`, `skipComments`).
- **Никогда не писать `"use client"`** — это Vite SPA.
- Слои фронтенда: зависимости строго внутрь; `domain` не импортирует наружу; `motion` только в `presentation/`. **Кросс-контекстные доменные импорты запрещены** — единственное санкционированное исключение (`territory/` ← `placement/`) расширять нельзя. Поэтому между `auth/` и `audit/` через границу ходит только `Map<string, string>`.
- `*.test.ts` (node --test) импортирует относительным путём с явным `.ts`; `*.spec.tsx` (vitest) импортирует `describe`/`it`/`expect` явно и вешает `afterEach(cleanup)` руками.
- Анимированные поверхности обязаны уважать `prefers-reduced-motion` через `useResolvedVariants`. Пресеты и обёртки живут только в `@/shared/presentation/motion/` — инлайнить варианты и руками разворачивать `AnimatePresence` в компоненте нельзя (CLAUDE.md).
- Новых npm-зависимостей не добавлять. В Go `github.com/google/uuid` уже в `go.sum` как indirect — прямое использование только повышает его до direct, скачивания нет.
- Тач-таргет минимум 44×44, `cursor-pointer` на кликабельном, переходы 150–300 мс.
- Комментарии — по-русски, объясняют «почему».
- Финальный гейт: `cd backend && make lint && make test`, затем `cd frontend && yarn lint && yarn test && yarn test:spa`.

---

## Что установлено разведкой (не перепроверять, но и не противоречить)

**Корневая причина 500-й.** `audit-service/internal/storage/list.go:21-24` подставляет `f.ActorID` в `actor_id = $N`, где колонка типа `UUID`. Postgres отбивает `"123"` кодом 22P02, `List` оборачивает это как `storage.List: rows: …`, и наверху получается Internal. Оба HTTP-эндпоинта (`/api/audit` в `httpapi/audit.go:60` и `/api/audit.csv` в `httpapi/audit_csv.go:43`) вызывают один и тот же `svc.ListAudit` → `audit.ListEntries` → gRPC → `service.List`. Оба уже маппят `isInvalid(err)` в 400 (`httpapi/audit.go:67-68`, `httpapi/audit_csv.go:88-89`). Значит **одна** проверка в `service.List` чинит оба, и новой обвязки не нужно.

**Словарь сущностей — 11 штук.** Десять от триггеров (`audit-service/internal/migrate/migrations/00002_ensure_triggers.sql:24-35`): `territory`, `model`, `placement`, `territory_assignment`, `panorama`, `document`, `user`, `user_role`, `role`, `role_permission`. Одиннадцатая — `session`, её пишет не триггер, а гейтвей (`authhttp/audit.go:68`). Текущий массив `ENTITIES` в `audit-filters.tsx:8-17` содержит восемь и **пропускает** `territory_assignment`, `user_role`, `role_permission`.

**Действия.** Триггер строит действие как `v_entity || '.' || lower(TG_OP)` (`00003_ignore_bookkeeping_columns.sql:43`), то есть `insert`/`update`/`delete` — **не `create`**. Угаданное `territory.create` молча вернёт пустой список. События аутентификации перечислены в `authhttp/audit.go:20-31`, их десять, все с сущностью `session`.

**Права — риска нет.** `audit:read` выдан только роли `admin` (миграция auth `00012_audit_permission.sql:9-11`), а `admin` получает *все* права (`00002_seed_roles_permissions.sql:31-32`), включая `users:read`. Root проходит по owner-bypass. То есть каждый, кто может читать журнал, уже может вызвать `GET /api/auth/users`. Дополнительно `admin` лишён `users:read_all` (`00007_split_create_admin_scope.sql:26-27`), поэтому его список пользователей ограничен теми, кого он создал — ровно область видимости журнала. Совпадение не случайное: и то и другое опирается на цепочку `users.created_by`. Остаточный риск — кастомная роль с `audit:read` без `users:read`; она даёт 403, и каталог должен деградировать, а не падать.

**Конвенция motion-обёрток.** `MotionOverlay` (`motion-overlay.tsx:16-39`) принимает `open: boolean` и **сам** держит `AnimatePresence`; `MotionModal` и `MotionDrawer` строятся поверх него. `MotionCollapse` обязан следовать той же форме.

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `backend/services/audit-service/internal/service/list.go` (изменить: строки 25-28) | Валидация `ActorID` как UUID рядом с существующей fail-closed проверкой компании. |
| `backend/services/audit-service/internal/service/list_test.go` (изменить) | Кейс: мусорный actor → `ErrInvalidInput`, стор не вызван. |
| `frontend/src/shared/presentation/components/dropdown/dropdown.tsx` (изменить: 11-27, 136-164) | Новый опциональный `triggerClassName`. |
| `frontend/src/shared/presentation/components/date-picker/date-picker.tsx` (изменить: 7-21, 152-165) | То же, симметрично. |
| `frontend/src/shared/presentation/motion/variants.ts` (изменить) | Пресет `collapse`. |
| `frontend/src/shared/presentation/motion/motion-collapse.tsx` (создать) | Обёртка раскрытия по высоте, `open`-проп + собственный `AnimatePresence`. |
| `frontend/src/shared/presentation/motion/index.ts` (изменить) | Экспорт `MotionCollapse`. |
| `frontend/src/audit/domain/vocabulary.ts` (создать) | Словарь сущностей и действий, `actionsFor(entity)`. Чистый. |
| `frontend/src/audit/domain/vocabulary.test.ts` (создать) | `node --test`: состав словаря, отсутствие `.create`, зависимость действий от сущности. |
| `frontend/src/auth/application/user-directory.ts` (создать) | `useUserDirectory(): Map<string, string>` — id → email, деградирует до пустой карты. |
| `frontend/src/audit/presentation/components/filter-options.ts` (создать) | Сборка `DropdownOption[]` для трёх фильтров. Держит `audit-filters.tsx` под лимитом. |
| `frontend/src/audit/presentation/components/audit-filters.tsx` (изменить целиком) | Три `<Dropdown>` вместо input/select/input; сброс невалидного action при смене entity. |
| `frontend/src/audit/presentation/components/audit-panel.tsx` (изменить: 9-32) | Тянет каталог, раздаёт его в фильтры и таблицу. |
| `frontend/src/audit/presentation/components/audit-table.tsx` (изменить: 4, 24-28) | Прокидывает `actors` в строку. |
| `frontend/src/audit/presentation/components/audit-row.tsx` (изменить: 17-20, 33-39, 60-64) | Email вместо обрезанного UUID; diff в `MotionCollapse`. |

---

## Task 1: 500-я на невалидном actor → 400

**Files:**
- Modify: `backend/services/audit-service/internal/service/list.go` (строки 25-28)
- Test: `backend/services/audit-service/internal/service/list_test.go`

**Interfaces:**
- Consumes: `domain.Filter` (`audit-service/internal/domain/entry.go:31`), `domain.ErrInvalidInput` (`domain/errors.go:6`), `github.com/google/uuid`.
- Produces: `service.List` возвращает `domain.ErrInvalidInput` при `Filter.ActorID`, который не является UUID. Транспорт уже маппит это в `codes.InvalidArgument`, а гейтвей — в 400. Ничего вызывающего менять не надо.

- [ ] **Step 1: Написать падающий тест**

Добавить в `backend/services/audit-service/internal/service/list_test.go` (после `TestScopedListRequiresCompany`):

```go
// Мусорный actor доходил до SQL и падал на приведении к UUID (SQLSTATE 22P02),
// а наружу уходила 500-я. Ввод пользователя — граница доверия: отбиваем здесь,
// один раз, до похода в стор. Проверка в service, а не в storage, потому что
// оба HTTP-эндпоинта (/api/audit и /api/audit.csv) идут через этот метод.
func (s *ListSuite) TestGarbageActorIsRejectedBeforeTheStore() {
	// Стор без единого ожидания: minimock провалит тест, если List всё же позовут.
	svc := service.New(mocks.NewStoreMock(s.mc))

	_, _, err := svc.List(s.T().Context(), domain.Filter{
		AllCompanies: true,
		ActorID:      "123",
	})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// Пустой actor — это «без фильтра», а не невалидный ввод.
func (s *ListSuite) TestEmptyActorIsNotAFilter() {
	store := mocks.NewStoreMock(s.mc).ListMock.Return([]domain.Entry{{ID: 1}}, nil)
	svc := service.New(store)

	entries, _, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: ""})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 1)
}

// Настоящий UUID проходит насквозь.
func (s *ListSuite) TestValidActorReachesTheStore() {
	store := mocks.NewStoreMock(s.mc).ListMock.Return([]domain.Entry{{ID: 7}}, nil)
	svc := service.New(store)

	entries, _, err := svc.List(s.T().Context(), domain.Filter{
		AllCompanies: true,
		ActorID:      "288094d3-0d12-47f8-8833-cc940a080b62",
	})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 1)
}
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend/services/audit-service && go test -race -run TestListSuite ./internal/service/...`
Expected: FAIL — `TestGarbageActorIsRejectedBeforeTheStore` падает, потому что `List` зовёт стор и minimock ругается на неожиданный вызов (или тест валится на `ErrorIs`, если мок вернёт зеро-значение).

- [ ] **Step 3: Добавить проверку**

В `backend/services/audit-service/internal/service/list.go` добавить импорт:

```go
import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)
```

И сразу после существующей проверки компании (строка 28), внутри `List`:

```go
	// actor_id — колонка UUID, и невалидная строка раньше доезжала до SQL, где
	// Postgres валил запрос кодом 22P02, а наружу уходила 500-я вместо 400-й.
	// Проверяем здесь, а не в storage: оба HTTP-эндпоинта — JSON и CSV — идут
	// через этот метод, а транспорт уже маппит ErrInvalidInput в InvalidArgument.
	if f.ActorID != "" && uuid.Validate(f.ActorID) != nil {
		return nil, 0, fmt.Errorf("audit.List: %w: actor id must be a uuid", domain.ErrInvalidInput)
	}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd backend/services/audit-service && go mod tidy && go test -race -shuffle=on ./...`
Expected: PASS. `go mod tidy` переводит `github.com/google/uuid` из indirect в direct — новых загрузок нет, модуль уже в `go.sum`.

- [ ] **Step 5: Прогнать весь бэкенд**

Run: `cd backend && make lint && make test`
Expected: PASS во всех модулях.

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add backend/services/audit-service/internal/service/list.go \
        backend/services/audit-service/internal/service/list_test.go \
        backend/services/audit-service/go.mod
git commit -m "fix(audit): reject a non-uuid actor filter with 400 instead of 500"
```

---

## Task 2: Сменный класс триггера у Dropdown и DatePicker

**Files:**
- Modify: `frontend/src/shared/presentation/components/dropdown/dropdown.tsx`
- Modify: `frontend/src/shared/presentation/components/date-picker/date-picker.tsx`

**Interfaces:**
- Produces: у обоих компонентов новый опциональный проп `triggerClassName?: string`. Структурные классы (`flex`, `w-full`, `cursor-pointer`, `items-center`, `justify-between`, `gap-2`) применяются всегда; `triggerClassName` подменяет только оформление (рамка/фон/типографика/фокус). Без пропа поведение обоих компонентов не меняется ни на пиксель — существующие вызовы в `viewer/`, `panorama/`, `placement/`, `auth/console/` не трогаем.

Зачем: в строке фильтров аудита окажется пять контролов — три `Dropdown`, два `DatePicker`. У `Dropdown` триггер `bg-white/[0.03] text-xs`, у остальных полей `FIELD_CLASS` даёт `bg-black/30 text-sm`. Разные фон и кегль рядом в одной строке читаются как сломанная вёрстка, а править `Dropdown` под аудит нельзя — тот же класс носит тулбар вьюера.

- [ ] **Step 1: Развести структуру и оформление в Dropdown**

В `frontend/src/shared/presentation/components/dropdown/dropdown.tsx` добавить в `DropdownProps` (после `className`):

```ts
  // Подменяет оформление триггера (рамка/фон/типографика), но не его раскладку.
  // Нужно там, где дропдаун стоит в одной строке с другими контролами и должен
  // выглядеть как они — например в фильтрах журнала аудита.
  triggerClassName?: string;
```

Над компонентом добавить две константы:

```ts
// Раскладка триггера не настраивается: без неё стрелка и подпись разъезжаются.
const TRIGGER_LAYOUT =
  "group flex w-full cursor-pointer items-center justify-between gap-2";
const TRIGGER_LOOK =
  "rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-100 transition-colors hover:bg-white/10 focus:border-cyan-300/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
```

Добавить `triggerClassName` в деструктуризацию пропсов и заменить `className` на кнопке (строка 148) на:

```tsx
        className={`${TRIGGER_LAYOUT} ${triggerClassName ?? TRIGGER_LOOK}`}
```

- [ ] **Step 2: То же в DatePicker**

В `frontend/src/shared/presentation/components/date-picker/date-picker.tsx` добавить в `DatePickerProps` (после `placeholder`):

```ts
  // Подменяет оформление триггера, не раскладку. См. одноимённый проп Dropdown.
  triggerClassName?: string;
```

Заменить существующую константу `TRIGGER_CLASS` на пару:

```ts
const TRIGGER_LAYOUT = "flex w-full cursor-pointer items-center justify-between gap-2";
const TRIGGER_LOOK =
  "rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white transition-colors hover:border-white/25 focus:border-cyan-400/60 focus:outline-none";
```

Добавить `triggerClassName` в деструктуризацию и заменить `className={TRIGGER_CLASS}` на:

```tsx
        className={`${TRIGGER_LAYOUT} ${triggerClassName ?? TRIGGER_LOOK}`}
```

- [ ] **Step 3: Убедиться, что ничего не сломалось**

Run: `cd frontend && yarn lint && yarn test:spa`
Expected: PASS — 244 теста как раньше. Существующие вызовы обоих компонентов не передают новый проп, поэтому берут `TRIGGER_LOOK` и рендерятся байт-в-байт как до правки.

- [ ] **Step 4: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/presentation/components/dropdown/dropdown.tsx \
        frontend/src/shared/presentation/components/date-picker/date-picker.tsx
git commit -m "feat(shared): let Dropdown and DatePicker take a trigger look"
```

---

## Task 3: Пресет и обёртка раскрытия

**Files:**
- Modify: `frontend/src/shared/presentation/motion/variants.ts`
- Create: `frontend/src/shared/presentation/motion/motion-collapse.tsx`
- Modify: `frontend/src/shared/presentation/motion/index.ts`

**Interfaces:**
- Consumes: `quick` (`motion/transitions.ts:5`), `useResolvedVariants` (`motion/reduced-motion.ts:11`).
- Produces:
  - `collapse: Variants` — `hidden: { height: 0, opacity: 0 }` / `visible: { height: "auto", opacity: 1 }`.
  - `MotionCollapse({ open, children, className })` — default-экспорт `motion-collapse.tsx`, реэкспорт из `index.ts` как `MotionCollapse`. Форма пропсов повторяет `MotionOverlay`: `open: boolean`, обёртка сама держит `AnimatePresence`.

- [ ] **Step 1: Добавить пресет**

В `frontend/src/shared/presentation/motion/variants.ts` добавить в конец:

```ts
// Раскрытие по высоте: строки ниже уезжают плавно, а не прыгают. Требует
// overflow:hidden на анимируемом элементе, иначе содержимое вылезает за
// нулевую высоту. При reduced motion resolveVariants сводит это к чистому
// crossfade — height из вариантов исчезает, и раскрытие становится мгновенным.
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: "auto", opacity: 1 },
};
```

- [ ] **Step 2: Написать обёртку**

Создать `frontend/src/shared/presentation/motion/motion-collapse.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { collapse } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface MotionCollapseProps {
  open: boolean;
  children: ReactNode;
  // Оформление раскрывающейся полосы (рамка/фон). Отступы кладите на
  // внутренний элемент: padding на анимируемом остался бы виден при height:0.
  className?: string;
}

// Раскрытие по высоте для разворачиваемых блоков. Форма пропсов та же, что у
// MotionOverlay: `open` снаружи, AnimatePresence внутри — она держит поддерево
// смонтированным на время exit-анимации.
export default function MotionCollapse({ open, children, className }: MotionCollapseProps) {
  const anim = useResolvedVariants(collapse);
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          variants={anim}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={quick}
          style={{ overflow: "hidden" }}
          className={className}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

`initial={false}` — чтобы уже открытые блоки не проигрывали раскрытие при первом рендере списка (например после подгрузки следующей страницы журнала).

- [ ] **Step 3: Экспортировать из барреля**

В `frontend/src/shared/presentation/motion/index.ts` добавить строку рядом с остальными:

```ts
export { default as MotionCollapse } from "./motion-collapse";
```

- [ ] **Step 4: Проверить**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS. `reduced-motion.test.ts` продолжает проходить: `resolveVariants` про `collapse` ничего не знает, он схлопывает любой набор в opacity-only.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/presentation/motion/
git commit -m "feat(shared): add a height-collapse motion preset and wrapper"
```

---

## Task 4: Словарь журнала

**Files:**
- Create: `frontend/src/audit/domain/vocabulary.ts`
- Test: `frontend/src/audit/domain/vocabulary.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `ENTITIES: readonly string[]` — все 11 сущностей.
  - `SESSION_ENTITY = "session"`.
  - `actionsFor(entity: string): string[]` — действия одной сущности; пустая строка означает «все».

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/audit/domain/vocabulary.test.ts`:

```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { ENTITIES, SESSION_ENTITY, actionsFor } from "./vocabulary.ts";

test("every audited entity is listed", () => {
  // Десять сущностей от триггеров плюс session от гейтвея. Прошлый список в
  // audit-filters пропускал три связующие таблицы, и отфильтровать по ним
  // было нельзя вовсе.
  assert.equal(ENTITIES.length, 11);
  for (const e of [
    "territory",
    "model",
    "placement",
    "territory_assignment",
    "panorama",
    "document",
    "user",
    "user_role",
    "role",
    "role_permission",
    "session",
  ]) {
    assert.ok(ENTITIES.includes(e), `missing ${e}`);
  }
});

test("a trigger entity has exactly its three operations", () => {
  assert.deepEqual(actionsFor("territory"), [
    "territory.insert",
    "territory.update",
    "territory.delete",
  ]);
  assert.deepEqual(actionsFor("role_permission"), [
    "role_permission.insert",
    "role_permission.update",
    "role_permission.delete",
  ]);
});

test("no action is ever named .create", () => {
  // Триггер строит действие как lower(TG_OP), то есть insert. Угаданное
  // "territory.create" молча вернуло бы пустой журнал — именно это и должен
  // предотвращать дропдаун, так что промах в словаре сводит его на нет.
  for (const action of actionsFor("")) {
    assert.ok(!action.endsWith(".create"), `${action} must not exist`);
  }
});

test("session carries the auth events, not insert/update/delete", () => {
  const actions = actionsFor(SESSION_ENTITY);
  assert.equal(actions.length, 10);
  for (const a of actions) {
    assert.ok(a.startsWith("auth."), `${a} should be an auth event`);
  }
  assert.ok(actions.includes("auth.login"));
  assert.ok(actions.includes("auth.passkey_delete"));
});

test("an empty entity means every action", () => {
  const all = actionsFor("");
  // 10 сущностей × 3 операции + 10 событий auth.
  assert.equal(all.length, 40);
  assert.ok(all.includes("territory.update"));
  assert.ok(all.includes("auth.login_2fa"));
});

test("actionsFor never returns duplicates", () => {
  const all = actionsFor("");
  assert.equal(new Set(all).size, all.length);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './vocabulary.ts'`.

- [ ] **Step 3: Реализовать словарь**

Создать `frontend/src/audit/domain/vocabulary.ts`:

```ts
// Словарь журнала: что бывает в колонках entity и action.
//
// Источники истины лежат в бэкенде, и их два:
//   * сущности и триггерные действия — audit-service, миграция
//     00002_ensure_triggers.sql, массив specs; действие строится как
//     `<entity>.<lower(TG_OP)>` в 00003_ignore_bookkeeping_columns.sql;
//   * события аутентификации — gateway, authhttp/audit.go, карта
//     authAuditActions; все они пишутся с сущностью "session".
//
// ponytail: это третья копия словаря (SQL, Go, TS), и дрейф ловится только
// глазами — новая сущность в миграции не появится здесь сама. Апгрейд, когда
// станет больно: отдавать словарь эндпоинтом. Пока это не оправдывает proto,
// RPC и регенерацию DTO.

// Сущности, за которыми следят триггеры Postgres.
const TRIGGER_ENTITIES = [
  "territory",
  "model",
  "placement",
  "territory_assignment",
  "panorama",
  "document",
  "user",
  "user_role",
  "role",
  "role_permission",
] as const;

// Единственная сущность, которую пишет не триггер, а гейтвей: у входа в систему
// нет строки в таблице, которую можно было бы наблюдать.
export const SESSION_ENTITY = "session";

export const ENTITIES: readonly string[] = [...TRIGGER_ENTITIES, SESSION_ENTITY];

// TG_OP в нижнем регистре. Именно insert, а не create.
const TRIGGER_OPS = ["insert", "update", "delete"] as const;

const SESSION_ACTIONS: readonly string[] = [
  "auth.login",
  "auth.login_2fa",
  "auth.login_passkey",
  "auth.logout",
  "auth.password_change",
  "auth.2fa_enable",
  "auth.2fa_disable",
  "auth.2fa_recovery_regenerate",
  "auth.passkey_register",
  "auth.passkey_delete",
];

function triggerActions(entity: string): string[] {
  return TRIGGER_OPS.map((op) => `${entity}.${op}`);
}

// actionsFor отдаёт действия одной сущности; пустая сущность означает «все».
// Список действий зависит от выбранной сущности, потому что иначе он —
// сорок строк, из которых осмысленны три.
export function actionsFor(entity: string): string[] {
  if (entity === SESSION_ENTITY) return [...SESSION_ACTIONS];
  if (entity) return triggerActions(entity);
  return [...TRIGGER_ENTITIES.flatMap(triggerActions), ...SESSION_ACTIONS];
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && yarn test`
Expected: PASS — 174 + 6 = 180 тестов.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/audit/domain/vocabulary.ts frontend/src/audit/domain/vocabulary.test.ts
git commit -m "feat(audit): describe the journal's entity and action vocabulary"
```

---

## Task 5: Каталог пользователей

**Files:**
- Create: `frontend/src/auth/application/user-directory.ts`

**Interfaces:**
- Consumes: `listUsers(status: string, includeDeleted: boolean): Promise<AdminUser[]>` (`auth/infrastructure/auth-admin-gateway.ts:21`), `useQuery` из `@tanstack/react-query`.
- Produces: `useUserDirectory(): Map<string, string>` — id → email. Пустая карта, пока грузится и если запрос упал.

Почему хук живёт в `auth/`, а не в `audit/`: пользователи — предметная область контекста `auth`, и через границу контекстов уезжает `Map<string, string>`, то есть примитив, а не доменная сущность. Импортировать `AdminUser` в `audit/` значило бы завести второй кросс-контекстный доменный импорт, а CLAUDE.md разрешает ровно один (`territory/` ← `placement/`) и прямо запрещает его расширять.

Почему не переиспользуется существующий `useUsersAdmin` (`auth/application/use-users-admin.ts`): он императивный — `useState`/`useEffect`, тостует ошибку, перезагружается на смену фильтров и ничего не кэширует. Для журнала нужно противоположное: молчаливая деградация и один кэшированный запрос на все строки таблицы.

- [ ] **Step 1: Написать хук**

Создать `frontend/src/auth/application/user-directory.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { listUsers } from "@/auth/infrastructure/auth-admin-gateway";

// Каталог «id пользователя → email» для мест, где иначе виден сырой UUID.
//
// Через границу контекста уезжает Map примитивов, а не AdminUser: доменные типы
// между контекстами не ходят.
//
// includeDeleted: журнал append-only и помнит акторов, которых уже удалили.
// Без этого их записи навсегда остались бы подписаны UUID'ом.
//
// Ошибка проглатывается намеренно и без ретраев. Сегодня каждый, у кого есть
// audit:read, имеет и users:read (роль admin получает все права), но кастомная
// роль может иметь первое без второго — тогда прилетит 403. Журнал при этом
// обязан остаться читаемым: пустая карта означает «показывай UUID», а не
// «покажи ошибку вместо страницы».
export function useUserDirectory(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ["user-directory"],
    queryFn: () => listUsers("", true),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return new Map((data ?? []).map((u) => [u.id, u.email]));
}
```

- [ ] **Step 2: Проверить типы**

Run: `cd frontend && yarn lint`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/auth/application/user-directory.ts
git commit -m "feat(auth): expose a user id to email directory"
```

---

## Task 6: Собрать фильтры, читаемый актор и анимацию

**Files:**
- Create: `frontend/src/audit/presentation/components/filter-options.ts`
- Modify: `frontend/src/audit/presentation/components/audit-filters.tsx` (целиком)
- Modify: `frontend/src/audit/presentation/components/audit-panel.tsx`
- Modify: `frontend/src/audit/presentation/components/audit-table.tsx`
- Modify: `frontend/src/audit/presentation/components/audit-row.tsx`

**Interfaces:**
- Consumes из Task 2: `triggerClassName` у `Dropdown` и `DatePicker`.
- Consumes из Task 3: `MotionCollapse` (`@/shared/presentation/motion`).
- Consumes из Task 4: `ENTITIES`, `SESSION_ENTITY`, `actionsFor` (`@/audit/domain/vocabulary`).
- Consumes из Task 5: `useUserDirectory` (`@/auth/application/user-directory`).
- Consumes существующее: `Dropdown` и тип `DropdownOption` (`@/shared/presentation/components/dropdown/…`), `DatePicker`, `todayISO`.
- Produces: `actors?: Map<string, string>` — новый опциональный проп у `AuditTable` и `AuditRow`. Опциональный, потому что пустой каталог — это реальный рабочий режим (403 у кастомной роли), а не поддавка тесту: `audit-table.spec.tsx` продолжает компилироваться без правок.

- [ ] **Step 1: Собрать опции дропдаунов**

Создать `frontend/src/audit/presentation/components/filter-options.ts`:

```ts
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";
import { ENTITIES, actionsFor } from "@/audit/domain/vocabulary";

// "any" — настоящая опция, а не только placeholder: сняв фильтр, пользователь
// должен вернуться к полному журналу, а до этой опции ещё надо доехать мышью
// или стрелками.
const ANY: DropdownOption = { value: "", label: "any" };

export function entityOptions(): DropdownOption[] {
  return [ANY, ...ENTITIES.map((e) => ({ value: e, label: e }))];
}

export function actionOptions(entity: string): DropdownOption[] {
  return [ANY, ...actionsFor(entity).map((a) => ({ value: a, label: a }))];
}

// Акторы подписаны email'ом, id уходит в hint: два человека с похожими
// адресами всё ещё различимы, а UUID не занимает основную строку.
export function actorOptions(actors: Map<string, string>): DropdownOption[] {
  const rows = [...actors]
    .map(([id, email]) => ({ value: id, label: email, hint: id.slice(0, 8) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [ANY, ...rows];
}
```

- [ ] **Step 2: Переписать строку фильтров**

Заменить `frontend/src/audit/presentation/components/audit-filters.tsx` целиком:

```tsx
import type { AuditFilters } from "@/audit/domain/audit-entry";
import { actionsFor } from "@/audit/domain/vocabulary";
import {
  actionOptions,
  actorOptions,
  entityOptions,
} from "@/audit/presentation/components/filter-options";
import { todayISO } from "@/shared/domain/calendar";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import DatePicker from "@/shared/presentation/components/date-picker/date-picker";

// Один облик на все пять контролов строки. Три из них — Dropdown, два —
// DatePicker, и оба компонента принимают его через triggerClassName; иначе
// дропдаун принёс бы собственные bg-white/[0.03] и text-xs, и строка выглядела
// бы собранной из двух разных форм.
const FIELD_CLASS =
  "rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white transition-colors hover:border-white/25 focus:border-cyan-400/60 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export default function AuditFiltersBar({
  value,
  onChange,
  actors,
}: {
  value: AuditFilters;
  onChange: (next: AuditFilters) => void;
  actors: Map<string, string>;
}) {
  const set = (key: keyof AuditFilters) => (v: string) => onChange({ ...value, [key]: v });

  // Смена сущности роняет действие, которого в новой сущности нет: пара
  // entity=territory + action=model.update даёт запрос, который всегда пуст, и
  // выглядит это как «журнал сломался», а не как «фильтры не сходятся».
  const setEntity = (entity: string) => {
    const keep = actionsFor(entity).includes(value.action);
    onChange({ ...value, entity, action: keep ? value.action : "" });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Entity">
        <Dropdown
          ariaLabel="Entity"
          value={value.entity}
          options={entityOptions()}
          onChange={setEntity}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      {/* Действия зависят от сущности: без неё их сорок, из которых осмысленны
          три. Список — не украшение: триггер пишет ".insert", и угаданное
          ".create" молча возвращало пустой журнал. */}
      <Field label="Action">
        <Dropdown
          ariaLabel="Action"
          value={value.action}
          options={actionOptions(value.entity)}
          onChange={set("action")}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      {/* Актор — выбор из каталога, а не ввод UUID: набранный руками мусор
          доезжал до SQL и возвращал 500-ю. Бэкенд теперь отвечает 400-й, но
          повода набирать UUID руками всё равно нет.

          Поле не блокируется на пустом каталоге, хотя соблазн есть: карта пуста
          и первые миллисекунды загрузки тоже, так что disabled мигал бы у всех
          ради состояния, которое случается только у кастомной роли без
          users:read. Дропдаун с одним "any" в этом случае безвреден. */}
      <Field label="Actor">
        <Dropdown
          ariaLabel="Actor"
          value={value.actor}
          options={actorOptions(actors)}
          onChange={set("actor")}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      <Field label="From">
        <DatePicker
          ariaLabel="From"
          value={value.from}
          onChange={set("from")}
          max={value.to || todayISO()}
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      <Field label="To">
        <DatePicker
          ariaLabel="To"
          value={value.to}
          onChange={set("to")}
          min={value.from}
          max={todayISO()}
          triggerClassName={FIELD_CLASS}
        />
      </Field>
    </div>
  );
}
```

Порядок полей изменился: Entity теперь первый, потому что он сужает Action — читать строку слева направо стало соответствовать порядку заполнения.

- [ ] **Step 3: Подтянуть каталог в панель**

В `frontend/src/audit/presentation/components/audit-panel.tsx` добавить импорт:

```tsx
import { useUserDirectory } from "@/auth/application/user-directory";
```

Внутри компонента, после `const me = useCurrentUser();`:

```tsx
  // Один запрос на весь экран: и фильтр актора, и каждая строка таблицы
  // подписывают UUID из этой же карты.
  const actors = useUserDirectory();
```

И передать её в оба места:

```tsx
        <AuditFiltersBar value={filters} onChange={setFilters} actors={actors} />
```

```tsx
          <AuditTable entries={entries} actors={actors} />
```

- [ ] **Step 4: Прокинуть каталог в строку**

В `frontend/src/audit/presentation/components/audit-table.tsx` заменить сигнатуру и вызов строки:

```tsx
export default function AuditTable({
  entries,
  actors,
}: {
  entries: AuditEntry[];
  // Опционально: пустой каталог — рабочий режим (у роли нет users:read), тогда
  // строка показывает укороченный UUID, как и раньше.
  actors?: Map<string, string>;
}) {
```

```tsx
          <AuditRow key={e.id} entry={e} actors={actors} />
```

- [ ] **Step 5: Email вместо UUID и анимация diff**

В `frontend/src/audit/presentation/components/audit-row.tsx` добавить импорт:

```tsx
import { MotionCollapse } from "@/shared/presentation/motion";
```

Заменить сигнатуру компонента:

```tsx
export default function AuditRow({
  entry,
  actors,
}: {
  entry: AuditEntry;
  actors?: Map<string, string>;
}) {
```

Заменить блок актора (строки 33-39) на:

```tsx
        <span className="truncate text-xs" title={system ? "" : entry.actorId}>
          {system ? (
            <span className="text-neutral-500 italic">system</span>
          ) : (
            // Email, если он известен; иначе укороченный UUID, как раньше.
            // Полный id остаётся в title — он нужен, когда запись обсуждают.
            <span className={actors?.has(entry.actorId) ? "text-neutral-300" : "font-mono text-neutral-400"}>
              {actors?.get(entry.actorId) ?? entry.actorId.slice(0, 8)}
            </span>
          )}
        </span>
```

Заменить хвост компонента (блок `{open && detail ? …}`) на:

```tsx
      <MotionCollapse open={open && detail} className="border-t border-white/5 bg-black/20">
        {/* Отступы на внутреннем элементе: padding на анимируемом остался бы
            виден при height:0 и оставил бы полосу под закрытой строкой. */}
        <div className="px-4 py-3">
          <DiffView oldRow={entry.oldRow} newRow={entry.newRow} />
        </div>
      </MotionCollapse>
```

- [ ] **Step 6: Прогнать полный гейт**

Run: `cd frontend && yarn lint && yarn test && yarn test:spa`
Expected: PASS. `audit-table.spec.tsx` не правился и должен пройти как есть — `actors` опционален. Если `max-lines` сработает на `audit-filters.tsx`, вынести `Field` в отдельный файл `field.tsx` рядом (прецедент: `upload/presentation/components/field.tsx`).

- [ ] **Step 7: Проверить руками в браузере**

Run: `cd frontend && yarn dev`, открыть `/admin/audit`.

1. Entity — дропдаун в стиле остальных полей, 11 сущностей плюс «any», среди них `territory_assignment`, `user_role`, `role_permission`.
2. Выбрать Entity = territory → Action показывает ровно три опции, и все на `.insert`/`.update`/`.delete`.
3. Выбрать Action = territory.update, затем сменить Entity на model → Action сбросился в «any», а не остался невалидным.
4. Entity = session → Action показывает десять `auth.*`.
5. Actor — дропдаун с email'ами, отсортированными по алфавиту, id в подсказке справа.
6. Выбрать актора → таблица перезапрашивается, в колонке Who везде email.
7. Наведение на email в строке показывает полный UUID в тултипе.
8. Все пять контролов строки — одинаковые фон, рамка, кегль и высота.
9. Нажать diff → блок раскрывается по высоте, строки ниже отъезжают плавно; нажать hide → сворачивается так же, без остаточной полосы.
10. Включить «уменьшить движение» в системе → diff открывается мгновенно, без разъезжания высоты.
11. Проверить старую 500-ю: `curl -H "Authorization: Bearer <token>" "http://localhost:8080/api/audit?actor=123"` → 400 с кодом invalid input, не 500. То же для `/api/audit.csv?actor=123`.
12. На узком окне (~380px) строка фильтров переносится, календарь и дропдауны не уезжают за правый край.

- [ ] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/audit/presentation/components/
git commit -m "feat(audit): pick filters from dropdowns and animate the diff"
```

---

## Self-Review — покрытие задачи

| Требование | Задача |
| --- | --- |
| Entity — наш Dropdown вместо нативного `<select>` | Task 6, Step 2 |
| Actor — Dropdown вместо ввода UUID | Task 6, Step 2 (+ Task 5 источник данных) |
| Action — Dropdown, зависящий от Entity | Task 6, Step 2 (+ Task 4 словарь) |
| Актор читаемым видом, а не UUID | Task 6, Step 5 |
| 500-я на `actor=123` | Task 1 — валидация в `service.List`, покрывает и JSON, и CSV |
| Анимация раскрытия diff | Task 3 (пресет + обёртка) → Task 6, Step 5 |
| Единый облик пяти контролов строки | Task 2 → Task 6, Step 2 |
| Три пропавшие сущности в фильтре | Task 4, тест `every audited entity is listed` |
| `.create` вместо `.insert` как источник пустых выборок | Task 4, тест `no action is ever named .create` |
| Деградация без `users:read` | Task 5 (`retry: false`, пустая карта) + Task 6 (дропдаун с одним «any», UUID в строках) |
| Кросс-контекстная граница `auth/` ↔ `audit/` | Task 5 — через границу идёт `Map<string, string>` |
| reduced-motion | Task 3 — `useResolvedVariants`, проверка Task 6 Step 7 пункт 10 |

## Скипнуто

| Что | Когда добавлять |
| --- | --- |
| Эндпоинт `/api/audit/actors` или `/api/audit/vocabulary` | Когда словарь в TS разойдётся с бэкендом или появится роль с `audit:read` без `users:read` |
| `actorLabel` денормализацией в `audit_log` | Когда переименование пользователя начнёт искажать историю: сейчас показывается текущий email, не тогдашний |
| Группировка сорока действий по сущности через header-опции | Если фильтровать по действию без выбранной сущности станет частым сценарием |
| Фильтр «только системные изменения» | Сейчас `actor=""` означает «без фильтра», выразить «actor IS NULL» контракт не умеет |
| Каскад появления полей diff (`MotionList`/`MotionItem` уже есть) | Если раскрытия по высоте покажется мало — но два эффекта на один жест обычно перебор |

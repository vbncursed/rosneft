# Журнал аудита — дизайн

Дата: 2026-07-28
Статус: утверждён, готов к планированию реализации

## Задача

Журнал изменений: кто, что и когда изменил. Видимость:

- **Root** видит все записи без исключения.
- **Company Owner** видит свои изменения и изменения своих сотрудников — и ничего больше.
- Остальные роли к журналу доступа не имеют.

## Что уже есть в коде (ничего из этого писать заново не нужно)

Модель «компании» существует, просто называется иначе:

| Понятие в задаче | Что это в коде |
| --- | --- |
| Root | `users.is_owner = true` (миграция auth `00004_user_owner`, `00005_multi_owner` снял ограничение «ровно один») |
| Company Owner | роль `admin`, title которой миграция `00007_split_create_admin_scope` буквально переименовала в `Company Owner` |
| Сотрудники | цепочка `users.created_by` (миграция `00003_user_created_by`) |
| id компании | результат `users.ResolveOwningAdmin()` — рекурсивный CTE, возвращает узел прямо под первым Root'ом; пусто для самого Root'а |

`ResolveOwningAdmin` для Company Owner возвращает **его собственный id** (он сам — прямо под Root'ом), а для его сотрудников — id этого Company Owner. Поэтому правило видимости целиком выражается как:

```
Root            → без фильтра
всё остальное   → WHERE company_id = <ResolveOwningAdmin(actor)>
```

Gateway-middleware `authhttp.Authenticate` уже кладёт в контекст каждого запроса `userID`, `perms`, `isOwner`, `owningAdmin`.

Все сервисы делят **одну** базу `andrey` (`docker-compose.yml`), изолированы только своими `*_goose_db_version`. Значит одна таблица `audit_log` и одна триггерная функция накрывают таблицы всех сервисов сразу.

## Решения

| Вопрос | Решение |
| --- | --- |
| Детализация | полный diff before → after |
| События | мутации данных + вход/выход/безопасность |
| Действия Root'а над данными компании | Company Owner их **не** видит (фильтр строго по актору) |
| Неудаляемость | append-only на уровне БД |
| Ретеншен | вечно, автоочистки нет |
| UI | страница `/admin/audit` с фильтрами, поиском, CSV-экспортом и ссылками на сущности |
| IP / User-Agent | не пишем |
| Артефакты конвертации | не аудируем |
| Архитектура | Postgres-триггеры + отдельный `audit-service` |
| Прокидывание актора | tx-хелпер в storage-слое |
| Тест триггера | testcontainers, только для audit-service, за build-тегом |

## Архитектура

### 1. Таблица

```sql
CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id     UUID,          -- NULL = системное действие (mesh-worker, миграции)
    company_id   UUID,          -- NULL = Root или системное действие
    action       TEXT NOT NULL, -- 'territory.update', 'auth.login'
    entity       TEXT NOT NULL, -- 'territory' | 'user' | 'placement' | …
    entity_id    TEXT,          -- pk текстом: bigint в catalog, uuid в auth
    entity_label TEXT,          -- slug/email на момент события; переживает удаление строки
    old_row      JSONB,
    new_row      JSONB,
    request_id   TEXT,
    result       TEXT NOT NULL DEFAULT 'ok'  -- 'ok' | 'failed'
);

CREATE INDEX audit_log_company_idx ON audit_log (company_id, id DESC);
CREATE INDEX audit_log_id_idx      ON audit_log (id DESC);
CREATE INDEX audit_log_actor_idx   ON audit_log (actor_id, id DESC);
```

Diff **не хранится** — вычисляется из `old_row`/`new_row` при отдаче. Хранить производное от двух уже сохранённых снимков незачем.

Пагинация курсором по `id DESC`: монотонный, без ничьих по времени. `audit_log_company_idx` обслуживает запрос Company Owner'а, `audit_log_id_idx` — запрос Root'а.

`entity_label` фиксирует человекочитаемое имя на момент события, поэтому запись остаётся осмысленной после переименования или удаления сущности.

### 2. Захват изменений — триггер

Одна функция `audit_capture()` на все аудируемые таблицы, параметризуется через `TG_ARGV`: имя сущности, pk-колонка, label-колонка.

Поведение:

- `to_jsonb(OLD)` / `to_jsonb(NEW)`; для INSERT `old_row` = NULL, для DELETE `new_row` = NULL.
- Безусловное вырезание секретов из обоих снимков: `- '{password_hash,totp_secret,code_hash}'::text[]`. Список фиксирован в функции, без пер-табличной настройки — забыть настроить нельзя.
- Пропуск пустых UPDATE: если снимки равны после вычитания `updated_at`, возвращается NULL и запись не создаётся. Без этого `UpsertTerritory` с неизменными значениями плодил бы мусор — у него в `ON CONFLICT DO UPDATE` стоит `updated_at = NOW()`.
- Составные PK (`user_roles`, `role_permissions`, `territory_assignments`): `entity_id` = NULL; вся строка и так лежит в снимках.
- `actor_id` / `company_id` / `request_id` читаются из `current_setting('app.actor_id', true)` и соседних — с `missing_ok = true`, поэтому фоновая запись без актора даёт NULL, а не ошибку.

Аудируемые таблицы (10):

`territories`, `models`, `placements`, `territory_assignments`, `panoramas`, `territory_documents`, `users`, `user_roles`, `roles`, `role_permissions`.

Исключены осознанно:

- `territory_artifacts`, `model_artifacts` — пишет mesh-worker, человека-актора нет; конверсия видна через job'ы и логи.
- `permissions` — статический справочник, меняется только миграциями.
- `recovery_codes`, `twofa_credentials`, `twofa_recovery_codes`, `passkey_credentials` — секреты; пишем событие через gateway, а не содержимое строки.

Каскадные удаления (`DELETE territory` → placements, panoramas, documents) логируются автоматически, потому что триггеры срабатывают на каждую затронутую строку. Инструментация в Go этого не даёт.

### 3. Привязка триггеров без зависимости от порядка миграций

`audit-service` мигрирует независимо от catalog/auth/content, поэтому `CREATE TRIGGER ... ON territories` в его миграции упал бы на чистой установке — таблицы ещё нет.

Решение: SQL-функция `ensure_audit_triggers()` идёт по фиксированному списку таблиц, для каждой проверяет `to_regclass(...) IS NOT NULL` и наличие триггера, и довешивает недостающее. Вызывается на старте `audit-service` в bootstrap. Идемпотентно, не зависит от порядка, самовосстанавливается. Паттерн повторяет уже существующий в репозитории реконсилер mesh-worker.

### 4. Неудаляемость

```sql
CREATE TRIGGER audit_log_no_mutate
    BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();  -- RAISE EXCEPTION

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
```

Триггер — основной механизм. Одного `REVOKE` было бы недостаточно: `POSTGRES_USER: andrey` владеет всеми таблицами, а владелец может вернуть себе право одной командой `GRANT`. Триггер срабатывает и против владельца. `REVOKE` оставлен вторым рубежом.

Ретеншена нет, чистки нет — объёмы здесь порядка редактирования сцен, а не телеметрии.

### 5. Прокидывание актора до триггера

Новый файл `pkg/grpcutil/actor.go`, структурно — копия существующего `request_id.go`:

- константы `x-actor-id`, `x-actor-company`;
- `ActorFromContext(ctx)`;
- серверный unary/stream интерсептор — **одна строка** в цепочку `grpcutil.NewServer`, после чего актора получают все сервисы;
- клиентский интерсептор — **одна строка** в дефолты `grpcutil.Dial`, после чего его отправляют все клиенты.

Proto для этого менять не нужно: идентичность едет в metadata, а не в теле сообщения.

`authhttp.withPrincipal` дополнительно кладёт актора в ctx-ключ, который читает клиентский интерсептор.

В storage-слое каждая мутация оборачивается хелпером:

```go
func (r *PG) tx(ctx context.Context, fn func(pgx.Tx) error) error
```

Хелпер открывает транзакцию, выполняет `SET LOCAL app.actor_id / app.company_id / app.request_id` и запускает мутацию — так триггер видит актора в той же транзакции. Транзакция обязательна: `SET LOCAL` вне транзакционного блока в Postgres не даёт эффекта.

Затрагивает около 30 storage-файлов в catalog / content / auth, по 2 строки в каждом. Альтернатива — хук `BeforeAcquire` на pgxpool (3 файла) — отклонена: она добавляет round-trip к БД на **каждый** запрос, включая горячий scene-bundle, и работает магией на расстоянии.

### 6. Изменение в proto

`ValidateTokenResponse` получает поле `audit_company_id` — результат настоящего `ResolveOwningAdmin`.

Причина: существующий `owning_admin_id` проходит через `scopeOwningAdmin()`, которая для роли `guest` подменяет значение на собственный id гостя (это ключ видимости территорий, а не принадлежность к компании). Если брать company_id оттуда, действия гостя уехали бы в «компанию из одного гостя» и его Company Owner их бы не увидел. Гости сейчас read-only, поэтому практически это не стреляет, но закладывать такую мину в аудит нельзя.

Изменение обратно совместимое: `owning_admin_id` остаётся и продолжает использоваться для скоупа территорий.

### 7. События входа и безопасности

Триггеры их не видят — сессии живут в Redis, а не в таблице. Пишет **gateway**: там уже известен и principal, и исход операции, и это одно место вместо трёх сервисов (auth + twofa + passkey).

Реализация — таблица `authAuditActions` вида `"METHOD /pattern" → action`, зеркало существующей `routePerms`, и одна middleware на группу `/api/auth/*`.

Покрываются: `login` (успех и провал), `login/2fa`, `passkey/login/finish`, `logout`, `me/password`, `2fa/enable`, `2fa/disable`, `2fa/recovery/regenerate`, `passkey/register/finish`, `DELETE passkey/credentials/{id}`.

Мутации пользователей и ролей сюда **не** входят: они уже ловятся триггерами на `users`, `user_roles`, `roles`, `role_permissions`. Двойной записи не будет.

**Известное ограничение.** Провалившийся вход пишется с `company_id = NULL`, то есть виден только Root'у. Резолвить компанию по введённому логину нельзя — это утечка факта существования аккаунта, а текущий код специально отвечает на неизвестного пользователя как на неверный пароль. Апгрейд, если понадобится: резолвить компанию внутри auth-service, где проверка существования уже произошла, и писать событие оттуда.

### 8. Сервис

```
services/audit-service/
  cmd/audit/main.go
  internal/bootstrap/{logger,postgres,migrate,service,transport,serve}.go
  internal/config/config.go
  internal/migrate/migrations/
    00001_init.sql        -- audit_log + audit_capture() + audit_immutable() + гранты
    00002_ensure_fn.sql   -- ensure_audit_triggers()
  internal/domain/{entry.go,errors.go}
  internal/storage/{postgres.go,list.go,record.go,ensure_triggers.go}
  internal/service/{audit.go,list.go,record.go}
  internal/transport/grpcapi/{server.go,list.go,record.go,converters.go}

proto/rosneft/audit/v1/audit.proto   -- List + Record
```

Сопутствующее:

- `backend/go.work` — добавить модуль.
- `backend/Makefile` — добавить в `SERVICES`, иначе сервис молча не собирается, не тестируется и не линтится.
- `Dockerfile` по образцу distroless/static.
- compose-сервис `audit`, `AUDIT_GRPC_ADDR: ":9009"`, `AUDIT_DB_DSN` на ту же базу `andrey`, `AUDIT_AUTO_MIGRATE: "true"`.

Выбор отдельного модуля вместо размещения в auth-service: auth — самый security-критичный сервис, а журнал добавляет ему read-API с фильтрами и CSV-экспортом; плюс его пул делится с горячим путём логина. В репозитории уже есть прецедент такого разделения — content вынесли из catalog по тому же принципу «одна забота на сервис».

### 9. API gateway

```
GET /api/audit       — фильтры actor, action, entity, from, to, cursor, limit
                       ответ { entries: [...], nextCursor }, заголовок X-Next-Cursor
GET /api/audit.csv   — те же фильтры, потоковый CSV
```

Гейт — новое право `audit:read`, сидится роли `admin` миграцией auth-service. Root проходит по `isOwner` в обход прав, как и на всех остальных гейтах.

Скоуп **всегда** берётся из principal'а в сервисном слое gateway. Параметр компании из запроса не принимается ни в каком виде — иначе Company Owner подставит чужой id.

`X-Next-Cursor` уже перечислен в `ExposedHeaders` CORS-конфига, менять ничего не нужно.

`GET /api/audit.csv` вешается на корневой роутер, а не в JSON-подроутер `/api/*`: `ETagMiddleware` считает sha256 от тела ответа, то есть буферизует его целиком, что для потоковой выгрузки неприемлемо. Прецедент в коде уже есть — asset-proxy и SSE вынесены на корневой роутер по той же причине. Аутентификацию и гейт `audit:read` этот маршрут применяет явно, как `/api/metrics/query`.

Оба маршрута обязаны попасть в `api/openapi.yaml` с последующим `make openapi-gen`. В `gateway-service/internal/bootstrap/spec_coverage_test.go` есть тест, падающий на любом маршруте роутера, которого нет во **встроенной** копии спеки — правки одного лишь yaml без регенерации не пройдут.

### 10. Фронтенд

Новый bounded context, слои по правилам проекта:

```
src/audit/
  domain/audit-entry.ts        -- AuditEntry, AuditAction, DiffField
  domain/diff.ts               -- чистая функция old_row + new_row → DiffField[]
  infrastructure/audit-gateway.ts   -- DTO→domain здесь
  application/use-audit-log.ts      -- useInfiniteQuery + состояние фильтров
  presentation/components/
    audit-table.tsx, audit-row.tsx, audit-filters.tsx,
    diff-view.tsx, entity-link.tsx, export-button.tsx

src/routes/admin-audit.tsx     -- маршрут + ссылка на лендинге консоли + guard на audit:read
```

Лимит 200 строк на файл соблюдается разбиением на перечисленные компоненты. `motion` — только в presentation, через готовые обёртки из `@/shared/presentation/motion/`.

`entity-link.tsx` ведёт на территорию / модель / пользователя, когда сущность ещё существует; иначе показывает `entity_label` без ссылки.

### 11. Тесты

- `domain/diff.ts` — чистая логика, `node --test` (`*.test.ts`). Обязательная проверка: сравнение снимков даёт правильный набор изменённых полей, добавления и удаления полей, вложенные объекты.
- Резолвер скоупа (Root → без фильтра, иначе company_id) — чистая функция, unit-тест. Самое security-критичное место, тестируется отдельно от всего остального.
- Сервисный слой audit-service — `testify/suite` + `gotest.tools/v3/assert` + `minimock`, по конвенции репозитория.
- Триггеры — интеграционный тест на **testcontainers**, только в audit-service, за build-тегом, чтобы `make test` в обычном режиме не требовал Docker. Проверяет: захват INSERT/UPDATE/DELETE, вырезание секретов, пропуск пустого UPDATE, каскадное удаление, срабатывание append-only на UPDATE/DELETE/TRUNCATE, изоляцию `SET LOCAL` между транзакциями.

Это первый интеграционный тест в репозитории — сознательное отступление от текущей политики «никаких внешних зависимостей в тестах». Обосновано тем, что поведение триггера иначе не проверяется ничем, а именно на нём держится доказуемость полноты журнала.

## Что осознанно не делается

- Ретеншен и автоочистка — объёмы не требуют, добавить при реальном росте таблицы.
- IP и User-Agent — не запрошены. Отдельно: `middleware.RealIP` в gateway отключён осознанно (GHSA-3fxj-6jh8-hvhx), так что честный клиентский IP потребовал бы сначала завести доверенный список прокси.
- Аудит чтений (GET) — для «кто что изменил» не нужен, а объём вырос бы на порядок.
- Аудит отказов доступа (403) — не запрошен.
- Человекочитаемые формулировки действий («переименовал территорию») вместо построчного diff — вычисляются на фронтенде из diff, отдельного хранения не требуют.

# Скоуп бинарных ассетов, CSRF-токен и сужение CORS — дизайн

**Goal:** Закрыть последнее место, где хеш блоба открывает содержимое чужого
тенанта; заменить единственную линию CSRF-обороны на две; убрать `*` из
списка разрешённых origin.

**Контекст:** [`2026-07-29-rbac-tenant-isolation-design.md`](2026-07-29-rbac-tenant-isolation-design.md)
и [PR #16](https://github.com/vbncursed/rosneft/pull/16), который закрыл гейт
территории, перевёл сессию в httpOnly-куку и убрал анонимный доступ к ассетам и
SSE. Аудит после него оценил направление 01 в 92%; эта работа адресует
оставшиеся 8%.

---

## Что уже есть и на что это опирается

- `httpapi.RequireTerritoryAccess` — гейт по префиксу шаблона маршрута
  `/api/territories/{slug}`. Скоуп резолвится **только** через
  `territory_assignments`; пустой `scopeAdminID` в каталоге отключает фильтр
  целиком, поэтому гейт отказывает не-Root принципалу с пустым скоупом.
- Сессия — httpOnly-кука `andrey_session`, `SameSite=Lax`. `sessionToken(r)`
  читает куку, затем заголовок `Authorization`.
- `/api/assets/{hash}` и `/api/jobs/{id}/events` требуют сессии, но **не**
  скоупятся.
- Каталог уже читает таблицу `panoramas`, принадлежащую content-сервису
  (`storage/list_panorama_ids.go`) — прецедент для чтения чужой таблицы в общей
  базе с объяснением в комментарии.

---

## Часть 1. Скоуп ассетов

### Проблема

Хеш блоба адресует **содержимое** и дедуплицируется между территориями и
моделями. Поэтому у файла нет одной территории, и гейт территории к нему
неприменим. Сегодня любой аутентифицированный пользователь, знающий хеш,
получает байты — включая геометрию, панорамы и PDF чужой компании.

Практически это смягчено тем, что хеши раздаёт ответ сцены, а он за гейтом. Но
это защита «не узнает адрес», а не «не пустят по адресу».

### Решение: резолв владения запросом на лету

Каждый хеш **уже** записан в таблице, из которой есть путь до территории — или
до модели, которая общая по замыслу:

| Таблица | Колонка | Путь | Индекс по хешу |
| --- | --- | --- | --- |
| `territory_artifacts` | `hash` | `territory_id` | есть |
| `territories` | `source_blob_hash` | сама | **нет** |
| `panoramas` | `source_blob_hash` | `territory_id` | есть |
| `territory_documents` | `source_blob_hash` | `territory_id` | **нет** |
| `model_artifacts` | `hash` | `model_id` → общая | есть |
| `models` | `source_blob_hash`, `thumbnail_blob_hash` | общая | **нет** |

Отдельная таблица владения не нужна: ответ выводится запросом. Она была бы
материализацией этого запроса с обязанностью держать её в синхронизации, а при
рассинхроне отказ был бы тихим и в собственном файле пользователя.

**Модели остаются общей библиотекой** — решение подтверждено заказчиком.
Их байты доступны любому вошедшему. Заметим прямо: это не дыра, которую здесь
забыли, а более широкий факт — `ListModels` не скоупится вовсе, и компания B
видит список моделей компании A обычным `/api/models`. Скоуп моделей — отдельная
работа, если он вообще нужен.

### Новый RPC каталога

`proto/rosneft/catalog/v1/catalog.proto` меняется — в отличие от прошлой спеки,
здесь это необходимо:

```proto
// ResolveBlobAccess answers whether a caller scoped to scope_admin_id may read
// the bytes behind a content-addressed hash. A blob is reachable when it
// belongs to a model (models are a shared library) or to a territory assigned
// to that caller. An empty scope_admin_id means Root and disables the filter.
rpc ResolveBlobAccess(ResolveBlobAccessRequest) returns (ResolveBlobAccessResponse);
```

```proto
message ResolveBlobAccessRequest {
  string hash = 1;
  string scope_admin_id = 2;
}
message ResolveBlobAccessResponse {
  bool allowed = 1;
}
```

Именование следует существующим `ResolveTerritorySlugs` / `ResolveLabels`.

### Запрос

`services/catalog-service/internal/storage/resolve_blob_access.go`:

```sql
SELECT EXISTS (
    -- Models are a shared library: their bytes are readable by any
    -- authenticated caller, deliberately.
    SELECT 1 FROM model_artifacts WHERE hash = $1
    UNION ALL
    SELECT 1 FROM models WHERE source_blob_hash = $1 OR thumbnail_blob_hash = $1
    UNION ALL
    -- Everything reachable from a territory carries that territory's scope.
    SELECT 1 FROM territory_artifacts ta
      WHERE ta.hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = ta.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territories t
      WHERE t.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = t.id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM panoramas p
      WHERE p.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = p.territory_id AND a.admin_user_id = $2::uuid))
    UNION ALL
    SELECT 1 FROM territory_documents d
      WHERE d.source_blob_hash = $1 AND ($2 = '' OR EXISTS (
        SELECT 1 FROM territory_assignments a
        WHERE a.territory_id = d.territory_id AND a.admin_user_id = $2::uuid))
)
```

`EXISTS` над `UNION ALL` останавливается на первой найденной строке, поэтому
шесть ветвей не означают шесть сканов — обычно отрабатывает первая же.

Порядок ветвей выбран не случайно: сначала модели, потому что в типичной сцене
большинство запросов к ассетам — это GLB плейсментов.

**Дедупликация работает в пользу пользователя:** если один и тот же хеш
принадлежит и доступной территории, и недоступной, доступ разрешён. Это
правильно — байты у него и так есть законно.

### Миграция

`services/catalog-service/internal/migrate/migrations/00014_blob_hash_indexes.sql` —
четыре недостающих индекса:

```sql
CREATE INDEX idx_territories_source_blob      ON territories(source_blob_hash);
CREATE INDEX idx_models_source_blob           ON models(source_blob_hash);
CREATE INDEX idx_models_thumbnail_blob        ON models(thumbnail_blob_hash);
CREATE INDEX idx_territory_documents_blob     ON territory_documents(source_blob_hash);
```

Индексы — не преждевременная оптимизация: без них каждый запрос ассета даёт
последовательный скан четырёх таблиц.

### Middleware шлюза

`httpapi.RequireBlobAccess`, монтируется на три маршрута ассета **после**
`Authenticate`:

```go
r.With(authH.Authenticate, apiServer.RequireBlobAccess).Get("/api/assets/{hash}", ...)
```

Поведение повторяет гейт территории и по тем же причинам:

- **404, никогда 403.** 403 подтверждает, что блоб существует.
- **Пустой скоуп у не-Root — отказ.** В каталоге пустой скоуп означает «все
  территории», а не «ни одной».
- Root проходит без запроса в каталог.

`/api/jobs/{id}/events` **не** скоупится этой работой: id задачи — 128-битное
случайное значение, а полезная нагрузка события содержит `kind` и `slug`.
Скоуп потока — отдельный вопрос, и он про другое (задачу, а не блоб).

### Принимаемое свойство

Отзыв доступа **не отбирает уже скачанное**: ассеты отдаются с
`Cache-Control: immutable` на год, поэтому закешированный браузером GLB
продолжит открываться. Это не утечка — байты у человека уже были, — но и не
мгновенный отзыв. Ломать кеш ради этого не стоит: он экономит перекачку 15 МБ.

---

## Часть 2. Сужение CORS

`GATEWAY_ALLOWED_ORIGINS` по умолчанию `*` вместе с `AllowCredentials: true`.
Куку это сейчас не отдаёт — `SameSite=Lax` не пустит её на межсайтовый
подзапрос независимо от заголовков CORS, — но сочетание неопрятно и держится на
одном свойстве куки.

**Ловушка, проверенная по исходникам библиотеки:** передать в `go-chi/cors`
**пустой** список origin — не значит «никого». В `cors.go:131` пустой
`AllowedOrigins` без `AllowOriginFunc` выставляет `allowedOriginsAll = true`,
то есть ровно то, что мы убираем. Обнулить список недостаточно.

Поэтому middleware CORS **не монтируется вовсе**, когда список пуст:

```go
// A same-origin SPA needs no CORS headers at all, and an empty AllowedOrigins
// list does NOT mean "no origins" to go-chi/cors — it means "all" (cors.go:131).
// Not mounting the handler is the only way to say "none".
if origins := cfg.AllowedOrigins; len(origins) > 0 {
    r.Use(cors.Handler(cors.Options{AllowedOrigins: origins, ...}))
}
```

- Дефолт в `config.go` меняется с `[]string{"*"}` на пустой список.
- `resolveOrigins` удаляется — превращать пустой список в `{"*"}` больше не
  нужно, и именно эта функция сегодня и открывает всё по умолчанию.
- `docker-compose.yml` **ничего не задаёт**: локальная разработка одно-origin
  через прокси Vite, CORS ей не нужен. Переменная остаётся способом включить
  его обратно, если появится сторонний потребитель API.

Проверяется тем, что чанковая загрузка продолжает работать: её заголовки
`Upload-Offset` / `Upload-Length` на одном origin видны скрипту без
`ExposedHeaders`, а preflight не отправляется вовсе. Это и есть тест: если
после снятия CORS что-то отвалилось, значит запрос был не одно-origin, и это
надо знать.

---

## Часть 3. CSRF-токен

### Почему не отдельный сервис

Разделение на сервисы в этом проекте идёт по **владению состоянием**: `twofa`
владеет TOTP-секретами под AES-GCM, `passkey` — WebAuthn-credentials, у каждого
свои таблицы и миграции. У CSRF состояния нет: это сравнение двух значений в
рамках одного запроса. Отдельный сервис поставил бы сетевой вызов на горячий
путь каждой мутации и создал новую точку отказа — он лёг, запись встала.

Если бы токен требовал состояния, он принадлежал бы `auth`, который уже владеет
сессиями в Redis. Новый сервис не появился бы и тогда.

### Схема: токен, выводимый из сессии

```
csrf = HMAC-SHA256(GATEWAY_CSRF_SECRET, sessionToken)
```

Шлюз получает оба значения в момент запроса, поэтому хранилище не нужно.
Токен привязан к сессии: его нельзя перенести на чужую, он умирает вместе с
ней, ротация — смена одной переменной окружения.

**Доставка — не куком.** Токен возвращается в теле ответов `POST /api/auth/login`,
`/login/2fa`, `/passkey/login/finish` и в `GET /api/auth/me`. SPA держит его в
памяти модуля и шлёт заголовком `X-CSRF-Token`. Второй куки не заводится:
читаемую куку всё равно пришлось бы открыть скриптам, а так секрет нигде не
лежит между перезагрузками.

### Проверка — только для куки-сессий

Bearer-клиент неуязвим к CSRF по построению: браузер не приложит заголовок
`Authorization` к межсайтовому запросу. Поэтому middleware требует токен
**только когда сессия приехала кукой**:

```go
// A Bearer caller cannot be CSRF'd — a browser will not attach an
// Authorization header to a cross-site request — so requiring the token there
// would break curl, the tests and every integration for no gain.
if !sessionCameFromCookie(r) { next.ServeHTTP(w, r); return }
```

Это снимает главный аргумент против CSRF-токенов: не-браузерные клиенты не
меняются ни на строку.

`sessionToken(r)` придётся расширить, чтобы вызывающий мог узнать источник —
предлагается `sessionTokenFrom(r) (token string, fromCookie bool)`, а
существующий `sessionToken` остаётся тонкой обёрткой над ним, чтобы не трогать
28 мест вызова.

### Область действия

Middleware монтируется на `/api`-подроутер и на `/api/auth/*` и срабатывает на
`POST`/`PUT`/`PATCH`/`DELETE`. Исключения — публичные маршруты входа:
`/api/auth/login`, `/login/2fa`, `/passkey/login/begin`, `/passkey/login/finish`.
У них ещё нет сессии, из которой можно вывести токен, и подделывать вход
бессмысленно.

Отказ — `403` с кодом `forbidden`, не 404: в отличие от гейта территории здесь
нечего скрывать, а внятный код помогает клиенту понять, что нужно перечитать
`/api/auth/me`.

### Что это не защищает

От XSS не защищает ничего из этой схемы: скрипт на странице прочитает токен из
памяти и сделает запрос сам. CSRF-токен закрывает только межсайтовую подделку.
`SameSite=Lax` остаётся первой линией; ценность второй в том, что она переживёт
случайное появление меняющего состояние GET.

### Тест, запрещающий меняющий состояние GET

Правило «состояние меняется только POST/PUT/PATCH/DELETE» записано словами в
`backend/CLAUDE.md` и ничем не проверяется. Добавляется тест, читающий
встроенную спецификацию: ни один документированный `GET` не должен иметь
побочного эффекта — практически проверяется тем, что у GET-операций нет
`requestBody` и они не перечислены в карте разрешений на мутацию.

---

## Тестирование

| Что | Как |
| --- | --- |
| Резолв владения | Storage-тест каталога на реальной базе не заводится: юнит-тест на сервисном слое с minimock + проверка живьём на двух тенантах |
| Гейт ассетов | Suite в `httpapi` по образцу `territory_gate_test.go`: свой хеш 200, чужой 404, хеш модели 200 для всех, Root без запроса в каталог, пустой скоуп отказ |
| CSRF | Suite в `authhttp`: мутация без заголовка 403, с верным 200, с чужим 403, Bearer-сессия проходит без заголовка, публичные маршруты входа проходят |
| Отсутствие меняющих состояние GET | Тест по встроенной спецификации |
| CORS | Ручная проверка чанковой загрузки после сужения |

Живая проверка обязательна и отдельно от тестов — прошлый заход показал, что
тесты и стенд ловят разные классы ошибок. Проверяется на двух Company Owner:
чужой хеш даёт 404, свой 200, модель 200 у обоих, сцена с моделями, панорамами
и PDF грузится целиком.

---

## Вне области

- **Скоуп моделей по тенанту.** Подтверждено, что библиотека общая.
- **Скоуп `/api/jobs/{id}/events`.** Про задачу, а не про блоб.
- **Разрыв immutable-кеша ради мгновенного отзыва.** Принято как свойство.
- **Прод-развёртывание.** Отдельное действие с бэкапом базы.

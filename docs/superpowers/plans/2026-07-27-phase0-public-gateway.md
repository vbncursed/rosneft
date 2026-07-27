# Ф0: Публичный gateway + CORS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать gateway доступным из интернета под TLS на выделенном поддомене с явным CORS-allowlist, чтобы будущий SPA (веб + Tauri/Electron) мог ходить в него напрямую с `Authorization: Bearer`.

**Architecture:** Reverse-proxy (тот, что уже слушает :80/:443 на проде) добавляет vhost `api.<домен>` → внутренний `gateway:8080`. Порт `8080` наружу остаётся закрытым firewall'ом. CORS в gateway уже полностью настроен в коде — меняем только список origins с `*` на явный. SSE-эндпоинт уже неаутентифицирован и стоит до CORS-мидлвари, поэтому cross-origin EventSource работает без правок.

**Tech Stack:** Go (go-chi/cors, уже подключён), Docker Compose, прод reverse-proxy (nginx/caddy/traefik — какой стоит на проде), TLS (Let's Encrypt или существующий механизм прода).

## Global Constraints

- Бренд в отображаемом тексте — «Andrey», не «Rosneft»/«Роснефть» (структурные lowercase-пути `rosneft` остаются).
- Прод: `/opt/rosneft`, compose-проект `andrey` — все команды compose с `-p andrey`.
- На проде есть **неотслеживаемый** `docker-compose.override.yml` — все прод-правки env идут туда, не в базовый `docker-compose.yml` (базовый — для локали).
- **Ноль нового кода в gateway** для этой фазы: CORS-конфиг уже корректен, меняется только значение origins и прод-инфра. Если план требует правку `.go` — это ошибка плана.

---

## Предпосылки (обнаружено при планировании)

- CORS-мидлварь: `backend/services/gateway-service/internal/bootstrap/transport.go:57`. Уже содержит `AllowedHeaders: [Content-Type, If-None-Match, Authorization]`, `ExposedHeaders: [ETag, Content-Length, Content-Range, X-Next-Cursor]`, все методы + OPTIONS, `AllowCredentials: true`. Origins берутся из `cfg.AllowedOrigins` → `resolveOrigins()` (пустой/`*` → `["*"]`).
- Origins задаются env `GATEWAY_ALLOWED_ORIGINS` (базовый compose: `docker-compose.yml:59` = `"*"`). Флаг: `main.go:42` `--allowed-origins`.
- SSE `/api/jobs/{id}/events` регистрируется на корневом роутере (`transport.go:90`) **вне** группы `Authenticate` (группа с строки 98). То есть токен для SSE не проверяется уже сегодня — это не регрессия, менять не нужно.
- Gateway публикует `8080:8080` в базовом compose (`docker-compose.yml:64-65`); на проде внешний доступ к :8080 должен оставаться закрытым firewall'ом.

## Вне области (осознанно не делаем)

- **Аутентификация SSE.** Эндпоинт неаутентифицирован сегодня; миграция не меняет этот posture. Отдельный вопрос безопасности вне этой фазы — job ID должен быть неугадываемым (проверить, что это UUID, — Task 6).
- Правки Electron/Tauri origin — это Ф5. Здесь в allowlist кладём web-origin + `tauri://localhost` как задел; уточним per-wrapper позже.

---

## Task 1: Зафиксировать публичные origins (единственный вход-блокер)

Ф0 нельзя исполнить, не зная домена. Эта задача — собрать и записать два точных значения, которые протянутся во все следующие шаги.

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-phase0-public-gateway.md` (вписать реальные значения вместо `<WEB_ORIGIN>` / `<API_ORIGIN>` ниже)

**Interfaces:**
- Produces:
  - `<WEB_ORIGIN>` — origin, с которого браузер веба будет ходить в gateway (напр. `https://andrey.example.com`). Именно **origin** (scheme+host, без пути, без слэша).
  - `<API_ORIGIN>` — публичный origin самого gateway (напр. `https://api.andrey.example.com`).
  - `<API_HOST>` — host из `<API_ORIGIN>` (напр. `api.andrey.example.com`).

- [ ] **Step 1: Получить у владельца прода два факта**

Ответить на:
1. Какой публичный домен у сайта сейчас (что отвечает на :443/:80 прода)? → это база для `<WEB_ORIGIN>`.
2. Под каким host выставляем gateway? Рекомендация — поддомен `api.<тот же домен>` → `<API_ORIGIN>`.

- [ ] **Step 2: Вписать значения в этот план**

Заменить во всём файле `<WEB_ORIGIN>`, `<API_ORIGIN>`, `<API_HOST>` на реальные строки. Проверить: `<WEB_ORIGIN>` без завершающего `/`, без пути.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-27-phase0-public-gateway.md
git commit -m "docs(spa/phase0): record concrete public origins for gateway"
```

---

## Task 2: DNS + reverse-proxy vhost для `<API_HOST>` с TLS

Публикуем gateway наружу через уже работающий на проде reverse-proxy. Точная конфигурация зависит от того, какой прокси стоит (nginx/caddy/traefik) — шаги даны как runbook с проверкой результата, не как правка конкретного файла репозитория.

**Files:**
- Prod (вне репо): конфиг reverse-proxy на проде (vhost/route для `<API_HOST>`), прод `docker-compose.override.yml` при необходимости.

**Interfaces:**
- Consumes: `<API_HOST>`, `<API_ORIGIN>` из Task 1.
- Produces: `<API_ORIGIN>/readyz` отвечает 200 из интернета под валидным TLS.

- [ ] **Step 1: DNS**

Завести A/AAAA-запись `<API_HOST>` → внешний IP прода (тот же, что у сайта). Дождаться распространения.

Проверка:
```bash
dig +short <API_HOST>
```
Ожидается: внешний IP прода.

- [ ] **Step 2: Vhost в reverse-proxy**

На проде добавить в reverse-proxy маршрут: `<API_HOST>` (:443, TLS) → `http://gateway:8080` (внутренняя docker-сеть проекта `andrey`).

Требования к vhost (важно для SSE — иначе стрим буферизуется):
- `proxy_buffering off;` (nginx) / эквивалент — чтобы SSE-кадры уходили сразу. Gateway уже шлёт `X-Accel-Buffering: no`, но vhost должен это уважать.
- Не резать `Authorization` заголовок.
- Долгие таймауты для стрима (read timeout ≥ несколько минут).

Перезагрузить reverse-proxy.

- [ ] **Step 3: Проверить публичный доступ + TLS**

```bash
curl -sS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" <API_ORIGIN>/readyz
```
Ожидается: `200 0` (200 OK, TLS verify = 0/ок).

- [ ] **Step 4: Commit (если менялись отслеживаемые файлы)**

Если vhost/override лежат в репозитории — закоммитить. Если это прод-only untracked — зафиксировать факт в разделе deploy-доков:
```bash
git add -A && git commit -m "chore(spa/phase0): expose gateway at <API_HOST> via reverse proxy" || echo "no tracked changes"
```

---

## Task 3: Сузить CORS до явного allowlist

Меняем `GATEWAY_ALLOWED_ORIGINS` с `*` на явный список. Код не трогаем.

**Files:**
- Modify: `docker-compose.yml:59` (локаль — можно оставить `*` для dev, см. ниже)
- Prod (вне репо): `docker-compose.override.yml` env `GATEWAY_ALLOWED_ORIGINS`

**Interfaces:**
- Consumes: `<WEB_ORIGIN>` из Task 1.
- Produces: preflight на gateway отражает `<WEB_ORIGIN>`, а не `*`.

- [ ] **Step 1: Прод-значение**

В прод `docker-compose.override.yml` для сервиса `gateway` задать:
```yaml
    environment:
      GATEWAY_ALLOWED_ORIGINS: "<WEB_ORIGIN>,tauri://localhost"
```
(`tauri://localhost` — задел под планшет; web-origin — основной. Electron уточним в Ф5.)

- [ ] **Step 2: Локаль (dev)**

`docker-compose.yml:59` для локальной разработки оставить `"*"` — dev-фронт крутится на разных портах (`yarn dev`), явный список мешал бы. Это осознанно; прод переопределяет через override.

- [ ] **Step 3: Перезапустить gateway на проде**

```bash
cd /opt/rosneft && docker compose -p andrey up -d gateway
```

- [ ] **Step 4: Проверить preflight отражает конкретный origin**

```bash
curl -sS -D - -o /dev/null -X OPTIONS <API_ORIGIN>/api/territories \
  -H "Origin: <WEB_ORIGIN>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```
Ожидается в ответе:
- `Access-Control-Allow-Origin: <WEB_ORIGIN>` (именно он, не `*`)
- `Access-Control-Allow-Headers` содержит `Authorization`
- `Access-Control-Allow-Methods` содержит `GET`

- [ ] **Step 5: Проверить, что чужой origin отклоняется**

```bash
curl -sS -D - -o /dev/null -X OPTIONS <API_ORIGIN>/api/territories \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET"
```
Ожидается: **нет** заголовка `Access-Control-Allow-Origin: https://evil.example.com` (go-chi/cors не отражает неразрешённый origin).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(spa/phase0): document explicit CORS origins (prod via override)"
```

---

## Task 4: Проверить cross-origin SSE напрямую (без прокси)

Убедиться, что EventSource из будущего SPA сможет открыть стрим напрямую в gateway с CORS-заголовками.

**Files:** нет (проверка).

**Interfaces:**
- Consumes: `<API_ORIGIN>`, `<WEB_ORIGIN>`.
- Produces: подтверждение, что SSE отдаёт `text/event-stream` + ACAO cross-origin.

- [ ] **Step 1: Запрос SSE cross-origin с фейковым job id**

```bash
curl -sS -N -D - --max-time 3 <API_ORIGIN>/api/jobs/00000000-0000-0000-0000-000000000000/events \
  -H "Origin: <WEB_ORIGIN>"
```
Ожидается:
- `Content-Type: text/event-stream`
- `Access-Control-Allow-Origin: <WEB_ORIGIN>`
- В теле — `event: error` с `job not found` (job фейковый) ИЛИ таймаут после keepalive. Оба означают, что стрим открылся и CORS отдан.

- [ ] **Step 2: Зафиксировать наблюдение**

Записать в лог фазы, что SSE cross-origin работает без токена (совпадает с текущим prod-поведением). Кода не менять.

---

## Task 5: Подтвердить, что :8080 закрыт наружу

Публичен только `<API_ORIGIN>` (443 через proxy); сырой `8080` не должен торчать в интернет.

**Files:** нет (проверка).

- [ ] **Step 1: Проверить недоступность :8080 снаружи**

С машины ВНЕ прод-сети:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 8 http://<API_HOST>:8080/readyz || echo "unreachable (ожидаемо)"
```
Ожидается: таймаут / `unreachable` / connection refused. Если вернулось `200` — firewall открыт, **закрыть :8080** на хост-firewall/облачной security-group (оставить снаружи только 443).

- [ ] **Step 2: Подтвердить, что внутренний доступ жив**

На прод-хосте:
```bash
cd /opt/rosneft && docker compose -p andrey exec gateway wget -qO- http://localhost:8080/readyz && echo OK
```
Ожидается: `OK`.

---

## Task 6: Проверить неугадываемость job ID (санити безопасности SSE)

Раз SSE неаутентифицирован, единственная защита стрима — неугадываемый job ID. Убедиться, что это UUID/рандом, а не инкремент.

**Files:** нет (проверка/чтение).

- [ ] **Step 1: Посмотреть, как генерится job id**

```bash
grep -rniE "job.*id|NewJob|uuid|ulid" backend/services --include="*.go" | grep -iE "uuid|ulid|random|New\(" | head
```
Ожидается: job id = UUID/ULID (неугадываемый). Если это последовательный int — завести follow-up на аутентификацию SSE (вне Ф0), т.к. перебор ID стал бы возможен из интернета.

- [ ] **Step 2: Зафиксировать вывод**

Записать в лог фазы: job id неугадываем → неаутентифицированный SSE наружу приемлем на время Ф0–Ф5. Иначе — создать issue на scoped-токен для SSE.

---

## Self-Review

- **Покрытие спека (секция 2 «Auth и gateway» / Ф0):** публичный `api.<домен>` + TLS (Task 2), CORS-origins явные (Task 3), SSE cross-origin (Task 4), :8080 закрыт (Task 5). SSE-токен-из-query из спека **снят** — обосновано находкой, что эндпоинт уже неаутентифицирован; добавлена вместо него санити-проверка job id (Task 6). ✓
- **Плейсхолдеры:** `<WEB_ORIGIN>`/`<API_ORIGIN>`/`<API_HOST>` — намеренные входные значения, закрываются Task 1 первым шагом; не оставлены в требованиях как TBD. ✓
- **Тип-консистентность:** имена env (`GATEWAY_ALLOWED_ORIGINS`), пути (`transport.go:57/90`, `docker-compose.yml:59`), команды (`-p andrey`) сверены с реальными файлами. ✓
- **Код в gateway:** ноль правок `.go` — соответствует Global Constraints. ✓

## Примечание о характере фазы

Это инфраструктурно-конфигурационная фаза: проверки — `curl`/`dig`/`docker compose exec`, а не unit-тесты, потому что deliverable — сетевая доступность и CORS-поведение, которые нельзя осмысленно покрыть тестом внутри репозитория. Содержательные TDD-планы с кодом начинаются с **Ф1** (Vite-скаффолд + token-store + api-client).

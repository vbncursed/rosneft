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

## Task 1: Зафиксировать публичные origins (единственный вход-блокер) ✅ DONE

Значения зафиксированы (2026-07-27):

- `WEB_ORIGIN` = `https://andrey.vbncursed.fun` — origin браузерного веба.
- `API_ORIGIN` = `https://api.andrey.vbncursed.fun` — публичный origin gateway.
- `API_HOST` = `api.andrey.vbncursed.fun` — host из API_ORIGIN.

- [x] **Step 1:** домен получен от владельца прода.
- [x] **Step 2:** значения вписаны во все шаги ниже.
- [x] **Step 3:** закоммичено.

---

## Task 2: DNS + reverse-proxy vhost для `api.andrey.vbncursed.fun` с TLS

Публикуем gateway наружу через уже работающий на проде reverse-proxy. Точная конфигурация зависит от того, какой прокси стоит (nginx/caddy/traefik) — шаги даны как runbook с проверкой результата, не как правка конкретного файла репозитория.

**Files:**
- Prod (вне репо): конфиг reverse-proxy на проде (vhost/route для `api.andrey.vbncursed.fun`), прод `docker-compose.override.yml` при необходимости.

**Interfaces:**
- Consumes: `api.andrey.vbncursed.fun`, `https://api.andrey.vbncursed.fun` из Task 1.
- Produces: `https://api.andrey.vbncursed.fun/readyz` отвечает 200 из интернета под валидным TLS.

- [ ] **Step 1: DNS**

Завести A/AAAA-запись `api.andrey.vbncursed.fun` → внешний IP прода (тот же, что у сайта). Дождаться распространения.

Проверка:
```bash
dig +short api.andrey.vbncursed.fun
```
Ожидается: внешний IP прода.

- [ ] **Step 2: Vhost в reverse-proxy**

На проде добавить в reverse-proxy маршрут: `api.andrey.vbncursed.fun` (:443, TLS) → `http://gateway:8080` (внутренняя docker-сеть проекта `andrey`).

Требования к vhost (важно для SSE — иначе стрим буферизуется):
- `proxy_buffering off;` (nginx) / эквивалент — чтобы SSE-кадры уходили сразу. Gateway уже шлёт `X-Accel-Buffering: no`, но vhost должен это уважать.
- Не резать `Authorization` заголовок.
- Долгие таймауты для стрима (read timeout ≥ несколько минут).

Перезагрузить reverse-proxy.

- [ ] **Step 3: Проверить публичный доступ + TLS**

```bash
curl -sS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://api.andrey.vbncursed.fun/readyz
```
Ожидается: `200 0` (200 OK, TLS verify = 0/ок).

- [ ] **Step 4: Commit (если менялись отслеживаемые файлы)**

Если vhost/override лежат в репозитории — закоммитить. Если это прод-only untracked — зафиксировать факт в разделе deploy-доков:
```bash
git add -A && git commit -m "chore(spa/phase0): expose gateway at api.andrey.vbncursed.fun via reverse proxy" || echo "no tracked changes"
```

---

## Task 3: Сузить CORS до явного allowlist

Меняем `GATEWAY_ALLOWED_ORIGINS` с `*` на явный список. Код не трогаем.

**Files:**
- Modify: `docker-compose.yml:59` (локаль — можно оставить `*` для dev, см. ниже)
- Prod (вне репо): `docker-compose.override.yml` env `GATEWAY_ALLOWED_ORIGINS`

**Interfaces:**
- Consumes: `https://andrey.vbncursed.fun` из Task 1.
- Produces: preflight на gateway отражает `https://andrey.vbncursed.fun`, а не `*`.

- [ ] **Step 1: Прод-значение**

В прод `docker-compose.override.yml` для сервиса `gateway` задать:
```yaml
    environment:
      GATEWAY_ALLOWED_ORIGINS: "https://andrey.vbncursed.fun,tauri://localhost"
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
curl -sS -D - -o /dev/null -X OPTIONS https://api.andrey.vbncursed.fun/api/territories \
  -H "Origin: https://andrey.vbncursed.fun" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```
Ожидается в ответе:
- `Access-Control-Allow-Origin: https://andrey.vbncursed.fun` (именно он, не `*`)
- `Access-Control-Allow-Headers` содержит `Authorization`
- `Access-Control-Allow-Methods` содержит `GET`

- [ ] **Step 5: Проверить, что чужой origin отклоняется**

```bash
curl -sS -D - -o /dev/null -X OPTIONS https://api.andrey.vbncursed.fun/api/territories \
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
- Consumes: `https://api.andrey.vbncursed.fun`, `https://andrey.vbncursed.fun`.
- Produces: подтверждение, что SSE отдаёт `text/event-stream` + ACAO cross-origin.

- [ ] **Step 1: Запрос SSE cross-origin с фейковым job id**

```bash
curl -sS -N -D - --max-time 3 https://api.andrey.vbncursed.fun/api/jobs/00000000-0000-0000-0000-000000000000/events \
  -H "Origin: https://andrey.vbncursed.fun"
```
Ожидается:
- `Content-Type: text/event-stream`
- `Access-Control-Allow-Origin: https://andrey.vbncursed.fun`
- В теле — `event: error` с `job not found` (job фейковый) ИЛИ таймаут после keepalive. Оба означают, что стрим открылся и CORS отдан.

- [ ] **Step 2: Зафиксировать наблюдение**

Записать в лог фазы, что SSE cross-origin работает без токена (совпадает с текущим prod-поведением). Кода не менять.

---

## Task 5: Подтвердить, что :8080 закрыт наружу

Публичен только `https://api.andrey.vbncursed.fun` (443 через proxy); сырой `8080` не должен торчать в интернет.

**Files:** нет (проверка).

- [ ] **Step 1: Проверить недоступность :8080 снаружи**

С машины ВНЕ прод-сети:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" --max-time 8 http://api.andrey.vbncursed.fun:8080/readyz || echo "unreachable (ожидаемо)"
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
- **Плейсхолдеры:** `https://andrey.vbncursed.fun`/`https://api.andrey.vbncursed.fun`/`api.andrey.vbncursed.fun` — намеренные входные значения, закрываются Task 1 первым шагом; не оставлены в требованиях как TBD. ✓
- **Тип-консистентность:** имена env (`GATEWAY_ALLOWED_ORIGINS`), пути (`transport.go:57/90`, `docker-compose.yml:59`), команды (`-p andrey`) сверены с реальными файлами. ✓
- **Код в gateway:** ноль правок `.go` — соответствует Global Constraints. ✓

## Примечание о характере фазы

Это инфраструктурно-конфигурационная фаза: проверки — `curl`/`dig`/`docker compose exec`, а не unit-тесты, потому что deliverable — сетевая доступность и CORS-поведение, которые нельзя осмысленно покрыть тестом внутри репозитория. Содержательные TDD-планы с кодом начинаются с **Ф1** (Vite-скаффолд + token-store + api-client).

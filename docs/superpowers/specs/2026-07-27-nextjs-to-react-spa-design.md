# Дизайн: миграция Next.js → React SPA (Vite) под Tauri

Дата: 2026-07-27

## Цель

Убрать Next.js и оставить чистый React-SPA, собираемый Vite в статику, чтобы
его могли бандлить Tauri (планшеты, будущее) и текущий Electron-десктоп. Одно
приложение обслуживает и веб, и нативные обёртки.

**Область сейчас:** online-only. Приложению всегда доступна сеть; данные и
3D-ассеты тянутся из gateway по сети. Оффлайн-кэш и синхронизация — **отдельная
будущая фаза, не входит в этот дизайн.**

## Граничные условия (зафиксированы в брейншторме)

- Next.js удаляется полностью (сервер, RSC, API-роуты, middleware, cookie-auth).
- Авторизация: **токен напрямую в публичный gateway** (не proxy). Gateway уже
  отдаёт токен в теле `/api/auth/login`; httpOnly-кука была надстройкой Next-BFF.
- Стек: **Vite + TanStack Router (data router, loaders) + TanStack Query +
  единый `api-client` с токеном.**
- Стратегия исполнения: **инкрементальный strangler на ветке `spa`**, прод на
  `main` (Next) не трогаем до cut-over.

## Почему это меньше, чем кажется

Clean Architecture окупается: `domain/`, `application/`,
`infrastructure/*-gateway.ts` фреймворк-независимы и переезжают почти без правок.
`presentation/`-компоненты уже клиентские. Переписывается по сути только `app/`
(роутинг + RSC-фетчинг + `api/`), точка сборки и auth-слой.

Gateway уже умеет CORS (`--allowed-origins`, сейчас `*`) — выставить наружу это
конфиг reverse-proxy + firewall + список origin'ов, **ноль нового кода на бэке**
(кроме мелочи для SSE, см. ниже).

---

## 1. Целевая архитектура

Одно React-приложение, `vite build` → `dist/` (статика). Веб отдаёт статику через
reverse-proxy (SPA-fallback на `index.html`); Tauri/Electron бандлят ту же `dist/`.

### Умирает (чистая делеция)

- `src/app/api/**` — весь прокси и auth-роуты: `[...path]/route.ts`,
  `auth/login/route.ts`, `auth/login/2fa/route.ts`, `auth/logout/route.ts`,
  `auth/passkey/login/{begin,finish}/route.ts`, `metrics/query/route.ts`.
- `src/proxy.ts` — Next middleware (гард приватных роутов).
- `src/auth/infrastructure/session-cookie.ts` — httpOnly-куки.
- Серверная ветка в `src/shared/infrastructure/http/client.ts`
  (`typeof window === "undefined"`, `import("next/headers")`,
  `import("next/navigation")`).
- Next-конвенции: `next.config.*`, `template.tsx`, `*/loading.tsx`, `layout.tsx`
  как RSC-layout.

### Рождается

- `index.html` + `src/main.tsx` (Vite entry, монтирует `RouterProvider`).
- `src/routes/` — дерево TanStack Router.
- `src/auth/infrastructure/token-store.ts` — токен за одним интерфейсом:
  `localStorage` в вебе, Tauri secure store на планшете (реализация выбирается по
  наличию Tauri API; Electron использует localStorage-ветку).
- Упрощённый `api-client` (см. секцию 4).

### Не трогаем

Всё под `domain/`, `application/`, `infrastructure/*-gateway.ts`,
`presentation/`. Гейтвеи вызываются теперь из loader'ов/квери, а не из RSC.

---

## 2. Auth и gateway

### Поток логина (SPA → gateway напрямую)

1. `POST https://api.<домен>/api/auth/login` `{identifier, password}` →
   `{token, twoFactorRequired, challengeToken}`.
2. Если `twoFactorRequired` — `POST /api/auth/login/2fa` с `challengeToken` →
   `{token}`.
3. Passkey — `POST /api/auth/passkey/login/begin` → WebAuthn → `.../finish` →
   `{token}`. (В Electron/Tauri passkey скрыт, как сейчас.)
4. Токен → `token-store`.

### Запросы

- `api-client` вешает `Authorization: Bearer <token>` на каждый запрос.
- `401` → `token-store.clear()` + `router.navigate("/login?next=...")`.

### SSE (`/api/jobs/{id}/events`)

`EventSource` не умеет кастомные заголовки. Решение: **gateway учится читать токен
из query** (`?access_token=<token>`) в дополнение к `Authorization` — небольшая
правка middleware аутентификации gateway. SPA открывает
`new EventSource(\`${API}/api/jobs/${id}/events?access_token=${token}\`)`.

### Инфраструктура

- Поддомен `api.<домен>` через reverse-proxy → `gateway:8080`, TLS на 443.
- `--allowed-origins` = origin веба + `tauri://localhost` + Electron-origin.
- Порт `8080` наружу остаётся закрытым firewall'ом; публичен только 443 через
  proxy. (Это заодно чинит текущий сломанный десктоп-auth — Electron перестаёт
  ломиться в firewalled `8080`.)

### Компромисс безопасности (осознанный)

Токен в JS уязвим к XSS (у httpOnly-куки этого нет). Для внутреннего инструмента
за логином приемлемо. Смягчение: строгий CSP; на планшете — Tauri secure store.

---

## 3. Роутинг (TanStack Router)

Дерево повторяет текущую карту:

```
/                                  territories + models grid
/login   /account   /offline
/territories   /territories/new   /territories/:slug
/territories/:slug/replace
/territories/:slug/documents/new
/territories/:slug/panoramas/new
/models   /models/new   /models/:slug
/admin
/admin/{content,metrics,roles,territories,users}
```

- **Гард приватных роутов:** `beforeLoad` на защищённой ветке дёргает
  `getCurrentUser()` (по токену); нет токена/401 → `redirect({ to: "/login",
  search: { next } })`. Заменяет `proxy.ts`.
- **Первичная загрузка:** роут-`loader` вызывает соответствующий гейтвей-метод и
  прогревает queryClient (`ensureQueryData`), чтобы страница не мигала скелетом.

---

## 4. Слой данных

**TanStack Query** вместо RSC-фетчинга.

- Каждая бывшая RSC-страница (`const x = await getX()`) → `loader`
  (`queryClient.ensureQueryData`) + `useQuery` в компоненте. Один источник, кэш
  переиспользуется CRUD-мутациями (как сейчас `usePlacementsEditor`).
- `getSceneBundle`, `listTerritories`, `listModels`, admin-запросы — те же
  функции гейтвеев, без изменений сигнатур.

### Упрощённый `api-client` (`src/shared/infrastructure/http/client.ts`)

Схлопывается в один путь (только браузер):

- base-URL = `import.meta.env.VITE_API_URL` (абсолютный).
- `Authorization: Bearer` из `token-store` на каждый вызов.
- `401` → `token-store.clear()` + редирект на `/login`.
- Убирается вся серверная ветка (`typeof window`, `next/headers`,
  `next/navigation`), декодирование content-encoding (это делал proxy — теперь
  браузер сам), логика двойного base-URL.
- Публичный интерфейс (`httpGet/Post/Put/Patch/Delete`) и обработка ошибок
  (`HttpError`, `{code,message}` / `{error}`) сохраняются — вызывающий код не
  меняется.

---

## 5. Next-специфика → SPA-эквиваленты

| Сейчас (Next) | Становится |
|---|---|
| `icon.tsx`, `apple-icon.tsx` (динамическая генерация) | статические PNG в `public/`; переиспользуем существующий скрипт генерации иконки desktop |
| `manifest.ts` | статический `public/manifest.webmanifest` |
| `sw-register.tsx` + service worker | остаётся; `vite-plugin-pwa` для генерации SW (точка расширения под будущий оффлайн-кэш) |
| `layout.tsx` metadata | статический `<head>` в `index.html`; per-route title при необходимости — минимально |
| `template.tsx` (motion-переход) | обёртка вокруг `<Outlet/>` с `motion` (из `@/shared/presentation/motion/`) |

---

## 6. Сборка и деплой

- `vite build` → `dist/`. Tauri/Electron указывают на неё.
- **Прод-веб:** reverse-proxy отдаёт `dist/` как статику + SPA-fallback
  (`try_files … /index.html`). Next-процесс исчезает из деплоя.
- **Env:** `VITE_API_URL=https://api.<домен>` вшивается в билд. Electron/Tauri
  используют то же значение (заменяет текущий хардкод `85.192.26.113:8080`).

---

## 7. Порядок работ (strangler, ветка `spa`)

Прод (`main`, Next) не трогаем до cut-over. SPA растёт на ветке `spa`; CI деплоит
её билд на **preview-origin** против уже публичного gateway. Каждая фаза —
отдельный ревьюабельный PR в `spa`, и **отдельный план** (`writing-plans`).

- **Ф0. Инфра.** Выставить gateway (`api.<домен>`, TLS, CORS-origins). SSE:
  токен из query. Разблокирует заодно и десктоп.
- **Ф1. Скаффолд.** Vite + `index.html` + `main.tsx`; `token-store`;
  браузер-only `api-client`; TanStack Router с одним публичным роутом (`/login`)
  end-to-end против gateway.
- **Ф2. Каркас.** Приватный гард (`beforeLoad` + `getCurrentUser`); TanStack
  Query provider; общий layout/навигация; motion-обёртка перехода.
- **Ф3. Перенос роутов пачками.** Сначала viewer (`/territories/:slug` — самый
  тяжёлый: SceneBundle, placements, measure, gizmo). Потом списки и аплоады
  (`/`, `/territories`, `/models`, `*/new`, `replace`, `documents`, `panoramas`).
  Потом admin (`/admin/*`) и `/account`.
- **Ф4. PWA-слой.** Иконки, manifest, service worker через `vite-plugin-pwa`,
  offline-роут.
- **Ф5. Cut-over.** Flip reverse-proxy на статику; слить `spa`→`main`; удалить
  Next (`app/api`, `proxy.ts`, `session-cookie`, next-зависимости,
  `next.config`). Перенацелить Electron на env; добавить Tauri-обёртку.

---

## 8. Отложено / риски

- **Оффлайн-кэш и синхронизация** — отдельная будущая фаза. Каркас
  `vite-plugin-pwa` (Ф4) оставляет точку расширения.
- **Токен в JS / XSS** — осознанный компромисс (секция 2). Смягчение: CSP, Tauri
  secure store.
- **Масштаб** — большой дизайн; фазы Ф0–Ф5 декомпозируются в отдельные планы, не
  один спек.
- **SSE-токен в query** попадает в логи gateway/proxy при неаккуратном
  логировании URL — на Ф0 убедиться, что query не пишется в access-логи, либо
  использовать короткоживущий scoped-токен для SSE.

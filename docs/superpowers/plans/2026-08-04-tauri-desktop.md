# Десктоп-клиент на Tauri v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать `desktop/` — приложение на Tauri v2, которое отдаёт существующий SPA через локальный reverse-proxy с дисковым кэшем ассетов, и работает на macOS, Linux и Windows.

**Architecture:** Rust-процесс поднимает axum-сервер на `127.0.0.1:0`, отдаёт встроенный `frontend/dist` через `app.asset_resolver()` и проксирует `/api/*` на прод-gateway. Вебвью открывается на этот адрес, поэтому фронтенд остаётся single-origin и не переписывается. Вся логика живёт в чистых модулях, покрытых `cargo test`; `main.rs` — только склейка, потому что `tauri::App` в тестах не построить.

**Tech Stack:** Rust 2021, tauri 2, axum 0.8, tower-http 0.6 (`fs`), reqwest 0.12 (`stream`, `cookies`), tokio 1, keyring 3, sha2, hex, rand, async-stream.

**Спека:** [`docs/superpowers/specs/2026-08-04-tauri-desktop-design.md`](../specs/2026-08-04-tauri-desktop-design.md)

## Global Constraints

- Бэкенд не меняется. Ни один файл под `backend/` не трогается.
- Фронтенд меняется только в трёх файлах Task 7. `VITE_API_URL` остаётся пустым.
- Апстрим по умолчанию `https://andrey.vbncursed.fun`, переопределяется переменной окружения `DESKTOP_UPSTREAM`.
- Сервер слушает **только** `127.0.0.1`, порт эфемерный (`:0`).
- Кэш никогда не роняет приложение: любая ошибка файловой системы отключает кэш, а не запрос.
- Ошибки в формате бэкенда: `{"code": "...", "message": "..."}` — иначе `client.ts` покажет «Request failed».
- `{hash}` из URL валидируется как 64 символа `[0-9a-f]` до любого касания ФС.
- В коде и коммитах — английский, как в остальном репозитории. Комментарии объясняют «почему», а не «что».
- Каждая задача заканчивается коммитом. Ветка `feat/tauri-desktop`, PR в `main`.

---

## Структура файлов

| файл | ответственность |
| --- | --- |
| `desktop/src-tauri/Cargo.toml` | зависимости |
| `desktop/src-tauri/tauri.conf.json` | окно, бандл, `frontendDist` |
| `desktop/src-tauri/build.rs` | `tauri_build::build()` |
| `desktop/src-tauri/src/main.rs` | Tauri Builder, `setup()`, склейка |
| `desktop/src-tauri/src/state.rs` | `AppState` — общее состояние сервера |
| `desktop/src-tauri/src/spa.rs` | чистая классификация путей статики |
| `desktop/src-tauri/src/guard.rs` | nonce-кука |
| `desktop/src-tauri/src/session.rs` | keychain: токен + `user_id` |
| `desktop/src-tauri/src/proxy.rs` | форвардинг `/api/**` |
| `desktop/src-tauri/src/paths.rs` | пользовательский корень кэша |
| `desktop/src-tauri/src/cache.rs` | дисковый кэш блобов |
| `desktop/src-tauri/src/evict.rs` | LRU-вытеснение |
| `desktop/src-tauri/src/snapshot.rs` | stale-if-error для JSON |
| `desktop/src-tauri/src/server.rs` | сборка axum-роутера |
| `desktop/Makefile` | `make check` = fmt + clippy + test |
| `desktop/README.md` | сборка и ручной чеклист по трём ОС |

---

## Task 1: Скелет, статика, окно

**Files:**
- Create: `desktop/src-tauri/Cargo.toml`, `desktop/src-tauri/build.rs`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/src/main.rs`, `desktop/src-tauri/src/spa.rs`, `desktop/src-tauri/src/server.rs`, `desktop/src-tauri/src/state.rs`
- Create: `desktop/.gitignore`

**Interfaces:**
- Produces: `spa::Route` (`Asset(String) | Index | NotFound`), `spa::classify(path: &str) -> Route`; `state::AppState`; `server::router(state: AppState) -> axum::Router`; `server::spawn(state: AppState) -> std::io::Result<std::net::SocketAddr>`

**Предусловие.** Rust на машине не установлен (`cargo not found`). Ставится один раз:
`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.
Системные зависимости Tauri по ОС — [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/); на macOS достаточно Xcode CLT.

- [ ] **Step 1: Создать ветку**

```bash
git checkout main && git pull && git checkout -b feat/tauri-desktop
```

- [ ] **Step 2: Создать `desktop/src-tauri/Cargo.toml`**

```toml
[package]
name = "andrey-desktop"
version = "0.1.0"
edition = "2021"
rust-version = "1.77"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
axum = "0.8"
tower-http = { version = "0.6", features = ["fs"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "io-util", "net"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "stream", "cookies"] }
async-stream = "0.3"
futures-util = "0.3"
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
hex = "0.4"
rand = "0.9"
url = "2"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Создать `desktop/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Создать `desktop/src-tauri/tauri.conf.json`**

`app.windows` — пустой массив намеренно: окно создаётся в `setup()`, когда порт сервера уже известен. Если оставить окно в конфиге, Tauri откроет его до старта сервера и покажет ошибку.

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Andrey",
  "version": "0.1.0",
  "identifier": "fun.vbncursed.andrey.desktop",
  "build": {
    "frontendDist": "../../frontend/dist",
    "beforeBuildCommand": "yarn --cwd ../../frontend build",
    "beforeDevCommand": "yarn --cwd ../../frontend build"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "appimage", "nsis"],
    "icon": ["icons/icon.png"]
  }
}
```

- [ ] **Step 5: Создать `desktop/.gitignore`**

```
src-tauri/target/
src-tauri/gen/
```

- [ ] **Step 6: Написать падающий тест классификации путей**

Создать `desktop/src-tauri/src/spa.rs` с одними тестами:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_is_index() {
        assert_eq!(classify("/"), Route::Index);
    }

    #[test]
    fn file_with_extension_is_an_asset() {
        assert_eq!(classify("/assets/index-a1b2.js"), Route::Asset("assets/index-a1b2.js".into()));
        assert_eq!(classify("/draco/draco_decoder.wasm"), Route::Asset("draco/draco_decoder.wasm".into()));
        assert_eq!(classify("/pdfjs/web/viewer.html"), Route::Asset("pdfjs/web/viewer.html".into()));
    }

    // Deep router paths must fall back to index.html, or a reload on
    // /territories/foo would 404 instead of re-entering the SPA.
    #[test]
    fn extensionless_path_falls_back_to_index() {
        assert_eq!(classify("/territories/dji-wp-46"), Route::Index);
        assert_eq!(classify("/admin/users"), Route::Index);
    }

    // The service worker only caches an offline screen and is useless in the
    // shell; main.tsx already swallows a failed registration.
    #[test]
    fn service_worker_is_refused() {
        assert_eq!(classify("/sw.js"), Route::NotFound);
    }
}
```

- [ ] **Step 7: Убедиться, что тест не компилируется**

Run: `cd desktop/src-tauri && cargo test spa`
Expected: FAIL — `cannot find function classify`

- [ ] **Step 8: Реализовать `classify`**

Добавить в начало `desktop/src-tauri/src/spa.rs`:

```rust
#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    /// Path relative to the embedded dist root, no leading slash.
    Asset(String),
    Index,
    NotFound,
}

pub fn classify(path: &str) -> Route {
    let trimmed = path.trim_start_matches('/');
    if trimmed == "sw.js" {
        return Route::NotFound;
    }
    if trimmed.is_empty() {
        return Route::Index;
    }
    // An extension in the last segment means a real file. Everything else is a
    // router path, and the router only exists once index.html has loaded.
    match trimmed.rsplit('/').next() {
        Some(last) if last.contains('.') => Route::Asset(trimmed.to_string()),
        _ => Route::Index,
    }
}
```

- [ ] **Step 9: Тест проходит**

Run: `cargo test spa`
Expected: PASS, 4 теста

- [ ] **Step 10: Создать `desktop/src-tauri/src/state.rs`**

```rust
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use url::Url;

#[derive(Clone)]
pub struct AppState {
    pub app: AppHandle,
    pub upstream: Url,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
}

impl AppState {
    pub fn upstream_url(&self, path_and_query: &str) -> Url {
        let mut u = self.upstream.clone();
        u.set_path("");
        u.set_query(None);
        // join() on a base whose path is empty resolves the absolute path as-is.
        u.join(path_and_query).unwrap_or_else(|_| self.upstream.clone())
    }
}

pub type Shared = Arc<AppState>;
```

- [ ] **Step 11: Создать `desktop/src-tauri/src/server.rs`**

```rust
use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use std::net::SocketAddr;
use tauri::Manager;

use crate::spa::{classify, Route};
use crate::state::Shared;

pub fn router(state: Shared) -> Router {
    Router::new().fallback(any(handle)).with_state(state)
}

/// Binds 127.0.0.1 on an ephemeral port and serves in a background task.
/// Returns the bound address so the caller can point the webview at it.
pub fn spawn(state: Shared) -> std::io::Result<SocketAddr> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    let addr = listener.local_addr()?;
    let app = router(state);
    tauri::async_runtime::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(listener)
            .expect("std listener converts to tokio");
        let _ = axum::serve(listener, app).await;
    });
    Ok(addr)
}

async fn handle(State(state): State<Shared>, req: Request<Body>) -> Response {
    serve_static(&state, req.uri().path())
}

fn serve_static(state: &Shared, path: &str) -> Response {
    let route = classify(path);
    let asset_path = match route {
        Route::NotFound => return StatusCode::NOT_FOUND.into_response(),
        Route::Index => "index.html".to_string(),
        Route::Asset(p) => p,
    };
    match state.app.asset_resolver().get(asset_path) {
        Some(asset) => (
            [(header::CONTENT_TYPE, asset.mime_type)],
            asset.bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
```

- [ ] **Step 12: Создать `desktop/src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;
mod spa;
mod state;

use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const DEFAULT_UPSTREAM: &str = "https://andrey.vbncursed.fun";

/// Marks the shell for the frontend. Passkey ceremonies cannot succeed here —
/// the RP origin is a loopback port that PASSKEY_RP_ORIGINS will never list —
/// so the UI that offers them has to know it is running inside the app.
const INIT_SCRIPT: &str = "window.__DESKTOP__ = true;";

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let upstream = std::env::var("DESKTOP_UPSTREAM")
                .unwrap_or_else(|_| DEFAULT_UPSTREAM.to_string());
            let upstream = Url::parse(&upstream)?;
            let cache_dir = app.path().app_cache_dir()?;

            let state = Arc::new(state::AppState {
                app: app.handle().clone(),
                upstream,
                http: reqwest::Client::builder().cookie_store(true).build()?,
                cache_dir,
            });

            let addr = server::spawn(state)?;
            let url = Url::parse(&format!("http://{addr}/"))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Andrey")
                .inner_size(1440.0, 900.0)
                .initialization_script(INIT_SCRIPT)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 13: Собрать фронт и запустить приложение**

```bash
yarn --cwd ../../frontend build
cd desktop/src-tauri && cargo run
```

Expected: открывается окно с экраном логина SPA. Войти нельзя — `/api` ещё не проксируется, кнопка вернёт ошибку сети. Это ожидаемо.

- [ ] **Step 14: Проверить фоллбэк роутера**

В окне открыть DevTools (`cargo run` — debug-сборка, контекстное меню доступно) и выполнить `location.assign('/territories/x')`. Страница должна отрисовать SPA, а не 404.

- [ ] **Step 15: Коммит**

```bash
git add desktop/
git commit -m "feat(desktop): tauri shell serving the embedded SPA from a loopback server"
```

---

## Task 2: Nonce-гард

Порт на `127.0.0.1` доступен любому процессу пользователя. Гард ставится **до** проксирования, чтобы в дереве коммитов не было состояния, где порт уже отдаёт сессию, а защиты ещё нет.

**Files:**
- Create: `desktop/src-tauri/src/guard.rs`
- Modify: `desktop/src-tauri/src/state.rs`, `desktop/src-tauri/src/server.rs`, `desktop/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `state::AppState`, `server::handle`
- Produces: `guard::Nonce::new() -> Nonce`, `Nonce::set_cookie(&self) -> String`, `Nonce::matches(&self, cookie_header: Option<&str>) -> bool`

- [ ] **Step 1: Написать падающие тесты**

Создать `desktop/src-tauri/src/guard.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_its_own_cookie() {
        let n = Nonce::new();
        let header = format!("dsk={}", n.value());
        assert!(n.matches(Some(&header)));
    }

    #[test]
    fn accepts_when_other_cookies_are_present() {
        let n = Nonce::new();
        let header = format!("theme=dark; dsk={}; other=1", n.value());
        assert!(n.matches(Some(&header)));
    }

    #[test]
    fn rejects_missing_and_wrong() {
        let n = Nonce::new();
        assert!(!n.matches(None));
        assert!(!n.matches(Some("")));
        assert!(!n.matches(Some("dsk=deadbeef")));
        assert!(!n.matches(Some("theme=dark")));
    }

    #[test]
    fn two_nonces_differ() {
        assert_ne!(Nonce::new().value(), Nonce::new().value());
    }

    #[test]
    fn set_cookie_is_session_scoped_and_strict() {
        let n = Nonce::new();
        let c = n.set_cookie();
        assert!(c.starts_with(&format!("dsk={}", n.value())));
        assert!(c.contains("Path=/"));
        assert!(c.contains("SameSite=Strict"));
        assert!(c.contains("HttpOnly"));
        // No Max-Age: the nonce must not outlive the process that issued it.
        assert!(!c.contains("Max-Age"));
    }
}
```

- [ ] **Step 2: Запустить, убедиться что не компилируется**

Run: `cargo test guard`
Expected: FAIL — `cannot find type Nonce`

- [ ] **Step 3: Реализовать `Nonce`**

Добавить в начало `guard.rs`:

```rust
use rand::RngCore;

/// A per-run secret the webview gets as a cookie on the first HTML response.
/// Every other request must echo it, which keeps other local processes off a
/// port that is otherwise a live authenticated session to the gateway.
pub struct Nonce(String);

impl Nonce {
    pub fn new() -> Self {
        let mut bytes = [0u8; 16];
        rand::rng().fill_bytes(&mut bytes);
        Nonce(hex::encode(bytes))
    }

    pub fn value(&self) -> &str {
        &self.0
    }

    pub fn set_cookie(&self) -> String {
        format!("dsk={}; Path=/; SameSite=Strict; HttpOnly", self.0)
    }

    pub fn matches(&self, cookie_header: Option<&str>) -> bool {
        let Some(header) = cookie_header else {
            return false;
        };
        header
            .split(';')
            .filter_map(|c| c.trim().split_once('='))
            .any(|(k, v)| k == "dsk" && v == self.0)
    }
}
```

- [ ] **Step 4: Тесты проходят**

Run: `cargo test guard`
Expected: PASS, 5 тестов

- [ ] **Step 5: Положить `Nonce` в состояние**

В `state.rs` добавить поле в `AppState`:

```rust
pub nonce: crate::guard::Nonce,
```

и импорт не нужен — путь указан целиком. В `main.rs` в конструкторе `AppState` добавить:

```rust
nonce: guard::Nonce::new(),
```

и `mod guard;` в список модулей.

- [ ] **Step 6: Применить гард в `server.rs`**

Заменить `handle` и `serve_static`:

```rust
async fn handle(State(state): State<Shared>, req: Request<Body>) -> Response {
    let cookie = req
        .headers()
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let path = req.uri().path().to_string();

    let route = classify(&path);
    // index.html is the only response allowed without the nonce: it is what
    // hands the nonce out, both on a cold start and on a reload of a deep
    // router path.
    if !matches!(route, Route::Index) && !state.nonce.matches(cookie.as_deref()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    serve_static(&state, route)
}

fn serve_static(state: &Shared, route: Route) -> Response {
    let asset_path = match route {
        Route::NotFound => return StatusCode::NOT_FOUND.into_response(),
        Route::Index => "index.html".to_string(),
        Route::Asset(p) => p,
    };
    let is_index = asset_path == "index.html";
    match state.app.asset_resolver().get(asset_path) {
        Some(asset) => {
            let mut res = ([(header::CONTENT_TYPE, asset.mime_type)], asset.bytes).into_response();
            if is_index {
                if let Ok(v) = state.nonce.set_cookie().parse() {
                    res.headers_mut().append(header::SET_COOKIE, v);
                }
                if let Ok(v) = CSP.parse() {
                    res.headers_mut().insert(header::CONTENT_SECURITY_POLICY, v);
                }
            }
            res
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Tauri injects its own CSP only when it serves the page; we serve it, so the
/// header is ours. wasm-unsafe-eval and blob: workers are load-bearing: without
/// them the Draco decoder and the KTX2 transcoder never start, and the failure
/// looks like a flat-coloured model rather than an error.
const CSP: &str = "default-src 'self'; \
     script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; \
     worker-src 'self' blob:; \
     style-src 'self' 'unsafe-inline'; \
     img-src 'self' data: blob:; \
     font-src 'self' data:; \
     connect-src 'self' blob: data:; \
     frame-src 'self'";
```

- [ ] **Step 7: Проверить вживую**

```bash
cargo run
```

Приложение открывается и рендерится как раньше — шрифты, стили, иконки на месте (значит гард пропускает вебвью). В другом терминале:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<порт>/assets/<любой>.js
```

Порт видно в выводе `lsof -iTCP -sTCP:LISTEN -P | grep andrey`.
Expected: `403`

- [ ] **Step 8: Коммит**

```bash
git add desktop/src-tauri/src/
git commit -m "feat(desktop): gate the loopback port with a per-run nonce cookie"
```

---

## Task 3: Прокси `/api` и сессия в keychain

**Files:**
- Create: `desktop/src-tauri/src/session.rs`, `desktop/src-tauri/src/proxy.rs`
- Modify: `desktop/src-tauri/src/server.rs`, `desktop/src-tauri/src/state.rs`, `desktop/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `state::Shared`, `guard::Nonce`
- Produces: `session::Stored { token: String, user_id: String }`, `session::load() -> Option<Stored>`, `session::store(&Stored)`, `session::clear()`, `session::user_id_from_me(body: &[u8]) -> Option<String>`, `proxy::forward(state: &Shared, req: Request<Body>) -> Response`

- [ ] **Step 1: Тесты `session.rs`**

Keychain в тестах не трогаем — он платформенный и в CI недоступен. Тестируем чистый разбор тела `/api/auth/me`.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_id_out_of_me() {
        let body = br#"{"id":"usr_7","email":"a@b.c","isOwner":false}"#;
        assert_eq!(user_id_from_me(body), Some("usr_7".to_string()));
    }

    #[test]
    fn returns_none_on_garbage() {
        assert_eq!(user_id_from_me(b"not json"), None);
        assert_eq!(user_id_from_me(br#"{"email":"a@b.c"}"#), None);
        assert_eq!(user_id_from_me(br#"{"id":42}"#), None);
    }
}
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cargo test session`
Expected: FAIL — `cannot find function user_id_from_me`

- [ ] **Step 3: Реализовать `session.rs`**

```rust
use serde::{Deserialize, Serialize};

const SERVICE: &str = "fun.vbncursed.andrey.desktop";
const ACCOUNT: &str = "session";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Stored {
    pub token: String,
    pub user_id: String,
}

/// Every keychain error is swallowed on purpose: a Linux box with no Secret
/// Service must still run the app, it just asks for a login each start.
pub fn load() -> Option<Stored> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).ok()?;
    let raw = entry.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn store(s: &Stored) {
    if let (Ok(entry), Ok(raw)) = (keyring::Entry::new(SERVICE, ACCOUNT), serde_json::to_string(s)) {
        let _ = entry.set_password(&raw);
    }
}

pub fn clear() {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.delete_credential();
    }
}

pub fn user_id_from_me(body: &[u8]) -> Option<String> {
    let v: serde_json::Value = serde_json::from_slice(body).ok()?;
    v.get("id")?.as_str().map(str::to_string)
}
```

- [ ] **Step 4: Тесты проходят**

Run: `cargo test session`
Expected: PASS, 2 теста

- [ ] **Step 5: Тест форвардинга с заглушкой апстрима**

Создать `desktop/src-tauri/src/proxy.rs`. Заглушка — тот же axum, `wiremock` ради этого не тащим.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::Json;

    /// Spawns a throwaway upstream and returns its base URL.
    async fn stub(router: axum::Router) -> String {
        let l = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let addr = l.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = axum::serve(l, router).await;
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn strips_set_cookie_from_the_response() {
        let base = stub(axum::Router::new().route(
            "/api/auth/login",
            get(|| async {
                (
                    [(axum::http::header::SET_COOKIE, "session=secret; HttpOnly")],
                    Json(serde_json::json!({"token": "t"})),
                )
            }),
        ))
        .await;

        let client = reqwest::Client::builder().cookie_store(true).build().unwrap();
        let upstream = url::Url::parse(&base).unwrap();
        let res = send(&client, &upstream, "GET", "/api/auth/login", Default::default(), Vec::new())
            .await
            .unwrap();

        assert!(
            res.headers().get(axum::http::header::SET_COOKIE).is_none(),
            "the session cookie must never reach the webview"
        );
    }

    #[tokio::test]
    async fn keeps_the_cookie_in_the_client_jar() {
        let base = stub(
            axum::Router::new()
                .route(
                    "/api/auth/login",
                    get(|| async {
                        (
                            [(axum::http::header::SET_COOKIE, "session=secret; Path=/")],
                            "ok",
                        )
                    }),
                )
                .route(
                    "/api/echo",
                    get(|headers: axum::http::HeaderMap| async move {
                        headers
                            .get(axum::http::header::COOKIE)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("")
                            .to_string()
                    }),
                ),
        )
        .await;

        let client = reqwest::Client::builder().cookie_store(true).build().unwrap();
        let upstream = url::Url::parse(&base).unwrap();
        send(&client, &upstream, "GET", "/api/auth/login", Default::default(), Vec::new())
            .await
            .unwrap();
        let echo = send(&client, &upstream, "GET", "/api/echo", Default::default(), Vec::new())
            .await
            .unwrap();

        assert!(echo.text().await.unwrap().contains("session=secret"));
    }
}
```

- [ ] **Step 6: Убедиться, что падает**

Run: `cargo test proxy`
Expected: FAIL — `cannot find function send`

- [ ] **Step 7: Реализовать `proxy.rs`**

```rust
use axum::body::Body;
use axum::http::{header, HeaderMap, Method, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::StreamExt;

use crate::state::Shared;

/// Headers that describe one hop and must not be copied to the next.
const HOP_BY_HOP: [&str; 6] = [
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
];

/// Raw upstream call. Split out so tests can drive it without a Tauri app.
pub async fn send(
    client: &reqwest::Client,
    upstream: &url::Url,
    method: &str,
    path_and_query: &str,
    headers: HeaderMap,
    body: Vec<u8>,
) -> reqwest::Result<reqwest::Response> {
    let mut url = upstream.clone();
    url.set_path("");
    url.set_query(None);
    let url = url.join(path_and_query).unwrap_or(url);

    let mut req = client
        .request(reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET), url);
    for (k, v) in headers.iter() {
        let name = k.as_str().to_ascii_lowercase();
        // Host and Cookie belong to the loopback origin, not the gateway; the
        // client's own jar supplies the real session cookie.
        if HOP_BY_HOP.contains(&name.as_str()) || name == "host" || name == "cookie" {
            continue;
        }
        req = req.header(k, v);
    }
    if !body.is_empty() {
        req = req.body(body);
    }
    req.send().await
}

/// Copies an upstream response back to the webview, dropping Set-Cookie so the
/// session lives only in the proxy's jar and the OS keychain.
pub fn relay(res: reqwest::Response) -> Response {
    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut out = Response::builder().status(status);
    for (k, v) in res.headers().iter() {
        let name = k.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&name.as_str()) || name == "set-cookie" || name == "content-length" {
            continue;
        }
        out = out.header(k, v);
    }
    let stream = res.bytes_stream().map(|c| c.map_err(std::io::Error::other));
    out.body(Body::from_stream(stream))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

/// The {code,message} shape the gateway uses. client.ts parses exactly this;
/// anything else surfaces as "Request failed (503)" with no explanation.
pub fn unreachable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"code":"upstream_unreachable","message":"Cannot reach the server"}"#,
    )
        .into_response()
}

pub async fn forward(state: &Shared, req: Request<Body>) -> Response {
    let method = req.method().clone();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());
    let headers = req.headers().clone();
    let body = axum::body::to_bytes(req.into_body(), usize::MAX)
        .await
        .unwrap_or_default()
        .to_vec();

    match send(&state.http, &state.upstream, method.as_str(), &path_and_query, headers, body).await {
        Ok(res) => post_process(state, &method, &path_and_query, res).await,
        Err(_) => unreachable(),
    }
}

/// /api/auth/me is buffered on purpose: it is a few hundred bytes and it is the
/// only place the user id is available, and the id is what keys the per-user
/// cache directory. Everything else streams.
async fn post_process(
    state: &Shared,
    method: &Method,
    path_and_query: &str,
    res: reqwest::Response,
) -> Response {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        crate::session::clear();
    }
    if method == Method::POST && path_and_query.starts_with("/api/auth/logout") && res.status().is_success() {
        crate::session::clear();
    }
    if !(method == Method::GET && path_and_query.starts_with("/api/auth/me") && res.status().is_success()) {
        return relay(res);
    }

    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::OK);
    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let Ok(bytes) = res.bytes().await else {
        return unreachable();
    };
    if let Some(user_id) = crate::session::user_id_from_me(&bytes) {
        if let Some(token) = state.session_cookie() {
            crate::session::store(&crate::session::Stored { token, user_id });
        }
    }
    (status, [(header::CONTENT_TYPE, content_type)], bytes).into_response()
}
```

- [ ] **Step 8: Добавить чтение куки сессии из jar в `state.rs`**

```rust
use reqwest::cookie::CookieStore;

impl AppState {
    /// The gateway's session cookie as the jar currently holds it.
    pub fn session_cookie(&self) -> Option<String> {
        let header = self.jar.cookies(&self.upstream)?;
        let header = header.to_str().ok()?;
        header
            .split(';')
            .filter_map(|c| c.trim().split_once('='))
            .find(|(k, _)| *k == SESSION_COOKIE)
            .map(|(_, v)| v.to_string())
    }
}

/// Mirrors sessionCookieName in
/// backend/services/gateway-service/internal/transport/authhttp/cookie.go:9.
pub const SESSION_COOKIE: &str = "andrey_session";
```

Поле `jar: std::sync::Arc<reqwest::cookie::Jar>` добавляется в `AppState`, а клиент строится в `main.rs` через `.cookie_provider(jar.clone())` вместо `.cookie_store(true)` — иначе до содержимого jar не добраться.

- [ ] **Step 9: Подсадить сохранённый токен на старте**

В `main.rs` после создания `jar`, до создания клиента:

```rust
if let Some(stored) = session::load() {
    jar.add_cookie_str(
        &format!("{}={}; Path=/", state::SESSION_COOKIE, stored.token),
        &upstream,
    );
}
```

- [ ] **Step 10: Развести статику и API в `server.rs`**

В `handle`, после проверки nonce:

```rust
if path.starts_with("/api/") {
    return crate::proxy::forward(&state, req).await;
}
serve_static(&state, route)
```

- [ ] **Step 11: Все тесты проходят**

Run: `cargo test`
Expected: PASS

- [ ] **Step 12: Проверить вживую**

```bash
DESKTOP_UPSTREAM=http://localhost:8080 cargo run
```

(предварительно `make -C backend compose-up`). Войти паролем, увидеть список территорий, открыть территорию — модель грузится. Закрыть и открыть приложение: вход не спрашивается.

- [ ] **Step 13: Коммит**

```bash
git add desktop/src-tauri/src/
git commit -m "feat(desktop): proxy /api upstream, keep the session in the OS keychain"
```

---

## Task 4: Дисковый кэш блобов

**Files:**
- Create: `desktop/src-tauri/src/paths.rs`, `desktop/src-tauri/src/cache.rs`
- Modify: `desktop/src-tauri/src/server.rs`

**Interfaces:**
- Consumes: `session::load()`, `state::Shared`
- Produces: `paths::user_root(cache_dir, host, user_id) -> PathBuf`, `paths::blobs(root) -> PathBuf`, `paths::snapshots(root) -> PathBuf`, `cache::is_valid_hash(&str) -> bool`, `cache::tee_to_disk(res, dest) -> Body`

- [ ] **Step 1: Тесты `paths.rs` и валидации хеша**

`desktop/src-tauri/src/paths.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn different_users_get_different_roots() {
        let base = Path::new("/cache");
        let a = user_root(base, "andrey.vbncursed.fun", "usr_1");
        let b = user_root(base, "andrey.vbncursed.fun", "usr_2");
        assert_ne!(a, b);
    }

    #[test]
    fn different_hosts_get_different_roots() {
        let base = Path::new("/cache");
        let a = user_root(base, "andrey.vbncursed.fun", "usr_1");
        let b = user_root(base, "localhost:8080", "usr_1");
        assert_ne!(a, b);
    }

    #[test]
    fn the_root_is_stable() {
        let base = Path::new("/cache");
        assert_eq!(
            user_root(base, "h", "u"),
            user_root(base, "h", "u"),
            "a changing root would silently orphan the whole cache each start"
        );
    }
}
```

`desktop/src-tauri/src/cache.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_sha256_hex() {
        assert!(is_valid_hash(&"a".repeat(64)));
        assert!(is_valid_hash("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
    }

    // {hash} becomes a filename, so this is a trust boundary, not a nicety.
    #[test]
    fn rejects_traversal_and_anything_not_hex() {
        assert!(!is_valid_hash("../../etc/passwd"));
        assert!(!is_valid_hash("..%2f..%2fetc"));
        assert!(!is_valid_hash("ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));
        assert!(!is_valid_hash(""));
        assert!(!is_valid_hash(&"a".repeat(63)));
        assert!(!is_valid_hash(&"a".repeat(65)));
    }
}
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cargo test paths cache`
Expected: FAIL — функции не найдены

- [ ] **Step 3: Реализовать `paths.rs`**

```rust
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Cache root for one (upstream, user) pair.
///
/// /api/assets/{hash} is gated by RequireBlobAccess on the gateway, and serving
/// from cache skips that check. Splitting the directory per user is what keeps
/// a second tenant on the same machine from reading the first one's models.
pub fn user_root(cache_dir: &Path, host: &str, user_id: &str) -> PathBuf {
    let digest = Sha256::digest(format!("{host}:{user_id}").as_bytes());
    cache_dir.join(hex::encode(&digest[..8]))
}

pub fn blobs(root: &Path) -> PathBuf {
    root.join("blobs")
}

pub fn snapshots(root: &Path) -> PathBuf {
    root.join("snapshots")
}
```

- [ ] **Step 4: Реализовать `is_valid_hash`**

В начало `cache.rs`:

```rust
/// Blob hashes are sha256 hex from upload-service, so anything else is either a
/// bug or an attempt to pick the filename we are about to write.
pub fn is_valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
```

- [ ] **Step 5: Тесты проходят**

Run: `cargo test paths cache`
Expected: PASS, 5 тестов

- [ ] **Step 6: Тест записи с проверкой sha256**

Дописать в `cache.rs`:

```rust
    use futures_util::StreamExt;
    use tempfile::tempdir;

    fn chunks(data: &[u8]) -> impl futures_util::Stream<Item = Result<bytes::Bytes, std::io::Error>> {
        let parts: Vec<_> = data.chunks(3).map(|c| Ok(bytes::Bytes::copy_from_slice(c))).collect();
        futures_util::stream::iter(parts)
    }

    #[tokio::test]
    async fn writes_the_file_when_the_hash_matches() {
        let dir = tempdir().unwrap();
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = dir.path().join(&hash);

        let mut s = Box::pin(tee_to_disk(chunks(data), dest.clone(), hash.clone()));
        while let Some(c) = s.next().await {
            c.unwrap();
        }
        drop(s);
        tokio::task::yield_now().await;

        assert_eq!(tokio::fs::read(&dest).await.unwrap(), data);
    }

    #[tokio::test]
    async fn writes_nothing_when_the_hash_does_not_match() {
        let dir = tempdir().unwrap();
        let hash = "b".repeat(64);
        let dest = dir.path().join(&hash);

        let mut s = Box::pin(tee_to_disk(chunks(b"hello world"), dest.clone(), hash));
        while let Some(c) = s.next().await {
            c.unwrap();
        }
        drop(s);
        tokio::task::yield_now().await;

        assert!(!dest.exists(), "a corrupt download must not become a valid cache entry");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0, "no temp file left behind");
    }

    #[tokio::test]
    async fn writes_nothing_when_the_stream_is_cut_short() {
        let dir = tempdir().unwrap();
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = dir.path().join(&hash);

        let s = tee_to_disk(chunks(data), dest.clone(), hash);
        let mut s = Box::pin(s);
        let _ = s.next().await; // take one chunk, then walk away
        drop(s);
        tokio::task::yield_now().await;

        assert!(!dest.exists());
    }
```

Добавить `bytes = "1"` в `[dependencies]`.

- [ ] **Step 7: Убедиться, что падают**

Run: `cargo test cache`
Expected: FAIL — `cannot find function tee_to_disk`

- [ ] **Step 8: Реализовать `tee_to_disk`**

```rust
use futures_util::Stream;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

/// Passes chunks through to the caller while writing them to a temp file, and
/// promotes the temp file only when the stream ends and the sha256 matches the
/// hash the URL asked for. A dropped stream leaves nothing behind, so an
/// interrupted download can never be served later as a complete model.
pub fn tee_to_disk<S>(
    upstream: S,
    dest: PathBuf,
    hash: String,
) -> impl Stream<Item = Result<bytes::Bytes, std::io::Error>>
where
    S: Stream<Item = Result<bytes::Bytes, std::io::Error>>,
{
    async_stream::stream! {
        let tmp = dest.with_extension(format!("part-{}", std::process::id()));
        let mut file = match tokio::fs::File::create(&tmp).await {
            Ok(f) => Some(f),
            // A cache that cannot write is a cache that is off, not a failed request.
            Err(_) => None,
        };
        let mut hasher = Sha256::new();
        let mut complete = false;

        futures_util::pin_mut!(upstream);
        while let Some(item) = upstream.next().await {
            match item {
                Ok(chunk) => {
                    if let Some(f) = file.as_mut() {
                        if f.write_all(&chunk).await.is_err() {
                            file = None;
                        }
                    }
                    hasher.update(&chunk);
                    yield Ok(chunk);
                }
                Err(e) => {
                    yield Err(e);
                    file = None;
                    break;
                }
            }
        }
        if file.is_some() {
            complete = true;
        }

        if let Some(mut f) = file.take() {
            let ok = complete && f.flush().await.is_ok() && hex::encode(hasher.finalize()) == hash;
            drop(f);
            if ok && tokio::fs::rename(&tmp, &dest).await.is_ok() {
                return;
            }
        }
        let _ = tokio::fs::remove_file(&tmp).await;
    }
}
```

Добавить `use futures_util::StreamExt;` в начало файла.

- [ ] **Step 9: Тесты проходят**

Run: `cargo test cache`
Expected: PASS, 5 тестов

- [ ] **Step 10: Подключить кэш к маршруту в `server.rs`**

Добавить маршрут до `fallback`:

```rust
Router::new()
    .route("/api/assets/{hash}", any(handle_asset))
    .fallback(any(handle))
    .with_state(state)
```

и обработчик:

```rust
async fn handle_asset(
    State(state): State<Shared>,
    Path(hash): Path<String>,
    req: Request<Body>,
) -> Response {
    let cookie = req.headers().get(header::COOKIE).and_then(|v| v.to_str().ok());
    if !state.nonce.matches(cookie) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(root) = state.user_cache_root() else {
        return crate::proxy::forward(&state, req).await;
    };
    if !crate::cache::is_valid_hash(&hash) {
        return crate::proxy::forward(&state, req).await;
    }

    let path = crate::paths::blobs(&root).join(&hash);
    if path.is_file() {
        // ServeFile answers Range, and pdf.js loads documents by range.
        return match ServeFile::new(&path).oneshot(req).await {
            Ok(res) => res.into_response(),
            Err(_) => crate::proxy::forward(&state, req).await,
        };
    }

    let method = req.method().clone();
    let headers = req.headers().clone();
    let pq = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_default();
    let res = match crate::proxy::send(&state.http, &state.upstream, method.as_str(), &pq, headers, Vec::new()).await {
        Ok(r) => r,
        Err(_) => return crate::proxy::unreachable(),
    };
    // Only a complete 200 is cacheable: a 206 is a slice and a 404 is not content.
    if res.status() != reqwest::StatusCode::OK {
        return crate::proxy::relay(res);
    }
    let _ = tokio::fs::create_dir_all(crate::paths::blobs(&root)).await;

    let status = StatusCode::OK;
    let mut out = Response::builder().status(status);
    for (k, v) in res.headers().iter() {
        let name = k.as_str().to_ascii_lowercase();
        if name == "set-cookie" || name == "content-length" || name == "transfer-encoding" {
            continue;
        }
        out = out.header(k, v);
    }
    let upstream = res.bytes_stream().map(|c| c.map_err(std::io::Error::other));
    let teed = crate::cache::tee_to_disk(upstream, path, hash);
    out.body(Body::from_stream(teed))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}
```

Импорты: `axum::extract::Path`, `tower::ServiceExt` (для `oneshot`), `tower_http::services::ServeFile`, `futures_util::StreamExt`. Добавить `tower = "0.5"` в зависимости.

- [ ] **Step 11: Добавить `user_cache_root` в `state.rs`**

```rust
impl AppState {
    /// None until we know who is signed in — before that there is no directory
    /// the cache may safely use, so requests go straight upstream.
    pub fn user_cache_root(&self) -> Option<PathBuf> {
        let stored = crate::session::load()?;
        let host = self.upstream.host_str()?;
        let host = match self.upstream.port() {
            Some(p) => format!("{host}:{p}"),
            None => host.to_string(),
        };
        Some(crate::paths::user_root(&self.cache_dir, &host, &stored.user_id))
    }
}
```

- [ ] **Step 12: Проверить вживую**

```bash
DESKTOP_UPSTREAM=http://localhost:8080 cargo run
```

Открыть территорию, закрыть приложение, открыть снова и ту же территорию. В `~/Library/Caches/fun.vbncursed.andrey.desktop/<16 hex>/blobs/` лежат файлы; во второй раз в логах gateway нет запросов за GLB.

- [ ] **Step 13: Коммит**

```bash
git add desktop/src-tauri/
git commit -m "feat(desktop): cache /api/assets on disk, verified by sha256 and split per user"
```

---

## Task 5: LRU-вытеснение

**Files:**
- Create: `desktop/src-tauri/src/evict.rs`
- Modify: `desktop/src-tauri/src/server.rs`, `desktop/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `paths::blobs`
- Produces: `evict::enforce_cap(dir: &Path, cap_bytes: u64) -> std::io::Result<()>`, `evict::CAP_BYTES`

- [ ] **Step 1: Тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};
    use tempfile::tempdir;

    fn write(dir: &std::path::Path, name: &str, size: usize, age_secs: u64) {
        let p = dir.join(name);
        std::fs::write(&p, vec![0u8; size]).unwrap();
        let when = SystemTime::now() - Duration::from_secs(age_secs);
        filetime::set_file_mtime(&p, filetime::FileTime::from_system_time(when)).unwrap();
    }

    #[test]
    fn does_nothing_under_the_cap() {
        let d = tempdir().unwrap();
        write(d.path(), "a", 100, 10);
        write(d.path(), "b", 100, 20);
        enforce_cap(d.path(), 1000).unwrap();
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 2);
    }

    #[test]
    fn drops_the_oldest_until_under_the_cap() {
        let d = tempdir().unwrap();
        write(d.path(), "new", 100, 1);
        write(d.path(), "mid", 100, 100);
        write(d.path(), "old", 100, 1000);
        enforce_cap(d.path(), 250).unwrap();
        assert!(d.path().join("new").exists());
        assert!(d.path().join("mid").exists());
        assert!(!d.path().join("old").exists(), "the least recently used entry goes first");
    }

    #[test]
    fn a_missing_directory_is_not_an_error() {
        let d = tempdir().unwrap();
        enforce_cap(&d.path().join("nope"), 10).unwrap();
    }
}
```

Добавить `filetime = "0.2"` в `[dev-dependencies]`.

- [ ] **Step 2: Убедиться, что падают**

Run: `cargo test evict`
Expected: FAIL — `cannot find function enforce_cap`

- [ ] **Step 3: Реализовать**

```rust
use std::path::Path;
use std::time::SystemTime;

/// 5 GB. A territory with its LOD chain is tens to hundreds of megabytes, so
/// this holds a working set of dozens without asking the user anything.
pub const CAP_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// Deletes least-recently-modified entries until the directory fits the cap.
///
/// ponytail: a full read_dir scan on every write. Fine at thousands of files,
/// swap for an on-disk index when it is tens of thousands.
pub fn enforce_cap(dir: &Path, cap_bytes: u64) -> std::io::Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };

    let mut files: Vec<(std::path::PathBuf, u64, SystemTime)> = Vec::new();
    let mut total: u64 = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        total += meta.len();
        files.push((entry.path(), meta.len(), mtime));
    }
    if total <= cap_bytes {
        return Ok(());
    }

    files.sort_by_key(|(_, _, mtime)| *mtime);
    for (path, size, _) in files {
        if total <= cap_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= size;
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Тесты проходят**

Run: `cargo test evict`
Expected: PASS, 3 теста

- [ ] **Step 5: Вызывать после записи и на старте**

В `server.rs`, в `handle_asset`, сразу после `create_dir_all`:

```rust
// Blocking fs walk, kept off the async worker. Fire-and-forget: eviction
// failing is not a reason to fail the download it was triggered by.
let blobs = crate::paths::blobs(&root);
tauri::async_runtime::spawn_blocking(move || {
    let _ = crate::evict::enforce_cap(&blobs, crate::evict::CAP_BYTES);
});
```

В `main.rs`, в `setup()`, после создания `state`:

```rust
if let Some(root) = state.user_cache_root() {
    let blobs = paths::blobs(&root);
    tauri::async_runtime::spawn_blocking(move || {
        let _ = evict::enforce_cap(&blobs, evict::CAP_BYTES);
    });
}
```

- [ ] **Step 6: Полный прогон**

Run: `cargo test && cargo clippy -- -D warnings`
Expected: PASS

- [ ] **Step 7: Коммит**

```bash
git add desktop/src-tauri/
git commit -m "feat(desktop): evict the least recently used blobs past a 5 GB cap"
```

---

## Task 6: Снимки `stale-if-error`

**Files:**
- Create: `desktop/src-tauri/src/snapshot.rs`
- Modify: `desktop/src-tauri/src/proxy.rs`

**Interfaces:**
- Consumes: `paths::snapshots`, `state::Shared`
- Produces: `snapshot::cacheable(method: &str, path: &str) -> bool`, `snapshot::key(method: &str, path_and_query: &str) -> String`, `snapshot::save(dir, key, content_type, body)`, `snapshot::load(dir, key) -> Option<(String, Vec<u8>)>`

- [ ] **Step 1: Тесты**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn caches_plain_api_gets() {
        assert!(cacheable("GET", "/api/territories"));
        assert!(cacheable("GET", "/api/territories/dji/scene"));
    }

    #[test]
    fn never_caches_mutations() {
        assert!(!cacheable("POST", "/api/territories"));
        assert!(!cacheable("PUT", "/api/placements/1"));
        assert!(!cacheable("DELETE", "/api/placements/1"));
        assert!(!cacheable("PATCH", "/api/uploads/1"));
    }

    // Blobs have their own cache; job events are a stream, not a document.
    #[test]
    fn never_caches_blobs_or_streams() {
        assert!(!cacheable("GET", "/api/assets/abc"));
        assert!(!cacheable("GET", "/api/jobs/j1/events"));
    }

    // /me is the one auth route allowed a snapshot: without it the router guard
    // bounces to /login and there is no offline mode at all.
    #[test]
    fn caches_only_me_out_of_auth() {
        assert!(cacheable("GET", "/api/auth/me"));
        assert!(!cacheable("GET", "/api/auth/passkeys"));
        assert!(!cacheable("GET", "/api/auth/login"));
    }

    #[test]
    fn key_separates_paths_and_queries() {
        assert_ne!(key("GET", "/api/territories"), key("GET", "/api/models"));
        assert_ne!(key("GET", "/api/audit?limit=50"), key("GET", "/api/audit?limit=10"));
        assert_eq!(key("GET", "/api/territories"), key("GET", "/api/territories"));
    }

    #[test]
    fn round_trips_a_snapshot() {
        let d = tempdir().unwrap();
        let k = key("GET", "/api/territories");
        save(d.path(), &k, "application/json", b"[]");
        assert_eq!(load(d.path(), &k), Some(("application/json".to_string(), b"[]".to_vec())));
    }

    #[test]
    fn a_missing_snapshot_is_none() {
        let d = tempdir().unwrap();
        assert_eq!(load(d.path(), &key("GET", "/api/nothing")), None);
    }
}
```

- [ ] **Step 2: Убедиться, что падают**

Run: `cargo test snapshot`
Expected: FAIL

- [ ] **Step 3: Реализовать**

```rust
use sha2::{Digest, Sha256};
use std::path::Path;

/// Which responses may be replayed when the network is gone.
///
/// GET only, and never /api/assets (it has its own cache) nor the job event
/// stream. /api/auth is closed apart from /me, which is load-bearing: the
/// router guard reads it, and without a snapshot there is no offline mode.
pub fn cacheable(method: &str, path: &str) -> bool {
    if method != "GET" || !path.starts_with("/api/") {
        return false;
    }
    if path.starts_with("/api/assets/") || path.contains("/events") {
        return false;
    }
    if path.starts_with("/api/auth/") {
        return path.starts_with("/api/auth/me");
    }
    true
}

pub fn key(method: &str, path_and_query: &str) -> String {
    hex::encode(Sha256::digest(format!("{method} {path_and_query}").as_bytes()))
}

/// Body and content type in one file: the first line is the type, the rest is
/// the body. Two files would need the pair to stay consistent across crashes.
pub fn save(dir: &Path, key: &str, content_type: &str, body: &[u8]) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let mut blob = Vec::with_capacity(content_type.len() + body.len() + 1);
    blob.extend_from_slice(content_type.as_bytes());
    blob.push(b'\n');
    blob.extend_from_slice(body);
    let tmp = dir.join(format!("{key}.part"));
    if std::fs::write(&tmp, &blob).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join(key));
    }
}

pub fn load(dir: &Path, key: &str) -> Option<(String, Vec<u8>)> {
    let blob = std::fs::read(dir.join(key)).ok()?;
    let split = blob.iter().position(|b| *b == b'\n')?;
    let content_type = String::from_utf8(blob[..split].to_vec()).ok()?;
    Some((content_type, blob[split + 1..].to_vec()))
}
```

- [ ] **Step 4: Тесты проходят**

Run: `cargo test snapshot`
Expected: PASS, 7 тестов

- [ ] **Step 5: Тест поведения на транспортной ошибке и на 500**

Дописать в `proxy.rs`:

```rust
    #[tokio::test]
    async fn replays_a_snapshot_when_the_upstream_is_gone() {
        let dir = tempfile::tempdir().unwrap();
        let k = crate::snapshot::key("GET", "/api/territories");
        crate::snapshot::save(dir.path(), &k, "application/json", b"[{\"slug\":\"a\"}]");

        let res = offline_fallback(dir.path(), "GET", "/api/territories");
        let res = res.expect("a saved snapshot must answer when the network does not");
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn without_a_snapshot_it_is_a_service_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(offline_fallback(dir.path(), "GET", "/api/territories").is_none());
    }

    // A 500 is the server talking. Replaying yesterday's body over it would
    // hide a real outage behind stale data.
    #[tokio::test]
    async fn an_upstream_500_is_passed_through() {
        let base = stub(axum::Router::new().route(
            "/api/territories",
            get(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
        ))
        .await;
        let client = reqwest::Client::new();
        let upstream = url::Url::parse(&base).unwrap();
        let res = send(&client, &upstream, "GET", "/api/territories", Default::default(), Vec::new())
            .await
            .unwrap();
        assert_eq!(res.status(), 500);
        assert!(!res.status().is_success(), "nothing here may be replaced by a snapshot");
    }
```

- [ ] **Step 6: Убедиться, что падают**

Run: `cargo test proxy`
Expected: FAIL — `cannot find function offline_fallback`

- [ ] **Step 7: Реализовать в `proxy.rs`**

```rust
/// Replays the last good body for a request whose network call failed at the
/// transport level. An HTTP status never reaches here — a 500 is an answer.
pub fn offline_fallback(dir: &std::path::Path, method: &str, path_and_query: &str) -> Option<Response> {
    if !crate::snapshot::cacheable(method, path_and_query) {
        return None;
    }
    let (content_type, body) = crate::snapshot::load(dir, &crate::snapshot::key(method, path_and_query))?;
    Some((StatusCode::OK, [(header::CONTENT_TYPE, content_type)], body).into_response())
}
```

- [ ] **Step 8: Вплести в `forward`**

Ветку `Err(_) => unreachable()` заменить на:

```rust
Err(_) => state
    .user_cache_root()
    .and_then(|root| offline_fallback(&crate::paths::snapshots(&root), method.as_str(), &path_and_query))
    .unwrap_or_else(unreachable),
```

А в `post_process` — сохранять успешные ответы. Заменить ранний `return relay(res)` на:

```rust
if !(res.status().is_success() && crate::snapshot::cacheable(method.as_str(), path_and_query)) {
    return relay(res);
}
// A cacheable JSON GET is buffered so it can be written; these are kilobytes.
let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::OK);
let content_type = res
    .headers()
    .get(header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .unwrap_or("application/json")
    .to_string();
let Ok(bytes) = res.bytes().await else {
    return unreachable();
};
if path_and_query.starts_with("/api/auth/me") {
    if let (Some(user_id), Some(token)) =
        (crate::session::user_id_from_me(&bytes), state.session_cookie())
    {
        crate::session::store(&crate::session::Stored { token, user_id });
    }
}
if let Some(root) = state.user_cache_root() {
    crate::snapshot::save(
        &crate::paths::snapshots(&root),
        &crate::snapshot::key(method.as_str(), path_and_query),
        &content_type,
        &bytes,
    );
}
(status, [(header::CONTENT_TYPE, content_type)], bytes).into_response()
```

Отдельная ветка для `/api/auth/me` из Task 3 больше не нужна — она поглощена этой: `me` теперь и кэшируемый, и источник `user_id`.

- [ ] **Step 9: Тесты проходят**

Run: `cargo test`
Expected: PASS

- [ ] **Step 10: Проверить офлайн вживую**

Запустить приложение против прода, открыть территорию и дождаться загрузки. Выключить Wi-Fi. Перезапустить приложение: список территорий и сама территория открываются. Попытка создать плейсмент показывает toast с ошибкой.

- [ ] **Step 11: Коммит**

```bash
git add desktop/src-tauri/
git commit -m "feat(desktop): replay the last good JSON GET when the network is down"
```

---

## Task 7: Фронтенд — метка десктопа и гейт passkey

**Files:**
- Modify: `frontend/src/auth/infrastructure/webauthn.ts`, `frontend/src/login/login-form.tsx`, `frontend/src/vite-env.d.ts`
- Test: `frontend/src/auth/infrastructure/webauthn.spec.ts`

**Interfaces:**
- Consumes: `window.__DESKTOP__`, выставляется `initialization_script` из Task 1
- Produces: `isPasskeySupported()` возвращает `false` в десктопе

- [ ] **Step 1: Прочитать текущий файл**

```bash
cat frontend/src/auth/infrastructure/webauthn.ts
cat frontend/src/auth/infrastructure/webauthn.spec.ts
sed -n '1,20p' frontend/src/login/login-form.tsx
```

- [ ] **Step 2: Написать падающий тест**

Дописать в `frontend/src/auth/infrastructure/webauthn.spec.ts`:

```ts
describe("isPasskeySupported in the desktop shell", () => {
  afterEach(() => {
    delete (window as { __DESKTOP__?: boolean }).__DESKTOP__;
  });

  // The RP origin inside the shell is a loopback port, which
  // PASSKEY_RP_ORIGINS will never list. A ceremony started here fails with an
  // opaque client-side error and no server log, so the UI must not offer one.
  it("reports unsupported when running inside the desktop shell", () => {
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
    (window as { __DESKTOP__?: boolean }).__DESKTOP__ = true;
    expect(isPasskeySupported()).toBe(false);
  });
});
```

- [ ] **Step 3: Убедиться, что падает**

Run: `cd frontend && yarn test:spa src/auth/infrastructure/webauthn.spec.ts`
Expected: FAIL — возвращается `true`

- [ ] **Step 4: Объявить флаг рядом с тем, кто его читает**

Объявление кладётся в `webauthn.ts` — он уже модуль, и augmentation в нём безопасен:

```ts
declare global {
  interface Window {
    /** Set by the Tauri shell's initialization script. Absent in a browser. */
    __DESKTOP__?: boolean;
  }
}
```

**Не в `vite-env.d.ts`.** Тот файл не содержит верхнеуровневых `import`/`export`, поэтому его `interface ImportMetaEnv` сливается глобально. Добавление `declare global` (а с ним и `export {}`) превращает файл в модуль, слияние пропадает, и `import.meta.env.VITE_API_URL` молча деградирует до `any` — без единой ошибки сборки.

- [ ] **Step 5: Закрыть в `isPasskeySupported`**

```ts
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && !window.__DESKTOP__ && supported();
}
```

- [ ] **Step 6: Тест проходит**

Run: `yarn test:spa src/auth/infrastructure/webauthn.spec.ts`
Expected: PASS

- [ ] **Step 7: Убрать дублирующую проверку в `login-form.tsx`**

Строка 12 — вторая копия того же условия. Если починить только `isPasskeySupported`, экран входа спрячет кнопку, а `/account` продолжит предлагать «добавить ключ» и падать. Заменить инлайн-выражение на импорт:

```ts
import { isPasskeySupported } from "@/auth/infrastructure/webauthn";
```

и использовать `isPasskeySupported()` там, где стояла локальная константа. Удалить `!navigator.userAgent.includes("Electron") && typeof window.PublicKeyCredential === "function"`.

- [ ] **Step 8: Полная проверка фронта**

Run: `yarn lint && yarn test && yarn test:spa`
Expected: PASS

- [ ] **Step 9: Проверить в браузере, что ничего не сломалось**

Run: `yarn dev` и открыть `http://localhost:3000/login`. Кнопка входа по passkey на месте.

- [ ] **Step 10: Коммит**

```bash
git add frontend/src/auth/infrastructure/webauthn.ts frontend/src/auth/infrastructure/webauthn.spec.ts frontend/src/login/login-form.tsx frontend/src/vite-env.d.ts
git commit -m "fix(auth): hide passkey UI in the desktop shell, in one place instead of two"
```

---

## Task 8: CI, Makefile, документация

**Files:**
- Create: `.github/workflows/desktop.yml`, `desktop/Makefile`, `desktop/README.md`
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: всё предыдущее

- [ ] **Step 1: Создать `desktop/Makefile`**

```makefile
.PHONY: check fmt lint test build

check: fmt lint test

fmt:
	cd src-tauri && cargo fmt --check

lint:
	cd src-tauri && cargo clippy --all-targets -- -D warnings

test:
	cd src-tauri && cargo test

build:
	yarn --cwd ../frontend build
	cd src-tauri && cargo tauri build
```

`cargo tauri` — это отдельный CLI: `cargo install tauri-cli --version "^2"`. В CI его ставит `tauri-action`, локально — руками. Дописать это в `desktop/README.md` рядом с rustup.

- [ ] **Step 2: Прогнать**

Run: `make -C desktop check`
Expected: PASS. Если `cargo fmt --check` ругается — `cd desktop/src-tauri && cargo fmt` и повторить.

- [ ] **Step 3: Создать `.github/workflows/desktop.yml`**

Первый workflow в репозитории — `.github/workflows/` сейчас пуст.

```yaml
name: desktop

on:
  push:
    tags: ["desktop-v*"]
  pull_request:
    paths:
      - "desktop/**"
      - "frontend/**"
      - ".github/workflows/desktop.yml"

jobs:
  check:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      # webkit2gtk and its friends are what tauri links against; without them
      # cargo fails at link time, not at compile time, which reads as a mystery.
      - run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: desktop/src-tauri
      - run: make -C desktop check

  build:
    needs: check
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-22.04, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - uses: dtolnay/rust-toolchain@stable
      - if: matrix.os == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: desktop/src-tauri
      - run: yarn --cwd frontend install --frozen-lockfile
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: desktop
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Создать `desktop/README.md`**

````markdown
# Andrey Desktop

Tauri v2 shell around the existing SPA. A loopback HTTP server inside the Rust
process serves the embedded `frontend/dist` and proxies `/api` to the gateway,
which reproduces production's nginx topology — that is what lets the
single-origin frontend run unchanged.

Design: [`docs/superpowers/specs/2026-08-04-tauri-desktop-design.md`](../docs/superpowers/specs/2026-08-04-tauri-desktop-design.md)

## Prerequisites

Rust via [rustup](https://rustup.rs), plus the platform packages listed in
[tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/).

## Commands

```bash
make check                                  # fmt + clippy + test
make build                                  # bundle for the current OS
cd src-tauri && cargo run                   # run against production
DESKTOP_UPSTREAM=http://localhost:8080 cargo run   # run against a local compose
```

The frontend is still developed with `yarn dev` in a browser. `cargo run`
serves a built `dist`, so rebuild the frontend after changing it.

## Manual checklist per OS

None of these can be covered by `cargo test`. Run all of them on macOS, Linux
and Windows before tagging a release.

- [ ] A territory renders and orbits smoothly. **On Linux this is the main
      risk**: WebKitGTK falls back to software rendering on some drivers and a
      large scene crawls. Known workaround: `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- [ ] A Draco + KTX2 model shows textures. A flat-coloured model means the CSP
      blocked the decoder — the failure is silent, not an error.
- [ ] A PDF document opens and scrolls (pdf.js loads it by byte range).
- [ ] Uploading a model shows live conversion progress (SSE).
- [ ] Reopening a territory issues no network requests for the GLB.
- [ ] With the network off, a previously opened territory still opens.
- [ ] Signing in as a second user does not serve the first user's models.
````

- [ ] **Step 5: Дописать раздел в корневой `README.md`**

В таблицу «Repository layout» добавить строку `desktop/`, а в «Components» — абзац с ссылкой на `desktop/README.md`, по образцу существующих разделов про `frontend/` и `backend/`.

- [ ] **Step 6: Дописать раздел в `CLAUDE.md`**

После раздела про фронтенд добавить:

````markdown
## Desktop shell (`desktop/`)

Tauri v2 wrapper around the same SPA. A loopback axum server inside the Rust
process serves the embedded `frontend/dist` through `app.asset_resolver()` and
proxies `/api` to the gateway, reproducing production's nginx topology. That is
deliberate and load-bearing: the frontend is single-origin by design — the
session cookie has to ride on three.js loader requests, the pdf.js `<iframe>`
and `EventSource`, none of which can carry a header — so anything that changes
the origin breaks asset loading while login still appears to work.

- **Never point the webview at a remote URL directly.** `tauri://localhost` is
  cross-site to the gateway, `SameSite=Lax` withholds the cookie, and models,
  PDFs and SSE all fail while the login screen looks fine.
- The session cookie never reaches the webview: the proxy holds it in a jar and
  strips `Set-Cookie`, storing the token in the OS keychain.
- The loopback port is gated by a per-run nonce cookie handed out with
  `index.html`. Any new response path that bypasses the guard opens an
  authenticated session to every local process.
- `/api/assets/{hash}` is cached on disk per `(upstream, user)`. The split is
  not tidiness: serving from cache skips the gateway's `RequireBlobAccess`, so
  a shared directory would leak one tenant's models to the next user.
- Passkeys are unavailable in the shell (the RP origin is a loopback port).
  `isPasskeySupported()` is the single gate — do not add a second check.
- `make -C desktop check` runs fmt, clippy and tests.
````

- [ ] **Step 7: Финальный прогон обеих половин**

```bash
make -C desktop check
cd frontend && yarn lint && yarn test && yarn test:spa
```

Expected: PASS

- [ ] **Step 8: Коммит и PR**

```bash
git add .github/workflows/desktop.yml desktop/Makefile desktop/README.md README.md CLAUDE.md
git commit -m "ci(desktop): build on three runners, document the shell and its traps"
git push -u origin feat/tauri-desktop
gh pr create --base main --title "feat: Tauri v2 desktop client" --body "..."
```

Тело PR: ссылка на спеку, список задач, и явное «без подписи и автообновления — в объём не входит».

---

## Self-review

**Покрытие спеки.** Раскладка и сборка → Task 1 и 8. Прокси, маршрутизация, сессия, keychain → Task 3. Nonce → Task 2. CSP → Task 2 Step 6. Кэш блобов, hex-валидация, sha256, per-user директория → Task 4. LRU → Task 5. Офлайн → Task 6. Фронтенд → Task 7. Ошибки: 503 в формате бэкенда — Task 3 (`unreachable`); порт не поднялся — `spawn` возвращает `io::Result`, и `setup()` пробрасывает ошибку, из-за чего Tauri показывает диалог и выходит; keychain недоступен — Task 3 (все ошибки глотаются); кэш не пишется — Task 4 (`file = None`). Тесты → в каждой задаче; ручной чеклист → Task 8. Критерии готовности 1–7 покрыты Task 8 (CI), ручным чеклистом и `cargo test`.

**Плейсхолдеры.** Не осталось. Имя куки сессии проверено по `authhttp/cookie.go:9` и вписано константой `SESSION_COOKIE = "andrey_session"` со ссылкой на источник; единственное «уточнить по месту» — тело PR в последнем шаге.

**Согласованность типов.** `Route` из Task 1 используется в Task 2 (`matches!(route, Route::Index)`). `Nonce::matches` принимает `Option<&str>` во всех вызовах. `session::Stored` конструируется одинаково в Task 3 и Task 6. `paths::user_root` вызывается только через `state.user_cache_root()`. `proxy::send`/`relay`/`unreachable` используются и в `forward`, и в `handle_asset` из Task 4. `snapshot::key` берёт `(method, path_and_query)` в обоих вызовах. Ветка `/api/auth/me` из Task 3 явно поглощается в Task 6 Step 8 — иначе она осталась бы недостижимым дублем.

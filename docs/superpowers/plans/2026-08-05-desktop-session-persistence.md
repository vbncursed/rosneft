# Desktop Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пользователь, вошедший в десктоп-приложение, остаётся в аккаунте после
его перезапуска.

**Architecture:** loopback-сервер шелла перестаёт брать порт у ядра и садится на
фиксированный `17817`, из-за чего origin вебвью — а с ним и `localStorage`, где
живёт маркер сессии SPA — перестаёт меняться от запуска к запуску. Второй
процесс приложения гасится плагином single-instance, чтобы он не отбирал порт.
Отдельно `AppState::clear_session` перестаёт удалять запись из связки ключей,
пока восстановление сессии не отработало, — иначе фикс origin меняет
детерминированный баг на плавающий.

**Tech Stack:** Rust 2021, Tauri v2, axum 0.8, `tauri-plugin-single-instance` v2,
`keyring` 3.

**Спека:** [`docs/superpowers/specs/2026-08-05-desktop-session-persistence-design.md`](../specs/2026-08-05-desktop-session-persistence-design.md)

## Global Constraints

- Ветка `fix/desktop-session-persistence`, отведена от `main`. В `main` не коммитить.
- Каждая задача заканчивается зелёным `make -C desktop check` (fmt + clippy `-D warnings` + `cargo test`).
- `make -C desktop check` требует существующего `frontend/dist` — `tauri::generate_context!()` вшивает его на этапе компиляции. Если каталога нет: `yarn --cwd frontend build`.
- Решение, которому нужен тест, живёт в чистой функции, а обработчик её вызывает — конвенция `desktop/CLAUDE.md`-секции в корневом `CLAUDE.md` (`dispatch`, `asset_disposition`, `cacheable`, `read_session_cookie`).
- Порт: `17817`. Значение выбрано ниже эфемерных диапазонов всех трёх платформ (Linux 32768–60999, macOS/Windows 49152–65535).
- Имя переменной окружения: `DESKTOP_PORT`.
- Хвост каждого коммит-сообщения: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| файл | что меняется |
| --- | --- |
| `desktop/src-tauri/src/server.rs` | `PORT`, `preferred_port`, `bind_loopback`; `spawn` вызывает их. Тесты в существующем `mod tests`. |
| `desktop/src-tauri/src/state.rs` | `clears_keychain` + правка `clear_session`. Тесты в существующем `mod tests`. |
| `desktop/src-tauri/src/main.rs` | регистрация `tauri_plugin_single_instance` первой в билдере. |
| `desktop/src-tauri/Cargo.toml` | зависимость `tauri-plugin-single-instance`. |
| `desktop/README.md` | переменная `DESKTOP_PORT`. |
| `CLAUDE.md` | два инварианта в секции Desktop shell. |

---

### Task 1: Фиксированный порт loopback-сервера

**Files:**
- Modify: `desktop/src-tauri/src/server.rs:23-42` (блок `spawn`) и `mod tests` в конце файла
- Modify: `desktop/README.md:24-30` (блок Commands)
- Modify: `CLAUDE.md` (секция «Desktop shell (`desktop/`)»)

**Interfaces:**
- Produces: `const PORT: u16 = 17817;`, `fn preferred_port(env: Option<&str>) -> u16`, `fn bind_loopback(preferred: u16) -> std::io::Result<std::net::TcpListener>` — все приватные для модуля `server`.
- Consumes: ничего.

- [ ] **Step 1: Написать падающие тесты**

В `desktop/src-tauri/src/server.rs`, внутри существующего `#[cfg(test)] mod tests`, добавить в конец:

```rust
    #[test]
    fn the_default_port_is_the_fixed_one() {
        assert_eq!(preferred_port(None), PORT);
    }

    #[test]
    fn the_environment_overrides_the_port() {
        assert_eq!(preferred_port(Some("41573")), 41573);
    }

    // A typo in an environment variable must not cost the user a dead window.
    #[test]
    fn an_unparseable_override_falls_back_to_the_fixed_port() {
        assert_eq!(preferred_port(Some("")), PORT);
        assert_eq!(preferred_port(Some("http://x")), PORT);
        assert_eq!(preferred_port(Some("70000")), PORT);
    }

    // The fixed port is what keeps the webview's origin — and the localStorage
    // the SPA's session marker lives in — stable across runs. When some other
    // process holds it, the shell must still come up: one login is the old
    // behaviour, a dead window is not.
    #[test]
    fn a_taken_port_falls_back_to_an_ephemeral_one() {
        let taken = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = taken.local_addr().unwrap().port();

        let listener = bind_loopback(port).expect("a taken port must not fail the launch");
        assert_ne!(listener.local_addr().unwrap().port(), port);
    }

    // Asks for a port proven free by binding and releasing it. The window
    // between the two is microseconds; nothing else in this suite allocates
    // from the ephemeral pool at that moment.
    #[test]
    fn a_free_port_is_used_as_asked() {
        let port = {
            let probe = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
            probe.local_addr().unwrap().port()
        };
        let listener = bind_loopback(port).expect("a free port must bind");
        assert_eq!(listener.local_addr().unwrap().port(), port);
    }

    // A stale `dsk` cookie from the previous run now arrives on a fixed port,
    // where before every run had a fresh origin. index.html is served without
    // a matching nonce on purpose, and `serve_static` overwrites the cookie
    // from the `?dsk=` query — so the handoff heals itself and the window
    // never locks itself out.
    #[test]
    fn a_stale_nonce_cookie_still_gets_the_index() {
        let nonce = Nonce::new();
        let stale = "dsk=00000000000000000000000000000000";
        assert_eq!(
            dispatch("/", &nonce, Some(stale)),
            Dispatch::Static(Route::Index)
        );
        assert!(nonce.matches_query(Some(&nonce.query_param())));
    }
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd desktop/src-tauri && cargo test --lib 2>&1 | head -30`
Expected: FAIL с `cannot find function \`preferred_port\`` и `cannot find function \`bind_loopback\`` (тест про устаревшую куку компилируется и пройдёт сразу — он фиксирует уже существующее поведение).

- [ ] **Step 3: Реализовать**

В `desktop/src-tauri/src/server.rs` вставить перед `pub fn spawn`:

```rust
/// The loopback port the webview's origin is built from, and therefore the key
/// its `localStorage` is partitioned by. It must not change between runs: the
/// SPA's session marker (`andrey.authed`, `session-marker.ts`) lives there, and
/// a fresh origin every launch is a fresh empty store — which sends the route
/// guard to /login while the proxy's restored session sits unused. That was the
/// whole of "the desktop app logs me out every restart".
///
/// Below every platform's ephemeral range (Linux 32768–60999, macOS and Windows
/// 49152–65535), so the kernel never hands this number to another process.
const PORT: u16 = 17817;

/// `DESKTOP_PORT` exists so a dev build can run beside an installed copy
/// without stealing its origin. Anything unparseable falls back to `PORT`
/// rather than failing the launch.
fn preferred_port(env: Option<&str>) -> u16 {
    env.and_then(|v| v.parse().ok()).unwrap_or(PORT)
}

/// Binds the fixed port, falling back to an ephemeral one when another process
/// holds it. The fallback costs the user one login — the origin, and with it
/// `localStorage`, is new — which is exactly the behaviour this change
/// replaces, so it degrades to the old state rather than to a failure.
fn bind_loopback(preferred: u16) -> std::io::Result<std::net::TcpListener> {
    match std::net::TcpListener::bind(("127.0.0.1", preferred)) {
        Ok(listener) => Ok(listener),
        Err(e) => {
            log::warn!(
                "loopback port {preferred} is taken ({e}); falling back to an ephemeral port, \
                 which will ask for a login"
            );
            std::net::TcpListener::bind(("127.0.0.1", 0))
        }
    }
}
```

В теле `spawn` заменить первую строку:

```rust
pub fn spawn(state: Shared) -> std::io::Result<SocketAddr> {
    let env = std::env::var("DESKTOP_PORT").ok();
    let listener = bind_loopback(preferred_port(env.as_deref()))?;
    listener.set_nonblocking(true)?;
```

(остальное тело `spawn` не трогать)

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd desktop/src-tauri && cargo test --lib`
Expected: PASS, включая шесть новых тестов.

- [ ] **Step 5: Обновить README**

В `desktop/README.md`, в блок ```` ```bash ```` секции «Commands», после строки с `DESKTOP_UPSTREAM` добавить:

```bash
DESKTOP_PORT=17818 cargo run                       # run beside an installed copy
```

И сразу под блоком — абзац:

```markdown
The loopback server binds a **fixed** port (`17817`). That is not cosmetic: the
webview's origin is built from it, `localStorage` is partitioned by origin, and
the SPA keeps its session marker there — an ephemeral port means an empty store
and a login prompt on every launch. `DESKTOP_PORT` overrides it so a dev build
can run beside an installed copy instead of fighting it for the origin.
```

- [ ] **Step 6: Обновить CLAUDE.md**

В `CLAUDE.md`, в секцию «Desktop shell (`desktop/`)», добавить пункт списка сразу после пункта, начинающегося «**Never point the webview at a remote URL directly.**»:

```markdown
- **The loopback port is fixed (`17817`), and that is load-bearing.** The
  webview's origin is `http://127.0.0.1:<port>`, `localStorage` is partitioned
  by origin, and the SPA's session marker (`andrey.authed`) lives in it — so an
  ephemeral port handed the router guard an empty store on every launch and
  bounced the user to `/login` while a perfectly good session sat in the
  proxy's jar. It also threw away the WebKit HTTP cache, IndexedDB and the
  service worker each start. The number is below every platform's ephemeral
  range (Linux 32768–60999, macOS/Windows 49152–65535) so the kernel cannot
  hand it out; `DESKTOP_PORT` overrides it for a dev build running beside an
  installed one. If the port is taken, `bind_loopback` falls back to an
  ephemeral one and logs a warning — one login, which is the old behaviour, not
  a broken window.
```

- [ ] **Step 7: Прогнать полную проверку**

Run: `make -C desktop check`
Expected: fmt, clippy и тесты зелёные.

- [ ] **Step 8: Коммит**

```bash
git add desktop/src-tauri/src/server.rs desktop/README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
fix(desktop): bind a fixed loopback port so the webview origin is stable

The port was ephemeral, so every launch built a new origin, and localStorage
is partitioned by origin — the SPA's session marker was gone on every start
and the route guard bounced to /login with a valid session in the proxy's jar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 401 до восстановления сессии не трогает связку ключей

**Files:**
- Modify: `desktop/src-tauri/src/state.rs:52-55` (`clear_session`) и `mod tests` в конце файла
- Modify: `CLAUDE.md` (секция «Desktop shell (`desktop/`)»)

**Interfaces:**
- Consumes: `crate::session::Stored { token: String, user_id: String }` (уже существует, `session.rs:6-10`).
- Produces: `pub fn clears_keychain(current: Option<&crate::session::Stored>) -> bool` в модуле `state`.

- [ ] **Step 1: Написать падающие тесты**

В `desktop/src-tauri/src/state.rs`, внутри существующего `#[cfg(test)] mod tests`, добавить в конец:

```rust
    #[test]
    fn a_held_session_is_dropped_from_the_keychain_too() {
        let stored = crate::session::Stored {
            token: "t".to_string(),
            user_id: "usr_1".to_string(),
        };
        assert!(clears_keychain(Some(&stored)));
    }

    // `main.rs` restores the keychain entry off the critical path, so a 401 can
    // land before it does — and `proxy::clears_session` turns every 401 into a
    // clear. Deleting on that path destroys a credential this process never
    // read, which turns a transient failure into a permanent logout.
    #[test]
    fn a_clear_before_the_restore_lands_leaves_the_keychain_alone() {
        assert!(!clears_keychain(None));
    }
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd desktop/src-tauri && cargo test --lib state 2>&1 | head -20`
Expected: FAIL с `cannot find function \`clears_keychain\` in this scope`.

- [ ] **Step 3: Реализовать**

В `desktop/src-tauri/src/state.rs` заменить `clear_session` (строки 52-55):

```rust
    pub fn clear_session(&self) {
        let mut session = self.session.lock().unwrap();
        if clears_keychain(session.take().as_ref()) {
            crate::session::clear();
        }
    }
```

И добавить свободную функцию сразу после блока `impl AppState` (рядом с `resolve_cache_root`):

```rust
/// Whether dropping the in-memory session must also delete the stored one.
///
/// Only when this process actually held one. The keychain entry is restored off
/// the critical path (`main.rs`), so a 401 can arrive before it lands, and
/// `proxy::clears_session` turns every 401 into a clear. Deleting there would
/// destroy a credential this process never read — a prompting or slow keychain
/// read would become a permanent logout instead of one skipped restore. Logout
/// and a 401 against a live session are unaffected: the session is `Some` in
/// both, and so is a login while signed in, which is what keeps
/// `user_cache_root` from handing B one of A's blobs.
pub fn clears_keychain(current: Option<&crate::session::Stored>) -> bool {
    current.is_some()
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd desktop/src-tauri && cargo test --lib`
Expected: PASS, включая два новых теста.

- [ ] **Step 5: Обновить CLAUDE.md**

В `CLAUDE.md`, в секцию «Desktop shell (`desktop/`)», добавить пункт сразу после пункта «**Never read the OS keychain on the startup path or the request path.**»:

```markdown
- **`clear_session` deletes the keychain entry only if this process actually
  held a session.** The restore runs off the critical path, so a 401 can land
  before it does, and `proxy::clears_session` turns every 401 into a clear —
  deleting there destroys a credential this run never read and makes a slow or
  prompting keychain read a permanent logout. The decision is `clears_keychain`
  in `state.rs`, kept pure because `session::clear()` writes to the real OS
  keychain and cannot be exercised in a test.
```

- [ ] **Step 6: Прогнать полную проверку**

Run: `make -C desktop check`
Expected: fmt, clippy и тесты зелёные.

- [ ] **Step 7: Коммит**

```bash
git add desktop/src-tauri/src/state.rs CLAUDE.md
git commit -m "$(cat <<'EOF'
fix(desktop): keep the keychain entry when a 401 beats the session restore

The restore runs off the startup critical path, so an early 401 called
clear_session with nothing in memory and deleted a credential this process
had never read — a transient failure became a permanent logout.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Одна копия приложения на машину

**Files:**
- Modify: `desktop/src-tauri/Cargo.toml` (блок `[dependencies]`)
- Modify: `desktop/src-tauri/src/main.rs:27-39` (голова билдера)

**Interfaces:**
- Consumes: `tauri::Manager` (уже импортирован в `main.rs:15`), `bind_loopback` из Task 1 (косвенно — плагин не даёт до неё дойти второму процессу).
- Produces: ничего для последующих задач.

Юнит-теста здесь нет и не будет: поведение проявляется только у запущенного приложения (второй процесс + окно). Проверяется компиляцией в этой задаче и живым прогоном в Task 4. Не выдумывать тест ради галочки.

- [ ] **Step 1: Добавить зависимость**

В `desktop/src-tauri/Cargo.toml`, в `[dependencies]`, рядом с `tauri-plugin-dialog` и `tauri-plugin-log`:

```toml
# A second process would bind the fallback loopback port (the fixed one is
# taken by the first), and its login would delete the keychain entry the first
# instance is running on. On macOS a second launch of the .app already just
# activates the running one; on Windows it really does start a second process.
tauri-plugin-single-instance = "2"
```

- [ ] **Step 2: Зарегистрировать плагин**

В `desktop/src-tauri/src/main.rs` вставить первым в цепочку билдера, **до** `tauri_plugin_log`:

```rust
    tauri::Builder::default()
        // First in the chain, as the plugin requires: a second launch has to be
        // stopped before it can build a window or reach `server::spawn`. The
        // loopback port is fixed now, so a second process would take the
        // ephemeral fallback — a different origin, an empty localStorage, and a
        // login whose `POST /api/auth/login` deletes the keychain entry the
        // first instance is still using.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        // Default targets are stdout and a file in the platform log directory.
```

(остаток цепочки — `.plugin(tauri_plugin_log::…)` и далее — не трогать)

- [ ] **Step 3: Проверить, что собирается и линтуется**

Run: `make -C desktop check`
Expected: fmt, clippy `-D warnings` и тесты зелёные. Если clippy ругается на неиспользуемые параметры замыкания — они уже названы `_args`/`_cwd`, менять ничего не нужно.

- [ ] **Step 4: Коммит**

```bash
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock desktop/src-tauri/src/main.rs
git commit -m "$(cat <<'EOF'
fix(desktop): allow only one running instance

With a fixed loopback port a second process falls back to an ephemeral one,
gets its own empty origin, and its login deletes the keychain entry the first
instance is running on. Focus the existing window instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Живая проверка на собранном приложении

**Files:** ничего не меняется, кроме `docs/superpowers/plans/2026-08-05-desktop-session-persistence.md` (отметки о выполнении).

**Interfaces:**
- Consumes: всё из Task 1–3.
- Produces: подтверждение, что жалоба закрыта.

Юнит-тесты доказывают решения, а не поведение приложения. Симптом был виден только вживую — значит и закрывать его надо вживую.

- [ ] **Step 1: Зафиксировать исходное состояние хранилища вебвью**

```bash
ls ~/Library/WebKit/fun.vbncursed.andrey.desktop/WebsiteData/Default | wc -l
```

Записать число. Каждый бакет — один origin, то есть один порт из прошлых запусков.

- [ ] **Step 2: Собрать фронтенд и запустить шелл**

```bash
yarn --cwd frontend build
cd desktop/src-tauri && cargo run
```

Ожидаемо: окно открывается, экран логина.

- [ ] **Step 3: Войти в аккаунт, затем полностью выйти из приложения**

Войти под тестовым пользователем. Дождаться, что территории видны (то есть сессия рабочая). Затем **завершить приложение целиком** (Cmd+Q, не закрытие окна).

- [ ] **Step 4: Запустить снова и проверить главное**

```bash
cd desktop/src-tauri && cargo run
```

Expected: приложение открывается **сразу в аккаунте**, экрана логина нет.

- [ ] **Step 5: Проверить, что новых origin-бакетов не появилось**

```bash
ls ~/Library/WebKit/fun.vbncursed.andrey.desktop/WebsiteData/Default | wc -l
```

Expected: то же число, что в шаге 1 (плюс не больше одного — бакет нового фиксированного порта, если раньше его не было).

- [ ] **Step 6: Проверить лог**

```bash
grep -c "is taken" ~/Library/Logs/fun.vbncursed.andrey.desktop/Andrey.log
```

Expected: `0` — фиксированный порт был свободен, fallback не срабатывал.

- [ ] **Step 7: Проверить, что запись в связке ключей уцелела и не переписывалась**

```bash
security find-generic-password -s "fun.vbncursed.andrey.desktop" 2>&1 | grep -E "cdat|mdat"
```

Expected: `cdat` и `mdat` — момент логина из шага 3, а не текущее время. Перезапуск не создал новой записи, значит логина не было.

- [ ] **Step 8: Проверить второй экземпляр**

```bash
cd desktop/src-tauri && cargo run
```

при уже запущенном приложении. Expected: второй процесс завершается, окно первого выходит на передний план. В логе нет `is taken`.

- [ ] **Step 9: Коммит отметок в плане**

```bash
git add docs/superpowers/plans/2026-08-05-desktop-session-persistence.md
git commit -m "$(cat <<'EOF'
docs: mark the desktop session persistence plan verified live

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## После плана

1. PR из `fix/desktop-session-persistence` в `main`, слить через `--merge`.
2. `/code-review` на PR.
3. Обновить `docs/superpowers/continue-here.md`.
4. Ревизия артефакта-отчёта аудита.

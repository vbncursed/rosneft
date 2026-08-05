#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cache;
mod evict;
mod guard;
mod paths;
mod proxy;
mod server;
mod session;
mod snapshot;
mod spa;
mod state;

use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use url::Url;

const DEFAULT_UPSTREAM: &str = "https://andrey.vbncursed.fun";

/// Marks the shell for the frontend. Passkey ceremonies cannot succeed here —
/// the RP origin is a loopback port that PASSKEY_RP_ORIGINS will never list —
/// so the UI that offers them has to know it is running inside the app.
const INIT_SCRIPT: &str = "window.__DESKTOP__ = true;";

fn main() {
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
        // The crate had no logging at all, and with no console in a release
        // build a failure on someone else's machine left nothing to read.
        // Info, not the default Trace: tao logs every `validAttributesForMarkedText`
        // the webview asks for, and a support log nobody can read is the same
        // as no log.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let upstream =
                std::env::var("DESKTOP_UPSTREAM").unwrap_or_else(|_| DEFAULT_UPSTREAM.to_string());
            let upstream = Url::parse(&upstream)?;
            let cache_dir = app.path().app_cache_dir()?;

            let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
            // Released by the restore closure below, whatever it finds. Until
            // then every gateway-bound request waits on it — see
            // `proxy::await_restore` for why that beats letting them 401.
            let (restored_tx, restored) = tokio::sync::watch::channel(false);
            let state = Arc::new(state::AppState {
                app: Some(app.handle().clone()),
                restored,
                upstream: upstream.clone(),
                http: reqwest::Client::builder()
                    .cookie_provider(jar.clone())
                    .build()?,
                cache_dir,
                nonce: guard::Nonce::new(),
                jar: jar.clone(),
                session: Arc::new(std::sync::Mutex::new(None)),
            });

            // Restoring the session saved on a previous run reads the OS
            // keychain, which can pop a macOS authorization prompt when the
            // binary's signature has changed since the entry was written
            // (any rebuild, any app update). Blocking `setup()` on that read
            // means no server and no window until a human clicks the prompt
            // — worse than the white-screen failure this shell was built to
            // avoid. So it runs off the critical path: `server::spawn` and
            // the window below do not wait for it.
            //
            // Requests do, though. Letting a request that arrives first go out
            // with no session was the plan once, and it is what made the app
            // look amnesiac: `/api/auth/me` took a 401 while the dialog was
            // still on screen, and the SPA dropped its session marker and went
            // to /login. `proxy::await_restore` holds those requests instead —
            // the window is already up, so the wait reads as a spinner behind a
            // dialog the user is answering anyway.
            {
                let state = state.clone();
                let jar = jar.clone();
                let upstream = upstream.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    match session::load() {
                        Some(stored) => {
                            jar.add_cookie_str(
                                &format!("{}={}; Path=/", state::SESSION_COOKIE, stored.token),
                                &upstream,
                            );
                            *state.session.lock().unwrap() = Some(stored);
                            log::info!("session restored from the keychain");

                            // Startup is the only moment nothing can be
                            // mid-download, so everything left in tmp/ was
                            // orphaned by a hard kill — the one case the
                            // `TempFile` Drop guard in cache.rs cannot cover.
                            // Moved here (from a plain `setup()` check) because
                            // the cache root needs the session just loaded.
                            if let Some(root) = state.user_cache_root() {
                                let _ = evict::enforce_cap(&paths::blobs(&root), evict::CAP_BYTES);
                                let _ = std::fs::remove_dir_all(paths::tmp(&root));
                            }
                        }
                        None => log::info!("no stored session; the app will ask for a login"),
                    }
                    // Releases every request waiting on the read, found or not.
                    // Must run on both paths, or a first launch with nothing
                    // stored would stall every call for the whole budget.
                    let _ = restored_tx.send(true);
                });
            }

            // The nonce is handed to the webview here and nowhere else: the
            // first response to a URL carrying it turns it into a cookie
            // (server.rs, `serve_static`). Any other local process asking for
            // `/` gets index.html with no cookie and cannot go further.
            let nonce_query = state.nonce.query_param();

            let addr = match server::spawn(state) {
                Ok(addr) => addr,
                Err(e) => {
                    // Propagating this only ever reached `.expect()` in a
                    // process with no console (`windows_subsystem = "windows"`),
                    // so the app simply never appeared and said nothing.
                    //
                    // `show`, not `blocking_show`: `setup` runs on the main
                    // thread and `blocking_show` freezes the app there (its own
                    // doc comment says so). This queues the dialog onto the
                    // event loop `run()` is about to start and exits when the
                    // user dismisses it — no window is created in the meantime.
                    log::error!("cannot bind the loopback server: {e}");
                    app.dialog()
                        .message(format!("Andrey could not start its local server.\n\n{e}"))
                        .kind(MessageDialogKind::Error)
                        .title("Andrey")
                        .show(|_| std::process::exit(1));
                    return Ok(());
                }
            };
            let url = Url::parse(&format!("http://{addr}/?{nonce_query}"))?;

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

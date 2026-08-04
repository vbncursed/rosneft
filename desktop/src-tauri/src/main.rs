#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cache;
mod evict;
mod guard;
mod paths;
mod proxy;
mod server;
mod session;
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
            let upstream =
                std::env::var("DESKTOP_UPSTREAM").unwrap_or_else(|_| DEFAULT_UPSTREAM.to_string());
            let upstream = Url::parse(&upstream)?;
            let cache_dir = app.path().app_cache_dir()?;

            let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
            // Restore the session saved on a previous run so the user isn't
            // asked to log in again after closing and reopening the app.
            if let Some(stored) = session::load() {
                jar.add_cookie_str(
                    &format!("{}={}; Path=/", state::SESSION_COOKIE, stored.token),
                    &upstream,
                );
            }

            let state = Arc::new(state::AppState {
                app: app.handle().clone(),
                upstream,
                http: reqwest::Client::builder()
                    .cookie_provider(jar.clone())
                    .build()?,
                cache_dir,
                nonce: guard::Nonce::new(),
                jar,
            });

            if let Some(root) = state.user_cache_root() {
                let blobs = paths::blobs(&root);
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = evict::enforce_cap(&blobs, evict::CAP_BYTES);
                });

                // Startup is the only moment nothing can be mid-download, so
                // everything left in tmp/ was orphaned by a hard kill — the
                // one case the `TempFile` Drop guard in cache.rs cannot cover.
                let tmp = paths::tmp(&root);
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = std::fs::remove_dir_all(&tmp);
                });
            }

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

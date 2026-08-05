use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use futures_util::StreamExt;
use std::net::SocketAddr;
use tower::ServiceExt;
use tower_http::services::ServeFile;

use crate::guard::Nonce;
use crate::spa::{classify, Route};
use crate::state::Shared;

pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/api/assets/{hash}", any(handle_asset))
        .fallback(any(handle))
        .with_state(state)
}

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

/// Binds 127.0.0.1 on the fixed port and serves in a background task. Returns
/// the bound address so the caller can point the webview at it.
pub fn spawn(state: Shared) -> std::io::Result<SocketAddr> {
    let env = std::env::var("DESKTOP_PORT").ok();
    let listener = bind_loopback(preferred_port(env.as_deref()))?;
    listener.set_nonblocking(true)?;
    let addr = listener.local_addr()?;
    let app = router(state);
    tauri::async_runtime::spawn(async move {
        let listener =
            tokio::net::TcpListener::from_std(listener).expect("std listener converts to tokio");
        // If this ever returns, the window is pointed at a dead port and every
        // request fails with nothing on screen to say why. There is no console
        // under `windows_subsystem = "windows"`, so the log file is the only
        // place a support ticket from another machine can come from.
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("loopback server stopped: {e}");
        }
    });
    Ok(addr)
}

async fn handle(State(state): State<Shared>, req: Request<Body>) -> Response {
    let cookie = req
        .headers()
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(str::to_string);

    match dispatch(&path, &state.nonce, cookie.as_deref()) {
        Dispatch::Forbidden => StatusCode::FORBIDDEN.into_response(),
        Dispatch::Api => crate::proxy::forward(&state, req).await,
        Dispatch::Static(route) => serve_static(&state, route, query.as_deref()),
    }
}

/// Cache-through handler for /api/assets/{hash}. A hit is served by
/// `ServeFile` so `Range` requests still work (pdf.js needs it); a miss is
/// proxied and teed to disk so a later request is a hit.
async fn handle_asset(
    State(state): State<Shared>,
    Path(hash): Path<String>,
    req: Request<Body>,
) -> Response {
    let cookie = req
        .headers()
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok());
    if !state.nonce.matches(cookie) {
        return StatusCode::FORBIDDEN.into_response();
    }
    // Not just `forward`'s concern: this handler reads `user_cache_root()`
    // itself, and before the restore lands that is `None` — the request would
    // skip the cache and go out with no session cookie.
    crate::proxy::await_restore(&state.restored, crate::proxy::RESTORE_WAIT).await;
    // {hash} becomes a filename below (join + is_file), so it must be proven
    // safe before it touches the filesystem in any way — not after.
    if !crate::cache::is_valid_hash(&hash) {
        return crate::proxy::forward(&state, req).await;
    }

    let root = state.user_cache_root();
    let path = root.as_deref().map(|r| crate::paths::blobs(r).join(&hash));
    let file_exists = path.as_deref().is_some_and(std::path::Path::is_file);

    match asset_disposition(root.is_some(), file_exists) {
        AssetDisposition::Passthrough => crate::proxy::forward(&state, req).await,
        AssetDisposition::Hit => {
            let path = path.expect("Hit implies root and path are Some");
            // ServeFile answers Range, and pdf.js loads documents by range. Its
            // Service::Error is Infallible (tower-http 0.6.11,
            // services/fs/serve_dir/mod.rs), so there is no failure case to fall
            // back from here — and thus no need to keep `req` alive past the move
            // into `oneshot` for a fallback call that could never run.
            match ServeFile::new(&path).oneshot(req).await {
                Ok(res) => res.into_response(),
                Err(never) => match never {},
            }
        }
        AssetDisposition::Miss => {
            let root = root.expect("Miss implies root and path are Some");
            let path = path.expect("Miss implies root and path are Some");

            let method = req.method().clone();
            let headers = req.headers().clone();
            let pq = req
                .uri()
                .path_and_query()
                .map(|p| p.as_str().to_string())
                .unwrap_or_default();
            let res = match crate::proxy::send(
                &state.http,
                &state.upstream,
                method.as_str(),
                &pq,
                headers,
                Vec::new(),
            )
            .await
            {
                Ok(r) => r,
                Err(_) => return crate::proxy::unreachable(),
            };
            // Only a complete 200 is cacheable: a 206 is a slice and a 404 is not content.
            if res.status() != reqwest::StatusCode::OK {
                return crate::proxy::relay(res);
            }
            let _ = tokio::fs::create_dir_all(crate::paths::blobs(&root)).await;

            // Blocking fs walk, kept off the async worker. Fire-and-forget: eviction
            // failing is not a reason to fail the download it was triggered by.
            let blobs = crate::paths::blobs(&root);
            tauri::async_runtime::spawn_blocking(move || {
                let _ = crate::evict::enforce_cap(&blobs, crate::evict::CAP_BYTES);
            });

            // Same header policy as every other upstream-derived response,
            // Content-Length included: the tee changes no byte count, and
            // without it a first-time GLB download streams chunked and
            // GLTFLoader's progress bar loses `lengthComputable` on exactly
            // the request where a progress bar is worth having.
            //
            // Declaring a length is why `tee_to_disk` holds back one chunk:
            // hyper stops polling a body the moment the declared length is
            // satisfied, so the promote has to already have happened by then.
            let out = crate::proxy::copy_headers(
                Response::builder().status(StatusCode::OK),
                res.headers(),
            );
            let upstream = res.bytes_stream().map(|c| c.map_err(std::io::Error::other));
            let teed = crate::cache::tee_to_disk(upstream, crate::paths::tmp(&root), path, hash);
            out.body(Body::from_stream(teed))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
    }
}

/// Pure request-disposition decision for `handle_asset`, pulled out so the
/// no-cache-root / hit-vs-miss branching is unit-testable without a Tauri
/// `AppHandle` — the same pattern as `dispatch()` below and
/// `snapshot::cacheable`. Hash validity is not an input here: it is a
/// trust boundary (the hash becomes a filename), so it is a guard clause at
/// the top of `handle_asset`, before this function — or any I/O — ever runs.
#[derive(Debug, PartialEq, Eq)]
enum AssetDisposition {
    /// No user cache root yet: skip the cache and let the proxy handle it.
    Passthrough,
    /// A cache file already exists at the computed path.
    Hit,
    /// Nothing cached yet: fetch from upstream and tee to disk.
    Miss,
}

fn asset_disposition(has_cache_root: bool, file_exists: bool) -> AssetDisposition {
    if !has_cache_root {
        return AssetDisposition::Passthrough;
    }
    if file_exists {
        AssetDisposition::Hit
    } else {
        AssetDisposition::Miss
    }
}

/// What `handle` does with a request, decided in one pure function so the gate
/// can be tested against real paths rather than against a classification —
/// which is the mistake this replaces.
#[derive(Debug, PartialEq, Eq)]
enum Dispatch {
    Forbidden,
    Api,
    Static(Route),
}

// This is the one place that decides whether the loopback port hands out an
// authenticated gateway session or not.
fn dispatch(path: &str, nonce: &Nonce, cookie: Option<&str>) -> Dispatch {
    let has_nonce = nonce.matches(cookie);
    // Checked by prefix, and *before* `classify`: `classify` answers `Index`
    // for every path whose last segment has no dot, and no API path has one,
    // so gating on the classification let the entire API — /api/territories,
    // /api/auth/me, every mutation — through with no cookie at all.
    if path.starts_with("/api/") {
        return if has_nonce {
            Dispatch::Api
        } else {
            Dispatch::Forbidden
        };
    }
    let route = classify(path);
    // index.html is the one response served without the nonce, so a stray
    // navigation gets the app shell rather than an error. It gets no cookie
    // with it (see `serve_static`), so none of its subresources will load —
    // which is the point.
    if has_nonce || matches!(route, Route::Index) {
        Dispatch::Static(route)
    } else {
        Dispatch::Forbidden
    }
}

fn serve_static(state: &Shared, route: Route, query: Option<&str>) -> Response {
    let asset_path = match route {
        Route::NotFound => return StatusCode::NOT_FOUND.into_response(),
        Route::Index => "index.html".to_string(),
        Route::Asset(p) => p,
    };
    let is_index = asset_path == "index.html";
    // None only in tests, which cannot build a Tauri handle; production always
    // has one (main.rs).
    let Some(app) = state.app.as_ref() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    match app.asset_resolver().get(asset_path) {
        Some(asset) => {
            let mut res = ([(header::CONTENT_TYPE, asset.mime_type)], asset.bytes).into_response();
            if is_index {
                // Only the request that already proves it knows the nonce gets
                // it as a cookie. A reload of a deep router path carries no
                // query but does carry the cookie set on the first load, so it
                // needs nothing here.
                if state.nonce.matches_query(query) {
                    if let Ok(v) = state.nonce.set_cookie().parse() {
                        res.headers_mut().append(header::SET_COOKIE, v);
                    }
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
/// header is ours.
///
/// `'unsafe-eval'` is load-bearing and cannot be narrowed to
/// `'wasm-unsafe-eval'`. The KTX2/Basis transcoder in `public/basis/` is
/// Emscripten output, and its embind layer builds every binding with
/// `new Function(...)` (`craftInvokerFunction`); `'wasm-unsafe-eval'` permits
/// compiling WebAssembly and nothing else, so the transcoder throws at init.
/// `'unsafe-eval'` already covers WASM compilation, which is why it is not
/// listed alongside.
///
/// The failure is invisible, which is why this must not be tightened back
/// without opening the app: the throw surfaces as an unhandled promise
/// rejection, `useProgressiveLod` never observes a load failure, never drops
/// the level from its chain, and the coarsest LOD stays on screen. On a
/// territory whose lower LODs carry no geometry that is an empty dark scene
/// with nothing in the console but the rejection itself.
///
/// The loosening is real but narrow: the only scripts this origin serves are
/// our own bundle and those decoders, from a loopback port gated by a per-run
/// nonce.
const CSP: &str = "default-src 'self'; \
     script-src 'self' 'unsafe-eval' 'unsafe-inline'; \
     worker-src 'self' blob:; \
     style-src 'self' 'unsafe-inline'; \
     img-src 'self' data: blob:; \
     font-src 'self' data:; \
     connect-src 'self' blob: data:; \
     frame-src 'self'";

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::Body;
    use tower::ServiceExt;

    fn cookie(nonce: &Nonce) -> String {
        format!("dsk={}", nonce.value())
    }

    #[test]
    fn index_is_allowed_without_a_cookie() {
        let nonce = Nonce::new();
        assert_eq!(dispatch("/", &nonce, None), Dispatch::Static(Route::Index));
        assert_eq!(
            dispatch("/territories/foo", &nonce, None),
            Dispatch::Static(Route::Index)
        );
    }

    #[test]
    fn asset_is_denied_without_a_cookie() {
        let nonce = Nonce::new();
        assert_eq!(
            dispatch("/assets/app.js", &nonce, None),
            Dispatch::Forbidden
        );
    }

    #[test]
    fn asset_is_allowed_with_the_matching_cookie() {
        let nonce = Nonce::new();
        assert_eq!(
            dispatch("/assets/app.js", &nonce, Some(&cookie(&nonce))),
            Dispatch::Static(Route::Asset("assets/app.js".into()))
        );
    }

    #[test]
    fn not_found_is_denied_without_a_cookie() {
        let nonce = Nonce::new();
        assert_eq!(dispatch("/sw.js", &nonce, None), Dispatch::Forbidden);
    }

    // The whole product lives under /api, and none of its paths has a dot in
    // the last segment — so `classify` calls every one of them `Index`, and a
    // gate that asked `classify` first answered "no cookie needed" for the
    // entire authenticated gateway session.
    #[test]
    fn the_api_is_denied_without_a_cookie() {
        let nonce = Nonce::new();
        for path in [
            "/api/territories",
            "/api/auth/me",
            "/api/models",
            "/api/assets/deadbeef",
            "/api/jobs/j1/events",
        ] {
            assert_eq!(
                dispatch(path, &nonce, None),
                Dispatch::Forbidden,
                "{path} must not be reachable without the nonce"
            );
        }
    }

    #[test]
    fn the_api_is_allowed_with_the_matching_cookie() {
        let nonce = Nonce::new();
        assert_eq!(
            dispatch("/api/territories", &nonce, Some(&cookie(&nonce))),
            Dispatch::Api
        );
    }

    // The route-level counterpart: `dispatch` is pure and could still be
    // wired up wrong. This drives the real router, so it fails if `handle`
    // ever stops consulting the gate before proxying.
    #[tokio::test]
    async fn the_router_refuses_an_api_request_with_no_cookie() {
        let dir = tempfile::tempdir().unwrap();
        let state = crate::state::test_state("http://127.0.0.1:1", dir.path().into(), None);
        let res = router(state)
            .oneshot(
                Request::builder()
                    .uri("/api/territories")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    // /api/assets/{hash} is its own route, so it does not pass through
    // `handle` at all and needs its own proof.
    #[tokio::test]
    async fn the_router_refuses_an_asset_request_with_no_cookie() {
        let dir = tempfile::tempdir().unwrap();
        let state = crate::state::test_state("http://127.0.0.1:1", dir.path().into(), None);
        let res = router(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/api/assets/{}", "a".repeat(64)))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn passthrough_without_a_cache_root() {
        // Before login there is no directory the cache may safely use, no
        // matter what the (nonexistent) file check says.
        assert_eq!(
            asset_disposition(false, false),
            AssetDisposition::Passthrough
        );
        assert_eq!(
            asset_disposition(false, true),
            AssetDisposition::Passthrough
        );
    }

    #[test]
    fn hit_when_the_file_already_exists() {
        assert_eq!(asset_disposition(true, true), AssetDisposition::Hit);
    }

    #[test]
    fn miss_when_nothing_is_cached_yet() {
        assert_eq!(asset_disposition(true, false), AssetDisposition::Miss);
    }

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
    // where before every run had a fresh origin. index.html is served without a
    // matching nonce on purpose, and `serve_static` overwrites the cookie from
    // the `?dsk=` query — so the handoff heals itself and the window never
    // locks itself out.
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
}

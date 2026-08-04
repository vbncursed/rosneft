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

/// Binds 127.0.0.1 on an ephemeral port and serves in a background task.
/// Returns the bound address so the caller can point the webview at it.
pub fn spawn(state: Shared) -> std::io::Result<SocketAddr> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    let addr = listener.local_addr()?;
    let app = router(state);
    tauri::async_runtime::spawn(async move {
        let listener =
            tokio::net::TcpListener::from_std(listener).expect("std listener converts to tokio");
        let _ = axum::serve(listener, app).await;
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

    let route = classify(&path);
    if !allowed(&route, &state.nonce, cookie.as_deref()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if path.starts_with("/api/") {
        return crate::proxy::forward(&state, req).await;
    }
    serve_static(&state, route)
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
    }
}

/// Pure request-disposition decision for `handle_asset`, pulled out so the
/// no-cache-root / hit-vs-miss branching is unit-testable without a Tauri
/// `AppHandle` — the same pattern as `allowed()` below and
/// `proxy::buffers_response`. Hash validity is not an input here: it is a
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

// Pulled out of `handle` so the gate itself is unit-testable without an
// AppHandle: this is the one place that decides whether the loopback port
// hands out an authenticated gateway session or not.
fn allowed(route: &Route, nonce: &Nonce, cookie: Option<&str>) -> bool {
    // index.html is the only response allowed without the nonce: it is what
    // hands the nonce out, both on a cold start and on a reload of a deep
    // router path.
    matches!(route, Route::Index) || nonce.matches(cookie)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_is_allowed_without_a_cookie() {
        let nonce = Nonce::new();
        assert!(allowed(&Route::Index, &nonce, None));
    }

    #[test]
    fn asset_is_denied_without_a_cookie() {
        let nonce = Nonce::new();
        assert!(!allowed(
            &Route::Asset("assets/app.js".into()),
            &nonce,
            None
        ));
    }

    #[test]
    fn asset_is_allowed_with_the_matching_cookie() {
        let nonce = Nonce::new();
        let cookie = format!("dsk={}", nonce.value());
        assert!(allowed(
            &Route::Asset("assets/app.js".into()),
            &nonce,
            Some(&cookie)
        ));
    }

    #[test]
    fn not_found_is_denied_without_a_cookie() {
        let nonce = Nonce::new();
        assert!(!allowed(&Route::NotFound, &nonce, None));
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
}

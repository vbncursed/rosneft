use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use std::net::SocketAddr;

use crate::guard::Nonce;
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
}

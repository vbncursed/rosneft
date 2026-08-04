use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use std::net::SocketAddr;

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

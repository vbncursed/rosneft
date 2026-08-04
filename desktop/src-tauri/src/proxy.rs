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

/// Shared by `send` and `forward`: resolves the upstream URL and copies every
/// header except hop-by-hop, Host and Cookie. Host and Cookie belong to the
/// loopback origin, not the gateway; the client's own jar supplies the real
/// session cookie.
fn filtered_request(
    client: &reqwest::Client,
    upstream: &url::Url,
    method: &str,
    path_and_query: &str,
    headers: &HeaderMap,
) -> reqwest::RequestBuilder {
    let mut url = upstream.clone();
    url.set_path("");
    url.set_query(None);
    let url = url.join(path_and_query).unwrap_or(url);

    let mut req = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
        url,
    );
    for (k, v) in headers.iter() {
        let name = k.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&name.as_str()) || name == "host" || name == "cookie" {
            continue;
        }
        req = req.header(k, v);
    }
    req
}

/// reqwest's cookie jar captures Set-Cookie while `.send()` runs, but still
/// hands the header back on the `Response` it returns (verified against the
/// installed reqwest 0.12.28 source: `cookie::service::ResponseFuture::poll`
/// stores the cookie and returns `res` unmodified). Strip it at the source so
/// no caller of `send`/`forward` can forget to.
fn strip_set_cookie(res: &mut reqwest::Response) {
    res.headers_mut().remove(header::SET_COOKIE);
}

/// Raw upstream call. Split out so tests can drive it without a Tauri app.
/// `forward` streams instead of calling this for /api/ traffic (see its doc
/// comment); `handle_asset` (server.rs) is its production caller for the
/// asset-proxy path.
pub async fn send(
    client: &reqwest::Client,
    upstream: &url::Url,
    method: &str,
    path_and_query: &str,
    headers: HeaderMap,
    body: Vec<u8>,
) -> reqwest::Result<reqwest::Response> {
    let mut req = filtered_request(client, upstream, method, path_and_query, &headers);
    if !body.is_empty() {
        req = req.body(body);
    }
    let mut res = req.send().await?;
    strip_set_cookie(&mut res);
    Ok(res)
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

/// SSE (`/api/jobs/{id}/events`) and 8 MB upload chunks go through this path,
/// so the request body is streamed straight into the outbound reqwest body
/// (`into_data_stream` -> `Body::wrap_stream`) rather than buffered with
/// `axum::body::to_bytes`: buffering would hold whole upload chunks in memory
/// and stall the request until the last byte arrived. GET/HEAD carry no body.
pub async fn forward(state: &Shared, req: Request<Body>) -> Response {
    let method = req.method().clone();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());
    let headers = req.headers().clone();
    let body_stream = req.into_body().into_data_stream();

    let mut builder = filtered_request(
        &state.http,
        &state.upstream,
        method.as_str(),
        &path_and_query,
        &headers,
    );
    if method != Method::GET && method != Method::HEAD {
        builder = builder.body(reqwest::Body::wrap_stream(body_stream));
    }

    match builder.send().await {
        Ok(mut res) => {
            strip_set_cookie(&mut res);
            post_process(state, &method, &path_and_query, res).await
        }
        Err(_) => unreachable(),
    }
}

/// Only `GET /api/auth/me` buffers; everything else (SSE, uploads, ...)
/// streams straight through `relay`. Pure predicate, pulled out of
/// `post_process` so this rule is directly assertable without a live
/// upstream or an `AppState`.
fn buffers_response(method: &Method, path_and_query: &str) -> bool {
    method == Method::GET && path_and_query.starts_with("/api/auth/me")
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
    if method == Method::POST
        && path_and_query.starts_with("/api/auth/logout")
        && res.status().is_success()
    {
        crate::session::clear();
    }
    if !(buffers_response(method, path_and_query) && res.status().is_success()) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::Json;

    /// Spawns a throwaway upstream and returns its base URL.
    async fn stub(router: axum::Router) -> String {
        let l = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
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

        let client = reqwest::Client::builder()
            .cookie_store(true)
            .build()
            .unwrap();
        let upstream = url::Url::parse(&base).unwrap();
        let res = send(
            &client,
            &upstream,
            "GET",
            "/api/auth/login",
            Default::default(),
            Vec::new(),
        )
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

        let client = reqwest::Client::builder()
            .cookie_store(true)
            .build()
            .unwrap();
        let upstream = url::Url::parse(&base).unwrap();
        send(
            &client,
            &upstream,
            "GET",
            "/api/auth/login",
            Default::default(),
            Vec::new(),
        )
        .await
        .unwrap();
        let echo = send(
            &client,
            &upstream,
            "GET",
            "/api/echo",
            Default::default(),
            Vec::new(),
        )
        .await
        .unwrap();

        assert!(echo.text().await.unwrap().contains("session=secret"));
    }

    #[tokio::test]
    async fn strips_cookie_host_and_hop_by_hop_headers_before_forwarding() {
        let base = stub(axum::Router::new().route(
            "/api/echo-headers",
            get(|headers: axum::http::HeaderMap| async move {
                axum::Json(serde_json::json!({
                    "cookie": headers.get(header::COOKIE).and_then(|v| v.to_str().ok()),
                    "connection": headers.get(header::CONNECTION).and_then(|v| v.to_str().ok()),
                    "host": headers.get(header::HOST).and_then(|v| v.to_str().ok()),
                    "accept": headers.get(header::ACCEPT).and_then(|v| v.to_str().ok()),
                }))
            }),
        ))
        .await;

        let client = reqwest::Client::new();
        let upstream = url::Url::parse(&base).unwrap();

        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            "dsk=loopback-nonce-must-not-leave".parse().unwrap(),
        );
        headers.insert(header::HOST, "127.0.0.1:1234".parse().unwrap());
        headers.insert(header::CONNECTION, "keep-alive".parse().unwrap());
        headers.insert(header::ACCEPT, "application/json".parse().unwrap());

        let res = send(
            &client,
            &upstream,
            "GET",
            "/api/echo-headers",
            headers,
            Vec::new(),
        )
        .await
        .unwrap();
        let body: serde_json::Value = serde_json::from_str(&res.text().await.unwrap()).unwrap();

        assert_eq!(
            body["cookie"],
            serde_json::Value::Null,
            "the loopback nonce cookie must not reach the gateway"
        );
        assert_eq!(
            body["connection"],
            serde_json::Value::Null,
            "hop-by-hop headers must not be forwarded"
        );
        assert_ne!(
            body["host"].as_str().unwrap(),
            "127.0.0.1:1234",
            "Host must be the upstream's own authority, not the loopback origin's"
        );
        assert_eq!(
            body["accept"],
            serde_json::json!("application/json"),
            "a normal header must still be forwarded"
        );
    }

    #[test]
    fn only_get_auth_me_buffers() {
        assert!(buffers_response(&Method::GET, "/api/auth/me"));
        assert!(buffers_response(&Method::GET, "/api/auth/me?x=1"));
    }

    #[test]
    fn everything_else_streams() {
        assert!(!buffers_response(&Method::POST, "/api/auth/me"));
        assert!(!buffers_response(&Method::GET, "/api/jobs/abc/events"));
        assert!(!buffers_response(&Method::PATCH, "/api/uploads/abc"));
        assert!(!buffers_response(&Method::GET, "/api/territories"));
    }
}

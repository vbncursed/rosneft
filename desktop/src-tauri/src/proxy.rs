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
/// header except hop-by-hop, Host, Cookie and Accept-Encoding. Host and Cookie
/// belong to the loopback origin, not the gateway; the client's own jar
/// supplies the real session cookie. Accept-Encoding is dropped so what the
/// webview negotiates can never drift from what reqwest is built to decode:
/// reqwest fills in its own (gzip/br/deflate — see Cargo.toml) and strips
/// Content-Encoding once it has decoded the body.
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
        if HOP_BY_HOP.contains(&name.as_str())
            || name == "host"
            || name == "cookie"
            || name == "accept-encoding"
        {
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

/// The one header policy for every response derived from an upstream one.
///
/// Hop-by-hop headers describe this proxy's connection to the gateway, and
/// Set-Cookie is the session, which must never reach the webview. Everything
/// else passes through — ETag above all, since the webview's `If-None-Match`
/// revalidation depends on having received one, and Content-Length, which
/// `GLTFLoader` needs for `lengthComputable` on a first-time model download.
///
/// There used to be four of these, one per response-building path, and they
/// disagreed: the buffered branch rebuilt the response from Content-Type
/// alone (losing ETag, and losing Content-Encoding off a body reqwest could
/// not decode), while the asset-miss branch forwarded hop-by-hop headers.
pub fn copy_headers(
    mut out: axum::http::response::Builder,
    headers: &HeaderMap,
) -> axum::http::response::Builder {
    for (k, v) in headers.iter() {
        let name = k.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&name.as_str()) || name == "set-cookie" {
            continue;
        }
        out = out.header(k, v);
    }
    out
}

/// Copies an upstream response back to the webview, dropping Set-Cookie so the
/// session lives only in the proxy's jar and the OS keychain.
pub fn relay(res: reqwest::Response) -> Response {
    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let out = copy_headers(Response::builder().status(status), res.headers());
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

/// Replays the last good body for a request whose network call failed at the
/// transport level. An HTTP status never reaches here — a 500 is an answer.
pub fn offline_fallback(
    dir: &std::path::Path,
    method: &str,
    path_and_query: &str,
) -> Option<Response> {
    if !crate::snapshot::cacheable(method, path_and_query) {
        return None;
    }
    let (content_type, body) =
        crate::snapshot::load(dir, &crate::snapshot::key(method, path_and_query))?;
    Some((StatusCode::OK, [(header::CONTENT_TYPE, content_type)], body).into_response())
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
        Err(_) => state
            .user_cache_root()
            .and_then(|root| {
                offline_fallback(
                    &crate::paths::snapshots(&root),
                    method.as_str(),
                    &path_and_query,
                )
            })
            .unwrap_or_else(unreachable),
    }
}

/// Successful GETs on the cacheable set are buffered so they can be written
/// to the snapshot store; everything else (SSE, uploads, mutations, ...)
/// streams straight through `relay`. /api/auth/me is a member of that set —
/// it is also the only place the user id is available, and the id is what
/// keys the per-user cache directory — so its session bookkeeping lives
/// inside the same buffered branch rather than a separate one.
async fn post_process(
    state: &Shared,
    method: &Method,
    path_and_query: &str,
    res: reqwest::Response,
) -> Response {
    let status = res.status().as_u16();
    if clears_session(status, method.as_str(), path_and_query) {
        state.clear_session();
    }
    if !snapshot_worthy(status, method.as_str(), path_and_query) {
        return relay(res);
    }
    // A cacheable JSON GET is buffered so it can be written; these are kilobytes.
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
    let headers = res.headers().clone();
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let Ok(bytes) = res.bytes().await else {
        return unreachable();
    };
    if path_and_query.starts_with("/api/auth/me") {
        if let (Some(user_id), Some(token)) = (
            crate::session::user_id_from_me(&bytes),
            state.session_cookie(),
        ) {
            state.store_session(crate::session::Stored { token, user_id });
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
    copy_headers(Response::builder().status(status), &headers)
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

/// Whether an upstream response must drop the stored session.
///
/// Login is on the list and its status is deliberately not consulted. Nothing
/// in the SPA stops a signed-in user from reaching `/login`, and the user id
/// only refreshes when the following `/api/auth/me` lands — so between
/// login-as-B and that call, `user_cache_root()` would still resolve to A's
/// directory and an asset hit would hand B one of A's blobs without ever
/// asking the gateway, which is precisely the check `RequireBlobAccess` is.
/// Clearing here leaves the root `None` until `/me` answers, and
/// `asset_disposition` already routes that to `Passthrough`.
fn clears_session(status: u16, method: &str, path_and_query: &str) -> bool {
    if status == 401 {
        return true;
    }
    if method != "POST" {
        return false;
    }
    path_and_query.starts_with("/api/auth/login")
        || (path_and_query.starts_with("/api/auth/logout") && (200..300).contains(&status))
}

/// Whether a response should be buffered and written to the snapshot store.
///
/// Only a 200. A 204 is a success (`is_success()` would take it) with no body,
/// and replaying an empty document offline would read as a real, if empty,
/// answer instead of the error it should surface.
fn snapshot_worthy(status: u16, method: &str, path_and_query: &str) -> bool {
    status == 200 && crate::snapshot::cacheable(method, path_and_query)
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
        let res = send(
            &client,
            &upstream,
            "GET",
            "/api/territories",
            Default::default(),
            Vec::new(),
        )
        .await
        .unwrap();
        assert_eq!(res.status(), 500);
        assert!(
            !res.status().is_success(),
            "nothing here may be replaced by a snapshot"
        );
    }

    // The policy is "a 200 is written". A 204 is success (is_success() would
    // have accepted it) but has no body to snapshot; treating it as
    // snapshot-worthy would replay an empty document later as if it were a
    // real, if empty, answer instead of the error it should surface offline.
    #[test]
    fn only_a_200_is_snapshot_worthy() {
        assert!(snapshot_worthy(200, "GET", "/api/territories"));
        assert!(!snapshot_worthy(204, "GET", "/api/territories"));
        assert!(!snapshot_worthy(500, "GET", "/api/territories"));
        assert!(!snapshot_worthy(200, "POST", "/api/territories"));
    }

    #[test]
    fn a_401_clears_the_session() {
        assert!(clears_session(401, "GET", "/api/territories"));
    }

    #[test]
    fn a_successful_logout_clears_the_session() {
        assert!(clears_session(200, "POST", "/api/auth/logout"));
        assert!(!clears_session(500, "POST", "/api/auth/logout"));
    }

    // Signing in as somebody else must drop the previous user id immediately,
    // whatever the login answers: until /api/auth/me lands, `user_cache_root`
    // would otherwise still point at the previous user's blobs.
    #[test]
    fn any_login_attempt_clears_the_session() {
        assert!(clears_session(200, "POST", "/api/auth/login"));
        assert!(clears_session(400, "POST", "/api/auth/login"));
        assert!(clears_session(200, "POST", "/api/auth/login/2fa"));
    }

    #[test]
    fn an_ordinary_read_leaves_the_session_alone() {
        assert!(!clears_session(200, "GET", "/api/territories"));
        assert!(!clears_session(200, "GET", "/api/auth/me"));
    }

    fn gzipped(body: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        e.write_all(body).unwrap();
        e.finish().unwrap()
    }

    /// The round trip nothing covered: a compressed upstream 200 on a
    /// cacheable route must reach the webview as readable JSON with its ETag
    /// intact, land in the snapshot store as *decoded* bytes, and come back
    /// out of it once the upstream is gone.
    ///
    /// The gzip body is the point. Every live check during this project used
    /// plain `curl`, which sends no `Accept-Encoding`, so the gateway answered
    /// uncompressed and the missing decoder went unnoticed for eight reviews:
    /// the webview was getting gzip bytes labelled `application/json` and
    /// `res.json()` threw.
    #[tokio::test]
    async fn a_compressed_response_round_trips_through_the_snapshot_store() {
        const BODY: &[u8] = br#"[{"slug":"dji-wp-46-cut","title":"DJI"}]"#;

        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let addr = listener.local_addr().unwrap();
        let serving = tokio::spawn(async move {
            let _ = axum::serve(
                listener,
                axum::Router::new().route(
                    "/api/territories",
                    get(|| async {
                        (
                            [
                                (header::CONTENT_TYPE, "application/json"),
                                (header::CONTENT_ENCODING, "gzip"),
                                (header::ETAG, "\"abc123\""),
                            ],
                            gzipped(BODY),
                        )
                    }),
                ),
            )
            .await;
        });

        let dir = tempfile::tempdir().unwrap();
        let state = crate::state::test_state(
            &format!("http://{addr}"),
            dir.path().into(),
            Some(crate::session::Stored {
                token: "t".into(),
                user_id: "usr_1".into(),
            }),
        );

        let online = forward(
            &state,
            Request::builder()
                .uri("/api/territories")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(online.status(), StatusCode::OK);
        assert!(
            online.headers().get(header::CONTENT_ENCODING).is_none(),
            "reqwest decodes the body, so no encoding header may survive to the webview"
        );
        assert_eq!(
            online.headers().get(header::ETAG).unwrap(),
            "\"abc123\"",
            "without the ETag the webview cannot revalidate and refetches every JSON GET in full"
        );
        let body = axum::body::to_bytes(online.into_body(), 64 * 1024)
            .await
            .unwrap();
        assert_eq!(&body[..], BODY, "the webview must receive parseable JSON");

        // Take the upstream away; the same call must now answer from disk.
        serving.abort();
        let _ = serving.await;

        let offline = forward(
            &state,
            Request::builder()
                .uri("/api/territories")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(offline.status(), StatusCode::OK);
        let body = axum::body::to_bytes(offline.into_body(), 64 * 1024)
            .await
            .unwrap();
        assert_eq!(
            &body[..],
            BODY,
            "the snapshot must hold decoded bytes, not whatever was on the wire"
        );
    }
}

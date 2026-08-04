use reqwest::cookie::CookieStore;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use url::Url;

#[derive(Clone)]
pub struct AppState {
    /// Read only by `serve_static`, to pull files out of the embedded `dist`.
    /// `None` only in tests: a Tauri `AppHandle` cannot be constructed outside
    /// a running app, and making the one field that needs one optional is what
    /// lets the router itself be exercised — the nonce gate on `/api/**` and
    /// the upstream→snapshot→replay round trip — instead of only the pure
    /// predicates sitting behind it.
    pub app: Option<AppHandle>,
    pub upstream: Url,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
    pub nonce: crate::guard::Nonce,
    pub jar: Arc<reqwest::cookie::Jar>,
    /// The source of truth for the signed-in session. Read on every request
    /// via `user_cache_root` (asset lookups, snapshot save/replay), so it
    /// must never be the keychain: a stale keychain ACL can pop a macOS
    /// authorization prompt, and that would hang a request per read instead
    /// of once at startup. The keychain is written through `store_session`/
    /// `clear_session` and read back only at startup, off the critical path
    /// (see `main.rs`).
    pub session: Arc<Mutex<Option<crate::session::Stored>>>,
}

impl AppState {
    /// The gateway's session cookie as the jar currently holds it.
    pub fn session_cookie(&self) -> Option<String> {
        read_session_cookie(&self.jar, &self.upstream)
    }

    /// None until we know who is signed in — before that there is no directory
    /// the cache may safely use, so requests go straight upstream.
    pub fn user_cache_root(&self) -> Option<PathBuf> {
        let session = self.session.lock().unwrap();
        resolve_cache_root(&self.cache_dir, &self.upstream, session.as_ref())
    }

    /// Persists the session to the keychain and updates the in-memory copy
    /// `user_cache_root` reads — the keychain is never read again after
    /// startup, so nothing else keeps this field in sync.
    pub fn store_session(&self, stored: crate::session::Stored) {
        crate::session::store(&stored);
        *self.session.lock().unwrap() = Some(stored);
    }

    pub fn clear_session(&self) {
        crate::session::clear();
        *self.session.lock().unwrap() = None;
    }
}

/// Pure resolution pulled out of `AppState::user_cache_root` so it is
/// unit-testable without an `AppHandle` — same pattern as
/// `read_session_cookie` below. Takes the session as a parameter instead of
/// reading it itself, so the "no session yet" case is provably just a `None`
/// return and not a blocking I/O call.
pub fn resolve_cache_root(
    cache_dir: &Path,
    upstream: &Url,
    session: Option<&crate::session::Stored>,
) -> Option<PathBuf> {
    let stored = session?;
    let host = upstream.host_str()?;
    let host = match upstream.port() {
        Some(p) => format!("{host}:{p}"),
        None => host.to_string(),
    };
    Some(crate::paths::user_root(cache_dir, &host, &stored.user_id))
}

/// Pure lookup pulled out of `AppState::session_cookie` so it is unit-testable
/// without an `AppHandle`: a bare `reqwest::cookie::Jar` is constructible in a
/// test, `AppState` is not.
pub fn read_session_cookie(jar: &reqwest::cookie::Jar, upstream: &Url) -> Option<String> {
    let header = jar.cookies(upstream)?;
    let header = header.to_str().ok()?;
    header
        .split(';')
        .filter_map(|c| c.trim().split_once('='))
        .find(|(k, _)| *k == SESSION_COOKIE)
        .map(|(_, v)| v.to_string())
}

/// Mirrors sessionCookieName in
/// backend/services/gateway-service/internal/transport/authhttp/cookie.go:9.
pub const SESSION_COOKIE: &str = "andrey_session";

pub type Shared = Arc<AppState>;

/// A state with no Tauri handle, for tests that drive the router or the proxy.
/// `session` decides whether `user_cache_root()` resolves, which is what turns
/// the asset cache and the snapshot store on.
#[cfg(test)]
pub fn test_state(
    upstream: &str,
    cache_dir: PathBuf,
    session: Option<crate::session::Stored>,
) -> Shared {
    let jar = Arc::new(reqwest::cookie::Jar::default());
    Arc::new(AppState {
        app: None,
        upstream: Url::parse(upstream).unwrap(),
        http: reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .build()
            .unwrap(),
        cache_dir,
        nonce: crate::guard::Nonce::new(),
        jar,
        session: Arc::new(Mutex::new(session)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_session_yet_is_none() {
        let jar = reqwest::cookie::Jar::default();
        let upstream = Url::parse("http://localhost:8080").unwrap();
        assert_eq!(read_session_cookie(&jar, &upstream), None);
    }

    #[test]
    fn reads_the_session_cookie_out_of_the_jar() {
        let jar = reqwest::cookie::Jar::default();
        let upstream = Url::parse("http://localhost:8080").unwrap();
        jar.add_cookie_str(&format!("{SESSION_COOKIE}=abc123; Path=/"), &upstream);
        assert_eq!(
            read_session_cookie(&jar, &upstream),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn ignores_other_cookies_in_the_jar() {
        let jar = reqwest::cookie::Jar::default();
        let upstream = Url::parse("http://localhost:8080").unwrap();
        jar.add_cookie_str("theme=dark; Path=/", &upstream);
        assert_eq!(read_session_cookie(&jar, &upstream), None);
    }

    #[test]
    fn resolves_the_cache_root_from_an_in_memory_session() {
        let dir = Path::new("/cache");
        let upstream = Url::parse("http://localhost:8080").unwrap();
        let stored = crate::session::Stored {
            token: "t".to_string(),
            user_id: "usr_1".to_string(),
        };
        assert!(resolve_cache_root(dir, &upstream, Some(&stored)).is_some());
    }

    #[test]
    fn no_session_yields_none_without_touching_the_keychain() {
        let dir = Path::new("/cache");
        let upstream = Url::parse("http://localhost:8080").unwrap();
        assert_eq!(resolve_cache_root(dir, &upstream, None), None);
    }
}

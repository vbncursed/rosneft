use reqwest::cookie::CookieStore;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use url::Url;

#[derive(Clone)]
pub struct AppState {
    pub app: AppHandle,
    pub upstream: Url,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
    pub nonce: crate::guard::Nonce,
    pub jar: Arc<reqwest::cookie::Jar>,
}

impl AppState {
    /// The gateway's session cookie as the jar currently holds it.
    pub fn session_cookie(&self) -> Option<String> {
        read_session_cookie(&self.jar, &self.upstream)
    }

    /// None until we know who is signed in — before that there is no directory
    /// the cache may safely use, so requests go straight upstream.
    pub fn user_cache_root(&self) -> Option<PathBuf> {
        let stored = crate::session::load()?;
        let host = self.upstream.host_str()?;
        let host = match self.upstream.port() {
            Some(p) => format!("{host}:{p}"),
            None => host.to_string(),
        };
        Some(crate::paths::user_root(
            &self.cache_dir,
            &host,
            &stored.user_id,
        ))
    }
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
}

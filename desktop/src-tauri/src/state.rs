use reqwest::cookie::CookieStore;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use url::Url;

// cache_dir is wired up by the disk cache added in a later task; this task
// only serves the embedded SPA from `app` and proxies /api through `http`.
#[allow(dead_code)]
#[derive(Clone)]
pub struct AppState {
    pub app: AppHandle,
    pub upstream: Url,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
    pub nonce: crate::guard::Nonce,
    pub jar: Arc<reqwest::cookie::Jar>,
}

#[allow(dead_code)]
impl AppState {
    pub fn upstream_url(&self, path_and_query: &str) -> Url {
        let mut u = self.upstream.clone();
        u.set_path("");
        u.set_query(None);
        // join() on a base whose path is empty resolves the absolute path as-is.
        u.join(path_and_query)
            .unwrap_or_else(|_| self.upstream.clone())
    }

    /// The gateway's session cookie as the jar currently holds it.
    pub fn session_cookie(&self) -> Option<String> {
        let header = self.jar.cookies(&self.upstream)?;
        let header = header.to_str().ok()?;
        header
            .split(';')
            .filter_map(|c| c.trim().split_once('='))
            .find(|(k, _)| *k == SESSION_COOKIE)
            .map(|(_, v)| v.to_string())
    }
}

/// Mirrors sessionCookieName in
/// backend/services/gateway-service/internal/transport/authhttp/cookie.go:9.
pub const SESSION_COOKIE: &str = "andrey_session";

pub type Shared = Arc<AppState>;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use url::Url;

// upstream/http/cache_dir are wired up by the API proxy and disk cache added
// in Tasks 2-6; this task only serves the embedded SPA from `app`.
#[allow(dead_code)]
#[derive(Clone)]
pub struct AppState {
    pub app: AppHandle,
    pub upstream: Url,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
}

#[allow(dead_code)]
impl AppState {
    pub fn upstream_url(&self, path_and_query: &str) -> Url {
        let mut u = self.upstream.clone();
        u.set_path("");
        u.set_query(None);
        // join() on a base whose path is empty resolves the absolute path as-is.
        u.join(path_and_query).unwrap_or_else(|_| self.upstream.clone())
    }
}

pub type Shared = Arc<AppState>;

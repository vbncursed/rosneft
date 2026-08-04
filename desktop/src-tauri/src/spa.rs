#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    /// Path relative to the embedded dist root, no leading slash.
    Asset(String),
    Index,
    NotFound,
}

pub fn classify(path: &str) -> Route {
    let trimmed = path.trim_start_matches('/');
    if trimmed == "sw.js" {
        return Route::NotFound;
    }
    if trimmed.is_empty() {
        return Route::Index;
    }
    // An extension in the last segment means a real file. Everything else is a
    // router path, and the router only exists once index.html has loaded.
    match trimmed.rsplit('/').next() {
        Some(last) if last.contains('.') => Route::Asset(trimmed.to_string()),
        _ => Route::Index,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_is_index() {
        assert_eq!(classify("/"), Route::Index);
    }

    #[test]
    fn file_with_extension_is_an_asset() {
        assert_eq!(classify("/assets/index-a1b2.js"), Route::Asset("assets/index-a1b2.js".into()));
        assert_eq!(classify("/draco/draco_decoder.wasm"), Route::Asset("draco/draco_decoder.wasm".into()));
        assert_eq!(classify("/pdfjs/web/viewer.html"), Route::Asset("pdfjs/web/viewer.html".into()));
    }

    // Deep router paths must fall back to index.html, or a reload on
    // /territories/foo would 404 instead of re-entering the SPA.
    #[test]
    fn extensionless_path_falls_back_to_index() {
        assert_eq!(classify("/territories/dji-wp-46"), Route::Index);
        assert_eq!(classify("/admin/users"), Route::Index);
    }

    // The service worker only caches an offline screen and is useless in the
    // shell; main.tsx already swallows a failed registration.
    #[test]
    fn service_worker_is_refused() {
        assert_eq!(classify("/sw.js"), Route::NotFound);
    }
}

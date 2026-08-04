use sha2::{Digest, Sha256};
use std::path::Path;

/// Which responses may be replayed when the network is gone.
///
/// GET only, and never /api/assets (it has its own cache) nor the job event
/// stream. /api/auth is closed apart from /me, which is load-bearing: the
/// router guard reads it, and without a snapshot there is no offline mode.
///
/// A query string is refused outright, which is what keeps the store bounded.
/// `key` hashes method + path + query, so `/api/audit?limit=50&cursor=…` —
/// cursor-paged infinite scroll — would mint a file per page in a directory
/// nothing ever sweeps. Nothing on the offline boot path carries a query:
/// /api/auth/me, /api/territories and /api/territories/{slug}/scene are all
/// bare paths. This is the cheaper of the two fixes (the other being an
/// `enforce_cap` sweep over snapshots/) and it also drops a snapshot nobody
/// could use: page 2 of a cursor scroll is meaningless without page 1.
pub fn cacheable(method: &str, path: &str) -> bool {
    if method != "GET" || !path.starts_with("/api/") || path.contains('?') {
        return false;
    }
    // `/events` must be the last path segment, not merely a substring — a slug
    // like `events-park` must stay cacheable.
    if path.starts_with("/api/assets/") || path.ends_with("/events") {
        return false;
    }
    if path.starts_with("/api/auth/") {
        return path.starts_with("/api/auth/me");
    }
    true
}

pub fn key(method: &str, path_and_query: &str) -> String {
    hex::encode(Sha256::digest(
        format!("{method} {path_and_query}").as_bytes(),
    ))
}

/// Body and content type in one file: the first line is the type, the rest is
/// the body. Two files would need the pair to stay consistent across crashes.
pub fn save(dir: &Path, key: &str, content_type: &str, body: &[u8]) {
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    let mut blob = Vec::with_capacity(content_type.len() + body.len() + 1);
    blob.extend_from_slice(content_type.as_bytes());
    blob.push(b'\n');
    blob.extend_from_slice(body);
    let tmp = dir.join(format!("{key}.part"));
    if std::fs::write(&tmp, &blob).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join(key));
    }
}

pub fn load(dir: &Path, key: &str) -> Option<(String, Vec<u8>)> {
    let blob = std::fs::read(dir.join(key)).ok()?;
    let split = blob.iter().position(|b| *b == b'\n')?;
    let content_type = String::from_utf8(blob[..split].to_vec()).ok()?;
    Some((content_type, blob[split + 1..].to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn caches_plain_api_gets() {
        assert!(cacheable("GET", "/api/territories"));
        assert!(cacheable("GET", "/api/territories/dji/scene"));
    }

    #[test]
    fn never_caches_mutations() {
        assert!(!cacheable("POST", "/api/territories"));
        assert!(!cacheable("PUT", "/api/placements/1"));
        assert!(!cacheable("DELETE", "/api/placements/1"));
        assert!(!cacheable("PATCH", "/api/uploads/1"));
    }

    // Blobs have their own cache; job events are a stream, not a document.
    #[test]
    fn never_caches_blobs_or_streams() {
        assert!(!cacheable("GET", "/api/assets/abc"));
        assert!(!cacheable("GET", "/api/jobs/j1/events"));
    }

    // The exclusion is the /events route shape, not the substring "events" —
    // a slug that merely starts with it must stay cacheable.
    #[test]
    fn does_not_exclude_a_slug_that_merely_contains_events() {
        assert!(cacheable("GET", "/api/territories/events-park/scene"));
    }

    // /me is the one auth route allowed a snapshot: without it the router guard
    // bounces to /login and there is no offline mode at all.
    #[test]
    fn caches_only_me_out_of_auth() {
        assert!(cacheable("GET", "/api/auth/me"));
        assert!(!cacheable("GET", "/api/auth/passkeys"));
        assert!(!cacheable("GET", "/api/auth/login"));
    }

    // The store has no eviction, and `key` hashes the query — so a paged route
    // would grow a file per page forever. Nothing that boots the app offline
    // carries a query.
    #[test]
    fn never_caches_a_paged_route() {
        assert!(!cacheable("GET", "/api/audit?limit=50&cursor=1200"));
        assert!(!cacheable("GET", "/api/audit/mine?limit=50"));
        assert!(!cacheable("GET", "/api/metrics/query?panel=cpu&range=1h"));
        assert!(cacheable("GET", "/api/audit"));
    }

    #[test]
    fn key_separates_paths_and_queries() {
        assert_ne!(key("GET", "/api/territories"), key("GET", "/api/models"));
        assert_ne!(
            key("GET", "/api/audit?limit=50"),
            key("GET", "/api/audit?limit=10")
        );
        assert_eq!(
            key("GET", "/api/territories"),
            key("GET", "/api/territories")
        );
    }

    #[test]
    fn round_trips_a_snapshot() {
        let d = tempdir().unwrap();
        let k = key("GET", "/api/territories");
        save(d.path(), &k, "application/json", b"[]");
        assert_eq!(
            load(d.path(), &k),
            Some(("application/json".to_string(), b"[]".to_vec()))
        );
    }

    #[test]
    fn a_missing_snapshot_is_none() {
        let d = tempdir().unwrap();
        assert_eq!(load(d.path(), &key("GET", "/api/nothing")), None);
    }
}

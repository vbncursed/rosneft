use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Cache root for one (upstream, user) pair.
///
/// /api/assets/{hash} is gated by RequireBlobAccess on the gateway, and serving
/// from cache skips that check. Splitting the directory per user is what keeps
/// a second tenant on the same machine from reading the first one's models.
pub fn user_root(cache_dir: &Path, host: &str, user_id: &str) -> PathBuf {
    let digest = Sha256::digest(format!("{host}:{user_id}").as_bytes());
    cache_dir.join(hex::encode(&digest[..8]))
}

pub fn blobs(root: &Path) -> PathBuf {
    root.join("blobs")
}

// Not called yet: this task only wires up the blob cache. `snapshots` is
// part of the brief's declared interface for a later task (caching scene
// bundle JSON for offline territory viewing), the same way `cache_dir` and
// `proxy::send` carried this attribute across tasks 1-4.
#[allow(dead_code)]
pub fn snapshots(root: &Path) -> PathBuf {
    root.join("snapshots")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn different_users_get_different_roots() {
        let base = Path::new("/cache");
        let a = user_root(base, "andrey.vbncursed.fun", "usr_1");
        let b = user_root(base, "andrey.vbncursed.fun", "usr_2");
        assert_ne!(a, b);
    }

    #[test]
    fn different_hosts_get_different_roots() {
        let base = Path::new("/cache");
        let a = user_root(base, "andrey.vbncursed.fun", "usr_1");
        let b = user_root(base, "localhost:8080", "usr_1");
        assert_ne!(a, b);
    }

    #[test]
    fn the_root_is_stable() {
        let base = Path::new("/cache");
        assert_eq!(
            user_root(base, "h", "u"),
            user_root(base, "h", "u"),
            "a changing root would silently orphan the whole cache each start"
        );
    }
}

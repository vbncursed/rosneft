use futures_util::Stream;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::AsyncWriteExt;

/// Blob hashes are sha256 hex from upload-service, so anything else is either a
/// bug or an attempt to pick the filename we are about to write.
pub fn is_valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A temp path unique per call, not just per process: two concurrent misses
/// for the same hash (same dest) must not open the same file, or one
/// writer's `File::create` truncates out from under the other's already
/// in-flight write. Lives in `tmp_dir` — a directory `evict::enforce_cap`
/// never scans — not next to `dest`, so a download in progress can never be
/// mistaken for a disposable cache entry.
fn tmp_path(tmp_dir: &Path, hash: &str) -> PathBuf {
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    tmp_dir.join(format!("{hash}.part-{}-{n}", std::process::id()))
}

/// Deletes its path on drop unless disarmed. `async_stream::stream!` has no
/// async destructor, so a stream dropped mid-poll (the webview cancels the
/// fetch, the window closes) never reaches the cleanup tail below — only
/// ordinary sync `Drop` impls run at the suspension point, which is exactly
/// what this is for.
struct TempFile(PathBuf, bool);

impl TempFile {
    fn new(path: PathBuf) -> Self {
        Self(path, true)
    }

    fn disarm(mut self) {
        self.1 = false;
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        if self.1 {
            let _ = std::fs::remove_file(&self.0);
        }
    }
}

/// Passes chunks through to the caller while writing them to a temp file, and
/// promotes the temp file only when the stream ends and the sha256 matches the
/// hash the URL asked for. A dropped stream leaves nothing behind, so an
/// interrupted download can never be served later as a complete model. The
/// temp file is staged in `tmp_dir`, not next to `dest`: `rename` is still
/// atomic across the two because both live under the same cache root and
/// therefore the same filesystem, but a directory `evict::enforce_cap` sweeps
/// never sees a download that is still in progress.
pub fn tee_to_disk<S>(
    upstream: S,
    tmp_dir: PathBuf,
    dest: PathBuf,
    hash: String,
) -> impl Stream<Item = Result<bytes::Bytes, std::io::Error>>
where
    S: Stream<Item = Result<bytes::Bytes, std::io::Error>>,
{
    async_stream::stream! {
        // A cache that cannot write is a cache that is off, not a failed
        // request — same tolerance as the `File::create` below.
        let _ = tokio::fs::create_dir_all(&tmp_dir).await;
        let tmp = tmp_path(&tmp_dir, &hash);
        let guard = TempFile::new(tmp.clone());
        let mut file = tokio::fs::File::create(&tmp).await.ok();
        let mut hasher = Sha256::new();
        let mut complete = false;

        futures_util::pin_mut!(upstream);
        while let Some(item) = upstream.next().await {
            match item {
                Ok(chunk) => {
                    if let Some(f) = file.as_mut() {
                        if f.write_all(&chunk).await.is_err() {
                            file = None;
                        }
                    }
                    hasher.update(&chunk);
                    yield Ok(chunk);
                }
                Err(e) => {
                    yield Err(e);
                    file = None;
                    break;
                }
            }
        }
        if file.is_some() {
            complete = true;
        }

        if let Some(mut f) = file.take() {
            let ok = complete && f.flush().await.is_ok() && hex::encode(hasher.finalize()) == hash;
            drop(f);
            if ok && tokio::fs::rename(&tmp, &dest).await.is_ok() {
                guard.disarm();
                return;
            }
        }
        // Nothing to do here: `guard` removes `tmp` on drop, whether we fall
        // through normally (hash mismatch, write failure) or the whole
        // stream is dropped mid-poll before ever reaching this line.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_sha256_hex() {
        assert!(is_valid_hash(&"a".repeat(64)));
        assert!(is_valid_hash(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
    }

    // {hash} becomes a filename, so this is a trust boundary, not a nicety.
    #[test]
    fn rejects_traversal_and_anything_not_hex() {
        assert!(!is_valid_hash("../../etc/passwd"));
        assert!(!is_valid_hash("..%2f..%2fetc"));
        assert!(!is_valid_hash(
            "ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        ));
        assert!(!is_valid_hash(""));
        assert!(!is_valid_hash(&"a".repeat(63)));
        assert!(!is_valid_hash(&"a".repeat(65)));
    }

    use futures_util::StreamExt;
    use tempfile::tempdir;

    fn chunks(
        data: &[u8],
    ) -> impl futures_util::Stream<Item = Result<bytes::Bytes, std::io::Error>> {
        let parts: Vec<_> = data
            .chunks(3)
            .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
            .collect();
        futures_util::stream::iter(parts)
    }

    // `dest` lives in blobs/, `tmp_dir` in a sibling tmp/ — the same split
    // `evict::enforce_cap` relies on to never see an in-flight download.
    // `blobs/` is pre-created here because the real caller (`handle_asset`)
    // always creates it before invoking `tee_to_disk`; `tmp/` is deliberately
    // left uncreated so these tests also cover `tee_to_disk` creating it.
    fn dirs(root: &std::path::Path) -> (PathBuf, PathBuf) {
        let blobs = root.join("blobs");
        std::fs::create_dir_all(&blobs).unwrap();
        (blobs, root.join("tmp"))
    }

    #[tokio::test]
    async fn writes_the_file_when_the_hash_matches() {
        let dir = tempdir().unwrap();
        let (blobs, tmp_dir) = dirs(dir.path());
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = blobs.join(&hash);

        let mut s = Box::pin(tee_to_disk(
            chunks(data),
            tmp_dir,
            dest.clone(),
            hash.clone(),
        ));
        while let Some(c) = s.next().await {
            c.unwrap();
        }
        drop(s);
        tokio::task::yield_now().await;

        assert_eq!(tokio::fs::read(&dest).await.unwrap(), data);
    }

    #[tokio::test]
    async fn writes_nothing_when_the_hash_does_not_match() {
        let dir = tempdir().unwrap();
        let (blobs, tmp_dir) = dirs(dir.path());
        let hash = "b".repeat(64);
        let dest = blobs.join(&hash);

        let mut s = Box::pin(tee_to_disk(
            chunks(b"hello world"),
            tmp_dir.clone(),
            dest.clone(),
            hash,
        ));
        while let Some(c) = s.next().await {
            c.unwrap();
        }
        drop(s);
        tokio::task::yield_now().await;

        assert!(
            !dest.exists(),
            "a corrupt download must not become a valid cache entry"
        );
        assert_eq!(
            std::fs::read_dir(&blobs).unwrap().count(),
            0,
            "no temp file left behind in blobs/"
        );
        assert_eq!(
            std::fs::read_dir(&tmp_dir).unwrap().count(),
            0,
            "temp file cleaned up from tmp/"
        );
    }

    #[tokio::test]
    async fn writes_nothing_when_the_stream_is_cut_short() {
        let dir = tempdir().unwrap();
        let (blobs, tmp_dir) = dirs(dir.path());
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = blobs.join(&hash);

        let s = tee_to_disk(chunks(data), tmp_dir.clone(), dest.clone(), hash);
        let mut s = Box::pin(s);
        let _ = s.next().await; // take one chunk, then walk away
        drop(s);
        tokio::task::yield_now().await;

        assert!(!dest.exists());
        assert_eq!(
            std::fs::read_dir(&blobs).unwrap().count(),
            0,
            "a stream dropped mid-transfer must not leak its temp file into blobs/"
        );
        assert_eq!(
            std::fs::read_dir(&tmp_dir).unwrap().count(),
            0,
            "a stream dropped mid-transfer must not leak its temp file"
        );
    }

    // Two concurrent misses for the same hash must not open the same temp
    // path — same content masks a real interleaving race in a test (both
    // writers would write identical bytes anyway), so the reliable check is
    // on the naming scheme itself: it must not collide for the same dest,
    // even within one process.
    #[test]
    fn tmp_path_never_collides_for_the_same_dest() {
        let tmp_dir = std::path::Path::new("/cache/tmp");
        let hash = "a".repeat(64);
        assert_ne!(tmp_path(tmp_dir, &hash), tmp_path(tmp_dir, &hash));
    }

    // This is the property Task 5's fix depends on: `evict::enforce_cap`
    // sweeps `paths::blobs(root)`, so a temp path that ever landed there
    // would be eligible for eviction mid-download.
    #[test]
    fn tmp_path_never_lands_in_the_blobs_dir() {
        let root = std::path::Path::new("/cache/root");
        let blobs = crate::paths::blobs(root);
        let tmp_dir = crate::paths::tmp(root);
        let hash = "a".repeat(64);

        let t = tmp_path(&tmp_dir, &hash);

        assert_eq!(t.parent(), Some(tmp_dir.as_path()));
        assert_ne!(
            t.parent(),
            Some(blobs.as_path()),
            "a temp file must never land where enforce_cap sweeps"
        );
    }
}

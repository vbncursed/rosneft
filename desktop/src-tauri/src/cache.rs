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
/// in-flight write.
fn tmp_path(dest: &Path) -> PathBuf {
    let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    dest.with_extension(format!("part-{}-{n}", std::process::id()))
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
/// interrupted download can never be served later as a complete model.
pub fn tee_to_disk<S>(
    upstream: S,
    dest: PathBuf,
    hash: String,
) -> impl Stream<Item = Result<bytes::Bytes, std::io::Error>>
where
    S: Stream<Item = Result<bytes::Bytes, std::io::Error>>,
{
    async_stream::stream! {
        let tmp = tmp_path(&dest);
        let guard = TempFile::new(tmp.clone());
        // A cache that cannot write is a cache that is off, not a failed request.
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

    #[tokio::test]
    async fn writes_the_file_when_the_hash_matches() {
        let dir = tempdir().unwrap();
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = dir.path().join(&hash);

        let mut s = Box::pin(tee_to_disk(chunks(data), dest.clone(), hash.clone()));
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
        let hash = "b".repeat(64);
        let dest = dir.path().join(&hash);

        let mut s = Box::pin(tee_to_disk(chunks(b"hello world"), dest.clone(), hash));
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
            std::fs::read_dir(dir.path()).unwrap().count(),
            0,
            "no temp file left behind"
        );
    }

    #[tokio::test]
    async fn writes_nothing_when_the_stream_is_cut_short() {
        let dir = tempdir().unwrap();
        let data = b"hello world";
        let hash = hex::encode(sha2::Sha256::digest(data));
        let dest = dir.path().join(&hash);

        let s = tee_to_disk(chunks(data), dest.clone(), hash);
        let mut s = Box::pin(s);
        let _ = s.next().await; // take one chunk, then walk away
        drop(s);
        tokio::task::yield_now().await;

        assert!(!dest.exists());
        assert_eq!(
            std::fs::read_dir(dir.path()).unwrap().count(),
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
        let dest = std::path::Path::new("/cache/blobs/somehash");
        assert_ne!(tmp_path(dest), tmp_path(dest));
    }
}

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::SystemTime;

/// 5 GB. A territory with its LOD chain is tens to hundreds of megabytes, so
/// this holds a working set of dozens without asking the user anything.
pub const CAP_BYTES: u64 = 5 * 1024 * 1024 * 1024;

static SWEEPING: AtomicBool = AtomicBool::new(false);

/// Releases `SWEEPING` on every return path out of `enforce_cap` — early
/// return, error, or falling off the end — the same guard-on-drop shape as
/// `cache::TempFile`.
struct SweepGuard;

impl Drop for SweepGuard {
    fn drop(&mut self) {
        SWEEPING.store(false, Ordering::SeqCst);
    }
}

/// Deletes least-recently-modified entries until the directory fits the cap.
///
/// ponytail: a full read_dir scan per sweep, and concurrent sweeps collapse to
/// one via a process-wide flag rather than queuing — the sweep already in
/// flight observes the same directory state a queued one would, so skipping
/// is correct, not just cheap. Swap the scan for an on-disk index when the
/// directory holds tens of thousands of files.
pub fn enforce_cap(dir: &Path, cap_bytes: u64) -> std::io::Result<()> {
    if SWEEPING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let _guard = SweepGuard;

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };

    let mut files: Vec<(std::path::PathBuf, u64, SystemTime)> = Vec::new();
    let mut total: u64 = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        total += meta.len();
        files.push((entry.path(), meta.len(), mtime));
    }
    if total <= cap_bytes {
        return Ok(());
    }

    files.sort_by_key(|(_, _, mtime)| *mtime);
    for (path, size, _) in files {
        if total <= cap_bytes {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= size;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::{Duration, SystemTime};
    use tempfile::tempdir;

    // `enforce_cap` serializes itself through the process-wide `SWEEPING`
    // flag, and cargo runs tests in parallel by default — without this lock
    // two tests calling `enforce_cap` at once would make one of them observe
    // "a sweep is already running" and silently skip its own work.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn write(dir: &std::path::Path, name: &str, size: usize, age_secs: u64) {
        let p = dir.join(name);
        std::fs::write(&p, vec![0u8; size]).unwrap();
        let when = SystemTime::now() - Duration::from_secs(age_secs);
        filetime::set_file_mtime(&p, filetime::FileTime::from_system_time(when)).unwrap();
    }

    #[test]
    fn does_nothing_under_the_cap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let d = tempdir().unwrap();
        write(d.path(), "a", 100, 10);
        write(d.path(), "b", 100, 20);
        enforce_cap(d.path(), 1000).unwrap();
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 2);
    }

    #[test]
    fn drops_the_oldest_until_under_the_cap() {
        let _lock = TEST_LOCK.lock().unwrap();
        let d = tempdir().unwrap();
        write(d.path(), "new", 100, 1);
        write(d.path(), "mid", 100, 100);
        write(d.path(), "old", 100, 1000);
        enforce_cap(d.path(), 250).unwrap();
        assert!(d.path().join("new").exists());
        assert!(d.path().join("mid").exists());
        assert!(
            !d.path().join("old").exists(),
            "the least recently used entry goes first"
        );
    }

    #[test]
    fn a_missing_directory_is_not_an_error() {
        let _lock = TEST_LOCK.lock().unwrap();
        let d = tempdir().unwrap();
        enforce_cap(&d.path().join("nope"), 10).unwrap();
    }

    #[test]
    fn a_sweep_leaves_an_in_flight_temp_file_alone() {
        let _lock = TEST_LOCK.lock().unwrap();
        let d = tempdir().unwrap();
        let blobs = crate::paths::blobs(d.path());
        let tmp = crate::paths::tmp(d.path());
        std::fs::create_dir_all(&blobs).unwrap();
        std::fs::create_dir_all(&tmp).unwrap();

        // The in-flight download's temp file is the oldest thing in the
        // whole cache root — if `enforce_cap` ever walked into tmp/, this
        // would be first in line for eviction and the completed-but-not-yet-
        // renamed download would vanish out from under `tokio::fs::rename`.
        write(&blobs, "small", 100, 5);
        write(&tmp, "somehash.part-1-1", 100, 100_000);

        enforce_cap(&blobs, 50).unwrap();

        assert!(
            tmp.join("somehash.part-1-1").exists(),
            "enforce_cap must never reach outside the directory it was given"
        );
    }
}

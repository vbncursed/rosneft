use std::path::Path;
use std::time::SystemTime;

/// 5 GB. A territory with its LOD chain is tens to hundreds of megabytes, so
/// this holds a working set of dozens without asking the user anything.
pub const CAP_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// Deletes least-recently-modified entries until the directory fits the cap.
///
/// ponytail: a full read_dir scan on every write. Fine at thousands of files,
/// swap for an on-disk index when it is tens of thousands.
pub fn enforce_cap(dir: &Path, cap_bytes: u64) -> std::io::Result<()> {
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
    use std::time::{Duration, SystemTime};
    use tempfile::tempdir;

    fn write(dir: &std::path::Path, name: &str, size: usize, age_secs: u64) {
        let p = dir.join(name);
        std::fs::write(&p, vec![0u8; size]).unwrap();
        let when = SystemTime::now() - Duration::from_secs(age_secs);
        filetime::set_file_mtime(&p, filetime::FileTime::from_system_time(when)).unwrap();
    }

    #[test]
    fn does_nothing_under_the_cap() {
        let d = tempdir().unwrap();
        write(d.path(), "a", 100, 10);
        write(d.path(), "b", 100, 20);
        enforce_cap(d.path(), 1000).unwrap();
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 2);
    }

    #[test]
    fn drops_the_oldest_until_under_the_cap() {
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
        let d = tempdir().unwrap();
        enforce_cap(&d.path().join("nope"), 10).unwrap();
    }
}

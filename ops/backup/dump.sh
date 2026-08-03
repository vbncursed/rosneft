#!/usr/bin/env bash
# Daily backup. Runs ON THE PRODUCTION HOST (root@85.192.26.113), by a systemd
# timer the operator installs by hand — see ops/backup/RESTORE.md for exactly
# what to run, since this repo has read-only access to that host and cannot
# install the timer itself.
#
# Three artifacts, deliberately separate:
#   1. the Postgres dump.
#   2. the audit digests — the witness to the journal being unrewritten. It
#      lives on its own volume for a reason, and putting it inside the same
#      archive as the dump would give the two a shared fate, which is exactly
#      what the witness exists to prevent.
#   3. the source blobs, by hash. Converted artifacts are NOT copied: the
#      reconciler rebuilds them from the sources, verified live on 3 Aug when
#      the territory artifacts were deleted and came back on their own.
#
# Host is Ubuntu (GNU coreutils) — this script is NOT portable to macOS as
# written (stat -c%s below is GNU-only). ops/backup/pull.sh is the macOS side.
set -euo pipefail

DEST=${DEST:-/root/backups}
STAMP=$(date +%Y%m%d-%H%M%S)
KEEP=${KEEP:-7}
mkdir -p "$DEST"

dump="$DEST/andrey-$STAMP.sql.gz"

# PIPESTATUS, not `set -e`: a failed pg_dump still produces a valid 20-byte
# gzip, and the pipeline's exit status comes from gzip, which succeeded.
docker exec andrey-postgres-1 pg_dump -U andrey -d andrey | gzip > "$dump"
if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
  echo "dump.sh: pg_dump failed" >&2
  rm -f "$dump"
  exit 1
fi

# gzip -t alone is not enough: a failed pg_dump followed by a successful
# `gzip -t` still passes on an empty stream. It catches truncation, not
# emptiness — the size guard below covers what this can't.
gzip -t "$dump"

# Size sanity: a dump that suddenly halves is a dump of half a database.
prev=$(ls -1t "$DEST"/andrey-*.sql.gz 2>/dev/null | sed -n 2p || true)
if [[ -n "$prev" ]]; then
  now_sz=$(stat -c%s "$dump")
  prev_sz=$(stat -c%s "$prev")
  if (( now_sz * 2 < prev_sz )); then
    echo "dump.sh: dump is less than half the previous one ($now_sz vs $prev_sz)" >&2
    exit 1
  fi
fi

# 2. Audit digests — separate archive, separate fate.
docker run --rm -v andrey_audit-digest:/d -v "$DEST":/out alpine \
  tar czf "/out/audit-digest-$STAMP.tar.gz" -C /d .

# 3. Source blobs by hash. Artifacts are rebuilt, sources are not.
docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc \
  "select source_blob_hash from territories where source_blob_hash <> ''
   union
   select source_blob_hash from models where source_blob_hash <> ''" \
  | tr -d ' ' > "$DEST/source-hashes-$STAMP.txt"

# Real on-disk layout (backend/pkg/blobstore/fs.go:58-63), confirmed against
# the live andrey_blob-data volume:
#   <root>/<2-char-hash-prefix>/<hash>.bin    content
#   <root>/<2-char-hash-prefix>/<hash>.json   metadata sidecar (content type, size)
# The plan this script was drafted from copied `/b/$sub/$h` — no extension, a
# path that never exists — and swallowed the miss with `|| true`. That would
# have produced an empty blobs/ directory that looked like a working backup.
# Both files are required: the store cannot serve a blob back without its
# .json sidecar. A missing blob is now a loud, non-zero-exit failure.
mkdir -p "$DEST/blobs"
missing=""
while read -r h; do
  [[ -z "$h" ]] && continue
  sub=${h:0:2}
  if ! docker run --rm -v andrey_blob-data:/b -v "$DEST/blobs":/out alpine \
      sh -c "test -f /b/$sub/$h.bin && test -f /b/$sub/$h.json && cp -n /b/$sub/$h.bin /out/$h.bin && cp -n /b/$sub/$h.json /out/$h.json"; then
    echo "dump.sh: blob $h missing or failed to copy (expected /b/$sub/$h.bin and .json)" >&2
    missing="$missing $h"
  fi
done < "$DEST/source-hashes-$STAMP.txt"

if [[ -n "$missing" ]]; then
  echo "dump.sh: source blobs missing, backup is INCOMPLETE:$missing" >&2
  # Rotation is skipped below on purpose: an incomplete backup must not push
  # out a complete older one.
  exit 1
fi

# Rotation. Only reached once every artifact above succeeded.
ls -1t "$DEST"/andrey-*.sql.gz        | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$DEST"/audit-digest-*.tar.gz  | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$DEST"/source-hashes-*.txt    | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "dump.sh: ok $STAMP"

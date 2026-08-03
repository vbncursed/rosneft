#!/usr/bin/env bash
# Regression check for dump.sh's pg_dump failure guard (the bug: under
# `set -euo pipefail`, a bare PIPESTATUS check after the pipeline never runs
# — the pipeline itself already terminated the script). No production access
# needed: stubs the `docker exec andrey-postgres-1 {pg_dump,psql}` calls only.
# `docker run ... alpine ...` (the audit-digest tar and blob-copy steps)
# passes through to the real local docker. If a local `andrey` dev stack is
# running, its `andrey_audit-digest` / `andrey_blob-data` volumes already
# exist and get mounted for real — this is safe because dump.sh's `docker
# run` invocations only ever *read* from those mounts and write into `/out`
# (this script's own throwaway $DEST), never back into `/d` or `/b`. In both
# cases below the psql stub returns no hashes, so the blob-copy container
# never actually runs; only the audit-digest tar step touches a real volume,
# and only to read it. Confirmed after the fact: volume sizes and the local
# stack's container health were unchanged by this script.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_DOCKER=$(command -v docker)
WORK=$(mktemp -d)
cleanup() {
  rm -rf "$WORK"
  "$REAL_DOCKER" volume rm -f andrey_audit-digest andrey_blob-data >/dev/null 2>&1 || true
}
trap cleanup EXIT

BIN="$WORK/bin"
mkdir -p "$BIN"
cat > "$BIN/docker" <<STUB
#!/usr/bin/env bash
if [[ "\$1" == "exec" && "\$2" == "andrey-postgres-1" ]]; then
  case "\$3" in
    pg_dump) exec bash -c "\$PG_DUMP_STUB" ;;
    psql)    exit 0 ;;  # prints nothing: source-hashes file ends up empty, blob loop is a no-op
  esac
fi
exec "$REAL_DOCKER" "\$@"
STUB
chmod +x "$BIN/docker"
export PATH="$BIN:$PATH"

fail() { echo "FAIL: $1" >&2; exit 1; }

echo "=== 1. stubbed pg_dump FAILURE ==="
DEST1="$WORK/backups-fail"
mkdir -p "$DEST1"
set +e
PG_DUMP_STUB='exit 1' DEST="$DEST1" "$HERE/dump.sh" >"$WORK/fail.log" 2>&1
rc=$?
set -e
cat "$WORK/fail.log"
echo "dump.sh exit code: $rc"
[[ $rc -ne 0 ]] || fail "dump.sh exited 0 despite pg_dump failing"
if compgen -G "$DEST1"/andrey-*.sql.gz >/dev/null; then
  fail "a .gz was left behind after a failed pg_dump"
fi
echo "PASS: failure caught, no .gz left behind"
echo

echo "=== 2. stubbed pg_dump SUCCESS ==="
DEST2="$WORK/backups-ok"
mkdir -p "$DEST2"
set +e
PG_DUMP_STUB='printf "SELECT 1;\n"' DEST="$DEST2" "$HERE/dump.sh" >"$WORK/ok.log" 2>&1
rc=$?
set -e
cat "$WORK/ok.log"
echo "dump.sh exit code: $rc"
[[ $rc -eq 0 ]] || fail "dump.sh exited $rc on the success path"
if ! compgen -G "$DEST2"/andrey-*.sql.gz >/dev/null; then
  fail "no .gz produced on the success path"
fi
gzip -t "$DEST2"/andrey-*.sql.gz || fail "produced .gz does not pass gzip -t"
echo "PASS: normal path still produces a valid, verifiable dump"

#!/usr/bin/env bash
# Regression check for dump.sh's pg_dump failure guard (the bug: under
# `set -euo pipefail`, a bare PIPESTATUS check after the pipeline never runs
# — the pipeline itself already terminated the script).
#
# Hermetic by construction: this script never names, creates, mounts, or
# removes a real Docker volume. dump.sh hardcodes the production volume
# names `andrey_audit-digest` / `andrey_blob-data` — names a developer's own
# local `andrey` dev stack also uses, for real local data. The docker stub
# below intercepts every `docker run` dump.sh makes and rewrites any `-v`
# mount naming either of those two volumes into a bind mount of a throwaway
# directory under $WORK instead, before handing the command to the real
# local docker. The audit-digest tar step and the blob-copy step therefore
# both run their real code, against fixtures this script alone owns — the
# result cannot depend on whether a dev stack happens to be running, or be
# running with volumes that happen to share a name with production's.
# `docker exec andrey-postgres-1 {pg_dump,psql}` is intercepted directly,
# since no such container exists off production.
#
# Nothing here ever holds a reference to a real volume, so cleanup is just
# `rm -rf "$WORK"` — there is nothing else for this script to own or to
# forget to release.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_DOCKER=$(command -v docker)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FIXTURES="$WORK/fixtures"
mkdir -p "$FIXTURES/audit-digest" "$FIXTURES/blob-data"

BIN="$WORK/bin"
mkdir -p "$BIN"
cat > "$BIN/docker" <<STUB
#!/usr/bin/env bash
set -euo pipefail

if [[ "\$1" == "exec" && "\$2" == "andrey-postgres-1" ]]; then
  case "\$3" in
    pg_dump) exec bash -c "\$PG_DUMP_STUB" ;;
    psql)    exit 0 ;;  # prints nothing: source-hashes file ends up empty, blob loop is a no-op
  esac
fi

if [[ "\$1" == "run" ]]; then
  args=()
  for a in "\$@"; do
    case "\$a" in
      andrey_audit-digest:*) a="$FIXTURES/audit-digest:\${a#*:}" ;;
      andrey_blob-data:*)    a="$FIXTURES/blob-data:\${a#*:}" ;;
    esac
    args+=("\$a")
  done
  exec "$REAL_DOCKER" "\${args[@]}"
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
if ! compgen -G "$DEST2"/audit-digest-*.tar.gz >/dev/null; then
  fail "no audit-digest tarball produced on the success path"
fi
echo "PASS: normal path still produces a valid, verifiable dump and digest archive"

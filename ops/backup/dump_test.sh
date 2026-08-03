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
# local docker. `docker exec andrey-postgres-1 {pg_dump,psql}` is intercepted
# directly, since no such container exists off production.
#
# The audit-digest tar step runs its real code in every section below (the
# psql stub prints nothing by default, same as it always did). The blob-copy
# step only runs its real code in section 3, which points the psql stub at
# PSQL_STUB_OUTPUT and pre-seeds a blob fixture — sections 1 and 2 still see
# an empty source-hashes file and the blob loop is a no-op for them, exactly
# as before.
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
    # Default (PSQL_STUB_OUTPUT unset) prints nothing: source-hashes file ends
    # up empty, blob loop is a no-op — sections 1 and 2 rely on that. Section
    # 3 sets PSQL_STUB_OUTPUT to exercise the blob loop for real.
    psql)    [[ -n "\${PSQL_STUB_OUTPUT:-}" ]] && printf '%s\n' "\$PSQL_STUB_OUTPUT"; exit 0 ;;
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
echo

echo "=== 3. blob loop: valid hash copied, injection-shaped hash rejected ==="
VALID_HASH=$(head -c 64 </dev/zero | tr '\0' 'a')  # 64 hex chars, a real-looking blob
VALID_SUB=${VALID_HASH:0:2}
INJECT_HASH='aa";touch /out/pwned;#'

mkdir -p "$FIXTURES/blob-data/$VALID_SUB"
printf 'content' > "$FIXTURES/blob-data/$VALID_SUB/$VALID_HASH.bin"
printf '{"contentType":"application/octet-stream"}' > "$FIXTURES/blob-data/$VALID_SUB/$VALID_HASH.json"

DEST3="$WORK/backups-blobs"
mkdir -p "$DEST3"
set +e
PG_DUMP_STUB='printf "SELECT 1;\n"' \
  PSQL_STUB_OUTPUT="$VALID_HASH
$INJECT_HASH" \
  DEST="$DEST3" "$HERE/dump.sh" >"$WORK/blobs.log" 2>&1
rc=$?
set -e
cat "$WORK/blobs.log"
echo "dump.sh exit code: $rc"

# The malformed hash makes the backup incomplete on purpose (see dump.sh) —
# a non-zero exit here is the correct outcome, not a test failure.
[[ $rc -ne 0 ]] || fail "dump.sh exited 0 despite a malformed source_blob_hash"

if [[ ! -f "$DEST3/blobs/$VALID_HASH.bin" ]] || [[ ! -f "$DEST3/blobs/$VALID_HASH.json" ]]; then
  fail "the valid hash's blob was not copied"
fi
[[ "$(cat "$DEST3/blobs/$VALID_HASH.bin")" == "content" ]] || fail "copied .bin content does not match the fixture"

grep -q "not 64 hex characters" "$WORK/blobs.log" || fail "malformed hash was not logged as rejected"

if find "$WORK" -name pwned | grep -q .; then
  fail "the injection-shaped hash executed: found a 'pwned' file"
fi
echo "PASS: valid blob copied, injection-shaped hash rejected without executing, no pwned file"

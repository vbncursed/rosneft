#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016,SC2012 # sourced path; literal hostile strings; names are ours
# Hermetic test for deploy.sh: no docker, no network, no flock, no server.
# Part 1 sources the script (DEPLOY_LIB_ONLY=1) and checks its pure decisions;
# part 2 runs the real script against stub docker/git/curl/flock on PATH, with
# every path pointed into a throwaway directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $1" >&2; exit 1; }
ok()   { local d=$1; shift; "$@" || fail "$d"; echo "PASS: $d"; }
no()   { local d=$1; shift; if "$@"; then fail "$d"; fi; echo "PASS: $d"; }

export DEPLOY_LIB_ONLY=1
# shellcheck source=deploy.sh
source "$HERE/deploy.sh"
unset DEPLOY_LIB_ONLY

SHA1=$(printf '%040d' 1)
SHA2=$(printf '%040d' 2)
SHA3=$(printf '%040d' 3)

echo "=== 1. valid_sha ==="
ok "accepts 40 hex" valid_sha "$SHA1"
ok "accepts mixed a-f" valid_sha "0123456789abcdef0123456789abcdef01234567"
for bad in "" abc main "${SHA1}0" "${SHA1:1}" "$(printf 'A%.0s' {1..40})" '$(id)' ';rm -rf /' "$SHA1;id" "$(printf '%s\n' "$SHA1")x" "$SHA1 "; do
  no "rejects '$bad'" valid_sha "$bad"
done
no "rejects trailing newline" valid_sha "$SHA1"$'\n'

echo "=== 1b. valid_actor ==="
ok "accepts vbncursed" valid_actor vbncursed
ok "accepts a-b" valid_actor a-b
ok "accepts 39 chars" valid_actor "$(printf 'a%.0s' {1..39})"
for bad in "" "$(printf 'a%.0s' {1..40})" "a b" "x;id" '$(id)' "a"$'\n'; do
  no "rejects actor '$bad'" valid_actor "$bad"
done

echo "=== 2. all_healthy ==="
row() { printf '{"Service":"%s","State":"%s","Health":"%s"}\n' "$1" "$2" "$3"; }
good=$(row gateway running healthy; row mesh-worker running ""; row auth running healthy)
ok "all healthy + running" all_healthy "$good"
no "one starting" all_healthy "$(row a running healthy; row b running starting)"
no "one unhealthy" all_healthy "$(row a running healthy; row b running unhealthy)"
no "one exited" all_healthy "$(row a running healthy; row b exited "")"
no "no-healthcheck service restarting" all_healthy "$(row a running healthy; row b restarting "")"
no "empty input" all_healthy ""
no "exited with a stale health value" all_healthy "$(row a exited healthy)"
no "created, never started" all_healthy "$(row a created "")"
# a real `docker compose ps -a --format json` line (Compose 2.40 field set)
full() { printf '{"Command":"\\"/app\\"","CreatedAt":"2026-10-02 10:00:00 +0000 UTC","ExitCode":%s,"Health":"%s","ID":"abc123","Image":"ghcr.io/vbncursed/andrey-%s:abc","Labels":"com.docker.compose.project=andrey,x=y","LocalVolumes":"0","Mounts":"","Name":"andrey-%s-1","Names":"andrey-%s-1","Networks":"andrey_default","Ports":"","Project":"andrey","Publishers":null,"RunningFor":"1 hour ago","Service":"%s","Size":"0B","State":"%s","Status":"Up 1 hour (%s)"}\n' "$5" "$3" "$1" "$1" "$1" "$1" "$2" "$4"; }
ok "real json: running healthy + running without healthcheck" all_healthy "$(full gateway running healthy healthy 0; full worker running "" "no check" 0)"
no "real json: exited" all_healthy "$(full gateway running healthy healthy 0; full job exited "" "Exited (1)" 1)"
no "real json: restarting" all_healthy "$(full gateway restarting "" "Restarting" 1)"
no "real json: health starting" all_healthy "$(full gateway running starting "health: starting" 0)"
no "real json: unhealthy" all_healthy "$(full gateway running unhealthy unhealthy 0)"

echo "=== 3. images_to_prune ==="
imgs=$(printf '%s\n' \
  "ghcr.io/vbncursed/andrey-gateway:$SHA1" "ghcr.io/vbncursed/andrey-gateway:$SHA2" \
  "ghcr.io/vbncursed/andrey-frontend:$SHA3" "ghcr.io/vbncursed/andrey-auth:<none>" \
  "postgres:16" "ghcr.io/other/andrey-x:$SHA3" "alpine:latest")
got=$(images_to_prune "$SHA1" "$SHA3" <<<"$imgs")
[[ $got == "ghcr.io/vbncursed/andrey-gateway:$SHA2" ]] || fail "images_to_prune printed: $got"
echo "PASS: prunes only unlisted andrey-* images"
[[ -z $(images_to_prune <<<"postgres:16") ]] || fail "pruned a foreign image"
echo "PASS: ignores non-andrey images"

echo "=== 4. last_files ==="
[[ $(last_files) == "index.html sw.js shell-manifest.json offline.html" ]] || fail "last_files: $(last_files)"
echo "PASS: last_files order"

# ---- part 2: the real script against stubs ----

BIN="$WORK/bin"
mkdir -p "$BIN"
CALLS="$WORK/calls"
TOKEN="tok-s3cret-$$"

# Every stub appends its argv to $CALLS; behaviour is steered by STUB_* env.
cat > "$BIN/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$1" in
  compose)
    case "$*" in
      *" pull"*) sleep "${STUB_SLOW:-0}"; [[ -z ${STUB_PULL_FAIL:-} ]] || exit 1 ;;
      *" up "*) [[ " $* " != *" --remove-orphans "* ]] || touch "$WORK/orphan_gone"; [[ ${ANDREY_TAG:-} != "${STUB_UP_FAIL_TAG:-x}" ]] || exit 1 ;;
      *" ps "*) for s in gateway auth; do printf '{"Service":"%s","State":"running","Health":"healthy"}\n' "$s"; done
        if [[ -n ${STUB_ORPHAN:-} && ! -f $WORK/orphan_gone ]]; then printf '{"Service":"newsvc","State":"exited","Health":""}\n'; fi ;;
    esac ;;
  exec) [[ -z ${STUB_PGDUMP_FAIL:-} ]] || exit 1; echo "SELECT 1;" ;;
  login) cat > "$WORK/login_stdin"; [[ -z ${STUB_LOGIN_FAIL:-} ]] || exit 1 ;;
  create) img=${*: -1}; [[ ${img##*:} != "${STUB_CREATE_FAIL_TAG:-x}" ]] || exit 1; echo "cid-${img##*:}" ;;
  cp)
    id=${2#cid-}; id=${id%%:*}
    mkdir -p "$3/assets"
    for f in index.html sw.js offline.html assets/app.js; do echo "$id" > "$3/$f"; done
    printf '{"id":"%s"}\n' "$id" > "$3/shell-manifest.json" ;;
  images) printf '%s\n' "ghcr.io/vbncursed/andrey-gateway:$STUB_OLD" "ghcr.io/vbncursed/andrey-gateway:$STUB_NEW" ;;
esac
exit 0
STUB
cat > "$BIN/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >> "$CALLS"
[[ $3 != fetch || -z ${STUB_FETCH_FAIL:-} ]] || exit 1
[[ $3 != diff ]] || printf '%s\n' ${STUB_MIGRATIONS:-}
exit 0
STUB
cat > "$BIN/curl" <<'STUB'
#!/usr/bin/env bash
echo "curl $*" >> "$CALLS"
url=${*: -1}
live=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$ANDREY_WWW/shell-manifest.json" 2>/dev/null || true)
case "$url" in
  *api.telegram.org*) [[ -z ${STUB_TG_FAIL:-} ]] || exit 22 ;;
  */api/auth/me) printf 401 ;;
  */shell-manifest.json)
    if [[ -n $STUB_BROKEN_RE && $live =~ $STUB_BROKEN_RE ]]; then echo '{"id":"stale"}'; else echo "{\"id\":\"$live\"}"; fi ;;
  *) printf 200 ;;
esac
exit 0
STUB
cat > "$BIN/flock" <<'STUB'
#!/usr/bin/env bash
echo "flock $*" >> "$CALLS"
[[ -z ${STUB_LOCK_HELD:-} ]]
STUB
cat > "$BIN/cp" <<'STUB'
#!/usr/bin/env bash
[[ ${ANDREY_TAG:-} != "${STUB_CP_FAIL_TAG:-x}" ]] || exit 1
exec /bin/cp "$@"
STUB
# bsdtar (macOS) rejects the GNU-only flag the server's tar needs; record it, drop it.
cat > "$BIN/tar" <<'STUB'
#!/usr/bin/env bash
echo "tar $*" >> "$CALLS"
args=(); for a in "$@"; do [[ $a == --no-overwrite-dir ]] || args+=("$a"); done
exec /usr/bin/tar "${args[@]}"
STUB
chmod +x "$BIN"/*
export PATH="$BIN:$PATH" CALLS WORK

# Fresh directories and stub knobs for one scenario.
fresh() {
  rm -rf "$WORK/s"; mkdir -p "$WORK/s"/{root,www,state,logs,backups,secrets,tmp}
  echo "bot-token" > "$WORK/s/secrets/telegram_bot_token"; echo "42" > "$WORK/s/secrets/telegram_chat_id"
  : > "$CALLS"; rm -f "$WORK/login_stdin" "$WORK/orphan_gone"
  export ANDREY_ROOT="$WORK/s/root" ANDREY_WWW="$WORK/s/www" ANDREY_STATE="$WORK/s/state" \
    ANDREY_LOGS="$WORK/s/logs" ANDREY_BACKUPS="$WORK/s/backups" ANDREY_SECRETS="$WORK/s/secrets" \
    ANDREY_ORIGIN="https://x.test" ANDREY_LOCK="$WORK/s/lock" ANDREY_CHECK_TIMEOUT=0 ANDREY_CHECK_INTERVAL=0 \
    TMPDIR="$WORK/s/tmp" STUB_OLD="$SHA1" STUB_NEW="$SHA2" STUB_BROKEN_RE=""
  unset STUB_ORPHAN STUB_SLOW STUB_PULL_FAIL STUB_UP_FAIL_TAG STUB_LOGIN_FAIL STUB_CREATE_FAIL_TAG STUB_FETCH_FAIL STUB_CP_FAIL_TAG ANDREY_LOCK_WAIT DRY_RUN STUB_LOCK_HELD STUB_PGDUMP_FAIL STUB_MIGRATIONS STUB_TG_FAIL SSH_ORIGINAL_COMMAND || true
}

# deploy.sh with $TOKEN on stdin; sets $out, $rc, $log. The command substitution
# only returns once the script's tee has drained, so the log file is complete.
go() {
  set +e
  out=$(printf '%s\n' "$TOKEN" | "$HERE/deploy.sh" "$@" 2>&1)
  rc=$?
  set -e
  log=$(cat "$WORK"/s/logs/*.log 2>/dev/null || true)
}

# in_order <text> <pattern>...: each pattern's first match comes after the previous one.
in_order() {
  local text=$1 last=0 n; shift
  for p in "$@"; do
    n=$(grep -n -m1 -e "$p" <<<"$text" | cut -d: -f1 || true)
    [[ -n $n && $n -gt $last ]] || { echo "pattern '$p' missing or out of order" >&2; return 1; }
    last=$n
  done
}
calls_have() { grep -q -e "$1" "$CALLS"; }
deployed() { cat "$ANDREY_ROOT/.deployed"; }
live_id() { sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$ANDREY_WWW/shell-manifest.json"; }

echo "=== 5. happy path (sha and actor from SSH_ORIGINAL_COMMAND) ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
for i in 01 02 03 04 05 06 07 08 09 10 11 12; do touch -t "202001010000.$i" "$ANDREY_BACKUPS/andrey-predeploy-2020$i-aaaaaaa.sql.gz"; done
export STUB_OLD="$SHA3" STUB_MIGRATIONS="backend/services/audit-service/internal/migrate/migrations/00003_x.sql"
export SSH_ORIGINAL_COMMAND="$SHA2 vbncursed"
go
[[ $rc -eq 0 ]] || { echo "$out"; fail "happy path exit $rc"; }
ok "step order" in_order "$log" '^+ backup' "git -C .* fetch origin" "checkout --detach $SHA2" ' pull$' ' up -d --no-build$' \
  'force-recreate --no-build --no-deps audit' '^+ publish_rest' '^+ publish_last' '^+ write_deployed' '^+ prune_images'
ok ".deployed written" [ "$(deployed)" = "$SHA2" ]
ok "frontend published" [ "$(live_id)" = "$SHA2" ]
ok "old assets kept" [ -f "$ANDREY_WWW/assets/app.js" ]
ok "backup is a valid gzip named with sha7" gzip -t "$ANDREY_BACKUPS/andrey-predeploy-"*"-${SHA2:0:7}.sql.gz"
ok "only 10 predeploy backups kept" [ "$(ls "$ANDREY_BACKUPS" | wc -l)" -eq 10 ]
ok "ps -a, so exited containers count" calls_have ' ps -a --format json'
ok "frontend extracted without following image modes" calls_have 'tar -C .* -x --no-overwrite-dir --no-same-owner'
no "temp frontend dir removed" compgen -G "$WORK/s/tmp/andrey-front.*"
ok "flock waits 600 s by default" calls_have "^flock -w 600 9"
ok "success notice names the migration" calls_have "00003_x.sql"
ok "image older than the last deploys pruned" calls_have "rmi ghcr.io/vbncursed/andrey-gateway:$SHA3"
no "current image kept" calls_have "rmi .*$SHA2"

echo "=== 6. a failed check rolls back to the previous sha ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_BROKEN_RE="$SHA2"
go "$SHA2" vbncursed
[[ $rc -eq 1 ]] || { echo "$out"; fail "rollback exit $rc"; }
ok "rolled back: checkout new then old" in_order "$log" "checkout --detach $SHA2" "checkout --detach $SHA1"
ok "one backup only" [ "$(grep -c '^+ backup' <<<"$log")" -eq 1 ]
ok ".deployed unchanged" [ "$(deployed)" = "$SHA1" ]
ok "previous frontend is live again" [ "$(live_id)" = "$SHA1" ]
ok "notice names rollback and the failing check" calls_have "text=deploy ${SHA2:0:7} rolled back to ${SHA1:0:7}: shell-manifest"
ok "rollback never pulls: --pull never on up and docker create" in_order "$(sed -n "/checkout --detach $SHA1/,\$p" "$CALLS")" "up -d --no-build --pull never --remove-orphans" "force-recreate --no-build --pull never" "docker create --pull=never"
no "forward calls carry neither flag" grep -q -e '--pull never' -e '--pull=never' -e '--remove-orphans' <(sed -n "/checkout --detach $SHA2/,/checkout --detach $SHA1/p" "$CALLS" | grep -v '^git')
no "nothing pruned after a failure" grep -q '^+ prune_images' <<<"$log"

echo "=== 6b. rollback is offline: it never fetches, logs in or pulls ==="
for knob in PULL LOGIN FETCH UP EXTRACT CP; do
  fresh
  echo "$SHA1" > "$ANDREY_ROOT/.deployed"
  case $knob in
    PULL) export STUB_PULL_FAIL=1 ;;
    LOGIN) export STUB_LOGIN_FAIL=1 ;;
    FETCH) export STUB_FETCH_FAIL=1 ;;
    UP) export STUB_UP_FAIL_TAG="$SHA2" ;;
    EXTRACT) export STUB_CREATE_FAIL_TAG="$SHA2" ;;
    CP) export STUB_CP_FAIL_TAG="$SHA2" ;;
  esac
  go "$SHA2" vbncursed
  [[ $rc -eq 1 ]] || { echo "$out"; fail "$knob: exit $rc, want 1"; }
  ok "$knob: rolled back to the previous sha" [ "$(deployed)" = "$SHA1" ]
  ok "$knob: previous frontend live" [ "$(live_id)" = "$SHA1" ]
  ok "$knob: rollback up without build" in_order "$(sed -n "/checkout --detach $SHA1/,\$p" "$CALLS")" "checkout" ' up -d --no-build --pull never --remove-orphans$'
  no "$knob: no fetch/login/pull after the rollback began" grep -q -e '^git .* fetch' -e '^docker login' -e '^docker compose .* pull$' <(sed -n "/checkout --detach $SHA1/,\$p" "$CALLS")
  ok "$knob: notice names rollback" calls_have "rolled back to ${SHA1:0:7}"
done

echo "=== 6d. an orphan the failed deploy left behind does not fail the rollback ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_ORPHAN=1 STUB_BROKEN_RE="$SHA2"
go "$SHA2" vbncursed
ok "exit 1, not 3" [ "$rc" -eq 1 ]
ok "rolled back" [ "$(deployed)" = "$SHA1" ]

echo "=== 6e. a log that cannot be written does not hide the notice ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_BROKEN_RE="$SHA2" ANDREY_LOGS=/dev/null/logs
go "$SHA2" vbncursed
ok "exit 1" [ "$rc" -eq 1 ]
ok "notice still sent" calls_have "rolled back to ${SHA1:0:7}"
ok "rolled back" [ "$(deployed)" = "$SHA1" ]

echo "=== 6c. client gone mid-deploy: the deploy still finishes and logs ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_BROKEN_RE="$SHA2" STUB_SLOW=1
set +e
printf '%s\n' "$TOKEN" | "$HERE/deploy.sh" "$SHA2" vbncursed 2>&1 | head -n1 >/dev/null
rc=${PIPESTATUS[1]}
set -e
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  grep -q 'rolled back to' "$WORK"/s/logs/*.log 2>/dev/null && break
  sleep 0.5
done
ok "exit 1 despite the closed pipe" [ "$rc" -eq 1 ]
ok "rolled back" [ "$(deployed)" = "$SHA1" ]
ok "log finished after the client left" grep -q 'rolled back to' "$WORK"/s/logs/*.log
ok "notice sent" calls_have "rolled back to ${SHA1:0:7}"

echo "=== 7. failed check with no previous deploy: no rollback ==="
fresh
export STUB_BROKEN_RE="$SHA2"
go "$SHA2" vbncursed
[[ $rc -eq 1 ]] || fail "exit $rc"
ok "single checkout" [ "$(grep -c 'checkout --detach' <<<"$log")" -eq 1 ]
ok "notice says no previous deploy" calls_have "no previous deploy"
no ".deployed not created" [ -e "$ANDREY_ROOT/.deployed" ]

echo "=== 8. rollback fails too ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_BROKEN_RE="."
go "$SHA2" vbncursed
[[ $rc -eq 3 ]] || fail "exit $rc"
ok "alarm notice" calls_have "PROD DID NOT COME UP AFTER ROLLBACK"
ok ".deployed unchanged" [ "$(deployed)" = "$SHA1" ]

echo "=== 9. a hostile or malformed command is refused before any action ==="
for cmd in "; rm -rf /" "main vbncursed" "abc vbncursed" "$SHA1" "$SHA1 x;id" "$SHA1 \$(id)" "$SHA1 vbncursed extra" "$SHA1 vbncursed"$'\n'"; id" "$SHA1 $(printf 'a%.0s' {1..40})" ""; do
  fresh
  export SSH_ORIGINAL_COMMAND="$cmd"
  go
  [[ $rc -eq 2 ]] || { echo "$out"; fail "'$cmd' exit $rc, want 2"; }
  [[ ! -s $CALLS ]] || { cat "$CALLS"; fail "'$cmd' called something"; }
  [[ -z $(ls "$ANDREY_LOGS") ]] || fail "'$cmd' wrote a log"
  echo "PASS: refused '$cmd'"
done
fresh
go "$SHA1"
ok "args: missing actor refused" [ "$rc" -eq 2 ]

echo "=== 10. a held lock fails cleanly after the timeout ==="
fresh
export STUB_LOCK_HELD=1 ANDREY_LOCK_WAIT=1
go "$SHA2" vbncursed
[[ $rc -eq 4 ]] || fail "exit $rc"
ok "waited with -w 1" calls_have "^flock -w 1 9"
no "nothing else ran" grep -q -e '^docker' -e '^git' "$CALLS"

echo "=== 11. a failed backup stops before anything changes ==="
fresh
echo "$SHA1" > "$ANDREY_ROOT/.deployed"
export STUB_PGDUMP_FAIL=1
go "$SHA2" vbncursed
[[ $rc -eq 1 ]] || fail "exit $rc"
no "no git call" calls_have '^git'
no "no leftover dump" compgen -G "$ANDREY_BACKUPS/*.gz"
ok "notice says backup failed" calls_have "backup failed"

echo "=== 12. DRY_RUN changes nothing ==="
fresh
DRY_RUN=1 go "$SHA2" vbncursed
[[ $rc -eq 0 ]] || { echo "$out"; fail "exit $rc"; }
no "no docker/git/curl call" grep -q -e '^docker' -e '^git' -e '^curl' "$CALLS"
no "no .deployed" [ -e "$ANDREY_ROOT/.deployed" ]
ok "steps are printed" grep -q '^+ backup' <<<"$out"
ok "login is announced without the token" grep -q 'login ghcr.io as vbncursed' <<<"$out"

echo "=== 13. a Telegram failure does not change the result ==="
fresh
export STUB_TG_FAIL=1
go "$SHA2" vbncursed
ok "still exit 0" [ "$rc" -eq 0 ]

echo "=== 14. registry login: before pull, logout always, token never leaks ==="
for scenario in success rollback failed; do
  fresh
  case $scenario in
    rollback) echo "$SHA1" > "$ANDREY_ROOT/.deployed"; export STUB_BROKEN_RE="$SHA2" ;;
    failed)   export STUB_BROKEN_RE="$SHA2" ;;
  esac
  go "$SHA2" vbncursed
  ok "$scenario: login as the actor before pull" in_order "$(cat "$CALLS")" "^docker login ghcr.io -u vbncursed --password-stdin" ' pull$'
  ok "$scenario: token went through stdin" [ "$(cat "$WORK/login_stdin")" = "$TOKEN" ]
  ok "$scenario: logout ran" calls_have "^docker logout ghcr.io"
  [[ "$(tail -n1 "$CALLS")" == "docker logout ghcr.io" || $scenario != success ]] || fail "logout is not last on success"
  no "$scenario: token not in any argv" grep -q -- "$TOKEN" "$CALLS"
  no "$scenario: token not in the log or output" grep -q -- "$TOKEN" <<<"$log$out"
done
fresh
export TOKEN_BACKUP=$TOKEN TOKEN=""
go "$SHA2" vbncursed
TOKEN=$TOKEN_BACKUP
ok "empty token: deploy still ok" [ "$rc" -eq 0 ]
no "empty token: no login" calls_have '^docker login'
no "empty token: no logout of foreign credentials" calls_have '^docker logout'
ok "empty token is logged" grep -q 'no registry token' <<<"$out"

echo "ALL PASS"

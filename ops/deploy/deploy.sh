#!/usr/bin/env bash
# shellcheck disable=SC2329,SC2012 # steps run through run()/step(); names are ours
# Server-side deploy. Runs ON THE PRODUCTION HOST as the forced command of the
# CD ssh key (see docs/superpowers/specs/2026-10-02-cd-design.md §2-3), with
# "<sha> <actor>" in $1 $2 or $SSH_ORIGINAL_COMMAND and the GHCR token on the
# first line of stdin (images are private; empty token = use existing docker
# credentials, for a manual run on the server). Exit: 0 ok, 1 failed (rolled back,
# or nothing to roll back to), 2 bad SHA, 3 rollback failed too, 4 lock timeout.
# DRY_RUN=1 logs every step and changes nothing. Every path is overridable
# (ANDREY_*) so deploy_test.sh can run the real script against stubs.
set -euo pipefail

# ---- pure decisions (sourced by the test with DEPLOY_LIB_ONLY=1) ----

valid_sha() { [[ $1 =~ ^[0-9a-f]{40}$ ]]; }

# $1 = `docker compose ps -a --format json`, one object per line. No jq on the
# server, so the three fields are cut out with sed.
all_healthy() {
  local line state health n=0
  while IFS= read -r line; do
    [[ -n $line ]] || continue
    state=$(sed -n 's/.*"State" *: *"\([^"]*\)".*/\1/p' <<<"$line")
    health=$(sed -n 's/.*"Health" *: *"\([^"]*\)".*/\1/p' <<<"$line")
    n=$((n + 1))
    [[ $state == running ]] || return 1
    [[ -z $health || $health == healthy ]] || return 1
  done <<<"$1"
  ((n > 0))
}

# stdin: `repo:tag` lines. Args: tags to keep.
images_to_prune() {
  local keep=" $* " img
  while IFS= read -r img; do
    [[ $img == ghcr.io/vbncursed/andrey-*:* && $img != *:'<none>' ]] || continue
    [[ $keep == *" ${img##*:} "* ]] || echo "$img"
  done
}

# GitHub username rules: the registry login runs as this user.
valid_actor() { [[ $1 =~ ^[A-Za-z0-9-]{1,39}$ ]]; }

last_files() { echo "index.html sw.js shell-manifest.json offline.html"; }


manifest_id() { sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -n1; }

[[ -z ${DEPLOY_LIB_ONLY:-} ]] || return 0

# ---- the steps ----

ROOT=${ANDREY_ROOT:-/opt/rosneft}
WWW=${ANDREY_WWW:-/var/www/andrey}
STATE=${ANDREY_STATE:-/var/lib/andrey-deploy}
LOGS=${ANDREY_LOGS:-/var/log/andrey-deploy}
BACKUPS=${ANDREY_BACKUPS:-/root/backups}
SECRETS=${ANDREY_SECRETS:-/root/secrets}
ORIGIN=${ANDREY_ORIGIN:-https://andrey.vbncursed.fun}
LOCK=${ANDREY_LOCK:-/run/andrey-deploy.lock}
LOCK_WAIT=${ANDREY_LOCK_WAIT:-1800}
CHECK_TIMEOUT=${ANDREY_CHECK_TIMEOUT:-120}
CHECK_INTERVAL=${ANDREY_CHECK_INTERVAL:-5}
FRONT_IMAGE=ghcr.io/vbncursed/andrey-frontend
DC=(docker compose -p andrey --project-directory "$ROOT")
FAIL_REASON=""
MANIFEST_ID=""
LOGGED_IN=""
TOKEN=""
ACTOR=""

logwriter() { # <logfile>: stdin -> logfile, then stdout (errors ignored)
  local l
  while IFS= read -r l || [[ -n $l ]]; do
    printf '%s\n' "$l" >>"$1" 2>/dev/null || true
    printf '%s\n' "$l" 2>/dev/null || true
  done
}

log() { printf '%s\n' "$*" || true; }
run() { log "+ $*"; [[ -n ${DRY_RUN:-} ]] || "$@"; }
step() { local reason=$1; shift; run "$@" || { FAIL_REASON=$reason; return 1; }; }

wait_for() {
  [[ -z ${DRY_RUN:-} ]] || return 0
  local end=$((SECONDS + CHECK_TIMEOUT))
  until "$@"; do
    ((SECONDS < end)) || return 1
    sleep "$CHECK_INTERVAL"
  done
}

notify() {
  log "notify: $1"
  [[ -z ${DRY_RUN:-} && -r $SECRETS/telegram_bot_token && -r $SECRETS/telegram_chat_id ]] || return 0
  curl -fsS --max-time 10 \
    --data-urlencode "chat_id=$(<"$SECRETS/telegram_chat_id")" --data-urlencode "text=$1" \
    "https://api.telegram.org/bot$(<"$SECRETS/telegram_bot_token")/sendMessage" >/dev/null 2>&1 || true
}

backup() {
  local f="$BACKUPS/andrey-predeploy-$STAMP-${SHA:0:7}.sql.gz"
  mkdir -p "$BACKUPS"
  if ! { docker exec andrey-postgres-1 pg_dump -U andrey -d andrey | gzip >"$f" && gzip -t "$f"; }; then
    rm -f "$f"
    return 1
  fi
  ls -1t "$BACKUPS"/andrey-predeploy-*.sql.gz | tail -n +11 | xargs -r rm -f
}

extract_front() { # <sha> <dest dir> [deploy|rollback]
  local cid policy=missing # docker's default; rollback must never reach the registry
  [[ ${3:-deploy} == deploy ]] || policy=never
  cid=$(docker create --pull="$policy" "$FRONT_IMAGE:$1") || return 1
  docker cp "$cid:/dist/." "$2" || { docker rm "$cid" >/dev/null; return 1; }
  docker rm "$cid" >/dev/null
}

# Old hashed assets are never deleted: open tabs and the desktop shell still load them.
# The docroot's own modes and owner stay as they are, whatever the image carried.
publish_rest() { # <dist>
  local f ex=()
  for f in $(last_files); do ex+=(--exclude="./$f"); done
  mkdir -p "$WWW"
  tar -C "$1" -c "${ex[@]}" . | tar -C "$WWW" -x --no-overwrite-dir --no-same-owner
}

# cp to a temp name, then rename: a reader never sees a truncated index.html.
publish_last() { # <dist>
  local f
  for f in $(last_files); do
    [[ -f $1/$f ]] || continue
    cp "$1/$f" "$WWW/.$f.tmp" && mv -f "$WWW/.$f.tmp" "$WWW/$f" || return 1
  done
}

# Sets MANIFEST_ID; always removes its temp dir.
publish_front() { # <sha> [deploy|rollback]
  local dist rc=0
  dist=$(mktemp -d "${TMPDIR:-/tmp}/andrey-front.XXXXXX")
  step "frontend image extract failed" extract_front "$1" "$dist" "${2:-deploy}" &&
    step "frontend publish failed" publish_rest "$dist" &&
    step "frontend publish failed" publish_last "$dist" || rc=1
  MANIFEST_ID=$(manifest_id <"$dist/shell-manifest.json" 2>/dev/null || true)
  rm -rf "$dist"
  return $rc
}

# The token never reaches argv, a log line or a run() echo.
registry_login() {
  [[ -z $LOGGED_IN ]] || return 0
  if [[ -z $TOKEN ]]; then
    log "no registry token on stdin, using existing docker credentials"
    return 0
  fi
  log "login ghcr.io as $ACTOR"
  [[ -z ${DRY_RUN:-} ]] || return 0
  printf '%s\n' "$TOKEN" | docker login ghcr.io -u "$ACTOR" --password-stdin >/dev/null || return 1
  LOGGED_IN=1
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
}

compose_healthy() { all_healthy "$("${DC[@]}" ps -a --format json)"; }

# Steps 3-5: put <sha>'s compose file, images and frontend in place. In rollback
# mode (<sha> was running before, its commit and images are local) nothing touches
# the network: no fetch, no login, no pull, and `--pull never` on `up` and on
# `docker create` (compose and docker would otherwise pull a missing image), so a
# registry or GitHub outage cannot stop a rollback and a missing image fails loudly.
apply() { # <sha> [rollback]
  local sha=$1 mode=${2:-deploy}
  export ANDREY_TAG=$sha
  if [[ $mode == deploy ]]; then
    step "git fetch failed" git -C "$ROOT" fetch origin || return 1
  fi
  step "git checkout failed" git -C "$ROOT" checkout --detach "$sha" || return 1
  if [[ $mode == deploy ]]; then
    registry_login || { FAIL_REASON="registry login failed"; return 1; }
    step "compose pull failed" "${DC[@]}" pull || return 1
  fi
  # Rollback: --pull never so a missing image fails here instead of reaching for the
  # registry; --remove-orphans because the failed forward SHA may have added a service
  # that would otherwise stay behind and fail the checks. The forward `up` removes
  # nothing: a container it does not know about is not ours to delete.
  local flags=(--no-build) upflags
  if [[ $mode == deploy ]]; then
    upflags=("${flags[@]}")
  else
    flags+=(--pull never)
    upflags=("${flags[@]}" --remove-orphans)
  fi
  step "compose up failed" "${DC[@]}" up -d "${upflags[@]}" || return 1
  # Audit triggers register only at audit's boot, so it restarts after the rest is up.
  wait_for compose_healthy || { FAIL_REASON="containers not healthy before audit restart"; return 1; }
  step "audit recreate failed" "${DC[@]}" up -d --force-recreate "${flags[@]}" --no-deps audit || return 1
  publish_front "$sha" "$mode"
}

http_code() { curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true; }

check_once() { # <manifest-id>
  local code live
  compose_healthy || { FAIL_REASON="containers not healthy"; return 1; }
  code=$(http_code "$ORIGIN/")
  [[ $code == 200 ]] || { FAIL_REASON="GET / answered ${code:-nothing}"; return 1; }
  code=$(http_code "$ORIGIN/api/auth/me")
  [[ $code == 401 ]] || { FAIL_REASON="GET /api/auth/me answered ${code:-nothing}, expected 401"; return 1; }
  live=$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "$ORIGIN/shell-manifest.json" 2>/dev/null | manifest_id || true)
  [[ -n $1 && $live == "$1" ]] || { FAIL_REASON="shell-manifest id is '$live', expected '$1'"; return 1; }
}

checks() { wait_for check_once "$1"; }

deploy() { apply "$1" "${2:-deploy}" && checks "$MANIFEST_ID"; }
rollback() { log "rolling back to $1"; deploy "$1" rollback; }

write_deployed() {
  mkdir -p "$STATE"
  echo "$SHA" >"$ROOT/.deployed"
  echo "$SHA" >>"$STATE/history"
}

prune_images() { # keeps this deploy, the one before it and the last three in history
  local keep
  keep="$SHA $PREV $(tail -n 3 "$STATE/history")"
  # shellcheck disable=SC2086 # tags are validated SHAs
  docker images --format '{{.Repository}}:{{.Tag}}' | images_to_prune $keep | xargs -r docker rmi >/dev/null || true
}

success_text() {
  local migrations="none" services=0
  if [[ -z ${DRY_RUN:-} ]]; then
    services=$("${DC[@]}" ps --format json | grep -c . || true)
    if [[ -n $PREV ]]; then
      migrations=$(git -C "$ROOT" diff --name-only "$PREV" "$SHA" -- 'backend/services/*/internal/migrate/migrations/*.sql' | tr '\n' ' ' || true)
    fi
  fi
  echo "deploy ${SHA:0:7} ok ($services services running; new migrations: ${migrations:-none})"
}

main() {
  local extra=""
  if (($# > 0)); then
    SHA=$1 ACTOR=${2:-}
  else # a newline would hide a second command line from `read`
    IFS=' ' read -r SHA ACTOR extra <<<"${SSH_ORIGINAL_COMMAND//$'\n'/_}" || true
  fi
  if [[ -n $extra ]] || ! valid_sha "$SHA" || ! valid_actor "$ACTOR"; then
    printf 'deploy.sh: refusing %q %q, expected "<40 lowercase hex> <github user>"\n' "$SHA" "$ACTOR" >&2
    exit 2
  fi
  IFS= read -r -t 5 TOKEN || true

  exec 9>"$LOCK"
  flock -w "$LOCK_WAIT" 9 || { echo "deploy.sh: another deploy holds the lock" >&2; exit 4; }

  STAMP=$(date +%Y%m%d-%H%M%S)
  local logfile=/dev/null
  if [[ -z ${DRY_RUN:-} ]]; then
    mkdir -p "$LOGS" 2>/dev/null || true # an unwritable log must not stop a deploy
    logfile="$LOGS/$STAMP-${SHA:0:7}.log"
  fi
  # no-pty: when the ssh client drops, stdout becomes a dead pipe. SIGPIPE ignored
  # and a writer that logs first and then mirrors to stdout keep the deploy (and
  # a rollback) running and the log complete.
  trap '' PIPE HUP
  exec > >(logwriter "$logfile") 2>&1

  PREV=$(cat "$ROOT/.deployed" 2>/dev/null || true)
  local s7=${SHA:0:7} p7=${PREV:0:7}

  run backup || { notify "deploy $s7 aborted: pre-deploy backup failed, nothing was changed"; exit 1; }

  if deploy "$SHA"; then
    run write_deployed
    notify "$(success_text)"
    run prune_images
    exit 0
  fi
  local reason=$FAIL_REASON
  [[ -n $PREV ]] || { notify "deploy $s7 failed ($reason); no previous deploy to roll back to"; exit 1; }
  if rollback "$PREV"; then
    notify "deploy $s7 rolled back to $p7: $reason"
    exit 1
  fi
  notify "PROD DID NOT COME UP AFTER ROLLBACK: deploy $s7 failed ($reason), rollback to $p7 failed ($FAIL_REASON)"
  exit 3
}

main "$@"

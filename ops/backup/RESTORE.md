# Restoring the `andrey` database

Read this before you need it. A backup nobody has restored is an assumption,
not a backup — the run below is the proof, not a promise.

## What gets backed up, and what deliberately does not

`ops/backup/dump.sh` (runs on the production host) produces three artifacts,
kept **separate on purpose**:

1. `andrey-<stamp>.sql.gz` — `pg_dump` of the `andrey` Postgres database.
2. `audit-digest-<stamp>.tar.gz` — the contents of the `audit-digest` volume
   (`digests.jsonl`, the witness to the audit journal's checkpoint chain).
   Archived *before* the dump so it is never newer than it. It travels in its own archive: bundling it with the SQL dump would give the
   witness and the thing it witnesses a shared fate, which defeats the reason
   it lives on a separate volume in the first place.
3. `blobs/<hash>.bin` + `blobs/<hash>.json` — the **source** blobs referenced
   by `territories.source_blob_hash` / `models.source_blob_hash`.

**Converted artifacts (the GLBs mesh-worker produces) are never copied.** The
reconciler rebuilds every missing artifact from its source blob automatically
— this was verified live in production on 3 Aug 2026 when territory artifacts
were deleted and came back on their own within about an hour, for 3
territories and 57 models. Not copying ~2.3 GB of derived artifacts is a
storage/RTO trade explicitly made, not an oversight.

`ops/backup/pull.sh` (runs on the workstation) `rsync`s the whole
`/root/backups` tree down and `gzip -t`s the newest dump on arrival — a
backup that only the machine that produced it has verified is a backup
verified by the thing that might be broken. **The receiver pulls; the host
never pushes**, so a compromised or burned host cannot erase the copies.

## The blob path defect this script fixes

The plan's draft `dump.sh` copied a nonexistent path:
`/b/$sub/$h` (no extension), guarded by `... || true`. Against the real
layout (`backend/pkg/blobstore/fs.go:58-63`, confirmed against the live
`andrey_blob-data` volume on 85.192.26.113) that `test -f` always failed, the
`cp` never ran, and `|| true` swallowed the miss — every backup run would
have produced an **empty `blobs/` directory** while printing nothing and
exiting 0. That is worse than no backup: it looks like one.

Real layout:

```
<root>/<first-2-hex-chars-of-hash>/<hash>.bin    content
<root>/<first-2-hex-chars-of-hash>/<hash>.json   metadata sidecar (content type, size)
```

The corrected script copies **both** files per hash (the store cannot serve a
blob back without its `.json` sidecar) and treats a missing blob as a loud,
non-zero-exit failure that names the hash, rather than a silent no-op.
Rotation is skipped when any blob is missing, so an incomplete run cannot
push a complete older backup out of the retention window.

## Putting source blobs back

`dump.sh` copies blobs as root, so the files in `blobs/` are root-owned and the
`.json` sidecars are `0600` (the services create them that way). Every service
runs as uid 65532 (`nonroot`) on the `blob-data` volume; copy them back and
hand them over, or the services get `permission denied` on every sidecar:

```
docker run --rm -v andrey_blob-data:/var/blob -v "$BACKUP/blobs":/in:ro alpine sh -c '
  for f in /in/*.bin /in/*.json; do
    h=$(basename "$f"); h=${h%%.*}; mkdir -p "/var/blob/${h:0:2}"
    cp "$f" "/var/blob/${h:0:2}/"
  done
  chown -R 65532:65532 /var/blob'
```

## The restore that was actually run

Performed on 2026-08-03 against production **read-only** — no write, no
script execution, and no systemd unit installed on 85.192.26.113 at the time
(`andrey-backup.service` came later, see below). Everything below ran on the
workstation, against files pulled down over SSH/`scp`.

**Environment note:** all Docker image pulls failed in this sandbox
(registry access is blocked), so this run depended entirely on images already
present locally: `postgres:latest` (18.4 — matches the dump's `pg_dump 18.4`
exactly) and `andrey-audit:latest` (already built by a prior task in this
plan). Had neither been present, the restore itself could still have run
against `postgres:17-alpine` (also present locally), but the audit-verify
step specifically needed the already-built `andrey-audit` image — there is no
substitute for it.

### 1. Pull the artifacts down

```
$ scp root@85.192.26.113:/root/backups/andrey-20260803-093932.sql.gz  <scratch>/
  → 109716 bytes, transferred in ~3s wall (mostly SSH handshake)

$ ssh root@85.192.26.113 'docker run --rm -v andrey_audit-digest:/d alpine cat /d/digests.jsonl' \
    > <scratch>/digests.jsonl
  → 363990 bytes, 1479 lines (checkpoint ids 1..1479)
```

Both reads only: the `alpine cat` container is `--rm`, writes nothing to the
host filesystem, and streams its stdout over the existing SSH session.

### 2. Verify the gzip locally

```
$ gzip -t andrey-20260803-093932.sql.gz
$ echo $?
0
```

### 3. Restore into a throwaway container

```
$ docker run -d --name restore-test-task12 \
    -e POSTGRES_PASSWORD=x -e POSTGRES_USER=andrey -e POSTGRES_DB=andrey \
    postgres:latest
  → ready (pg_isready) after 2s

$ gunzip -c andrey-20260803-093932.sql.gz \
    | docker exec -i restore-test-task12 psql -U andrey -d andrey -v ON_ERROR_STOP=1
  → exit code 0, 1s elapsed, 3688 lines of SQL applied, no errors
```

### 4. Row counts: restored dump vs. live production

Restored (from the `andrey-20260803-093932.sql.gz` dump, taken 2026-08-03
09:39:32 UTC):

| table | restored count |
| --- | --- |
| territories | 3 |
| models | 57 |
| placements | 41 |
| audit_log | 66 |
| users | 8 |

Live production, queried directly over SSH during this same run (2026-08-03
~21:51 UTC, i.e. the "2026-08-04" measurement referenced in the task brief —
host and workstation agree on UTC, they just sit in different local zones):

| table | production count |
| --- | --- |
| territories | 3 |
| models | 57 |
| placements | 41 |
| audit_log | 68 |
| users | 8 |

**territories, models, placements, users match exactly. `audit_log` differs
by 2 (66 vs. 68).** This is expected, not a defect: about 12.5 hours passed
between the dump (09:39:32) and the live query (~21:51), and every
GET/mutation the two journal-reading routes and every catalog mutation append
to `audit_log`. Two more rows landing in that window is unremarkable low
traffic, not drift that should worry anyone. What this run proves is that the
dump restores cleanly into a coherent, internally consistent database — not
that the numbers freeze to the row between two points in time twelve hours
apart.

### 5. Audit chain verification against the witness archive of the SAME run

Verify against the `audit-digest-<stamp>.tar.gz` that sits beside the dump
(same `<stamp>`), unpacked to `<scratch>`, **not** against the live
`audit-digest` volume. `dump.sh` archives the witness *before* `pg_dump`, so
the archive is never newer than the dump. The live volume keeps growing: it is
newer than any restored dump, names checkpoints the dump lacks, and `audit
verify` fails that on purpose (`tail removed`, exit 1) because it cannot tell
a backup that is simply older from a journal whose tail was cut.

```
$ tar xzf audit-digest-<stamp>.tar.gz -C <scratch>
$ docker run --rm --network container:restore-test-task12 \
    -v <scratch>:/d:ro \
    andrey-audit:latest verify \
    --db-dsn "postgres://andrey:x@127.0.0.1:5432/andrey?sslmode=disable" \
    --digest-file /d/digests.jsonl \
    --auto-migrate=false
```

Expect `audit: verification passed` and exit 0. A witness older than the
database is fine (checkpoints the witness has not seen are not a failure).

**The 2026-08-03 drill predates this rule.** It verified a dump against a
witness pulled live 12.5 hours later (1479 lines vs 1333 checkpoints) and
passed; the same pair now fails with `tail removed` at id 1334. Its
mechanics (restore, counts) stand; for the verify step use the paired archive
as above.

Total time from container start to a passing `audit verify`: under 5 seconds
of actual work (2s container readiness + 1s SQL restore + ~0.2s verify);
pulling the two files down over SSH beforehand took a few seconds more. Ten
minutes overall including image checks and cleanup.

```
$ docker rm -f restore-test-task12
```

## What this did *not* verify

- **This was not a dump from `dump.sh` itself** — the dump used here is one
  of the ad-hoc ones that were in `/root/backups` on 2026-08-03, before
  `andrey-backup.service` existed. The restore mechanics are identical either
  way — `pg_dump | gzip` in, `gunzip | psql` out — so this proves the
  *procedure*. `dump.sh` has run on the host since (`andrey-backup.service`
  ran it successfully on 2026-10-28), but no restore drill has been repeated
  against one of *its* artifacts: the corrected blob-copy logic is proven by
  that successful run, not by a restore from it.
- **Blob presence was not re-verified against the pulled dump's hash list**
  in this run (that would need a `dump.sh` execution to produce
  `source-hashes-*.txt`); the operator's own numbers already recorded 59/59
  source hashes present when Step 1 was measured on production.

## What the operator must run by hand

**1. Run `dump.sh` on the host when you need a fresh backup.** Do not `scp`
it: `/opt/rosneft` on production is the git checkout that `ops/deploy/deploy.sh`
moves to each deployed SHA, and `andrey-backup.service` runs
`ops/backup/dump.sh` from it, so the script ships with the deploy. Check that
the checkout is at the SHA you expect, then run it (or start the unit with
`systemctl start andrey-backup.service`):

```bash
ssh root@85.192.26.113 'git -C /opt/rosneft rev-parse --short HEAD'
ssh root@85.192.26.113 'bash -x /opt/rosneft/ops/backup/dump.sh'
ssh root@85.192.26.113 'ls -lh /root/backups | tail -20'
```

Expect three new files (`andrey-<stamp>.sql.gz`, `audit-digest-<stamp>.tar.gz`,
`source-hashes-<stamp>.txt`) and a non-empty `blobs/` directory. **A manual run
also rotates**: it keeps only the newest `KEEP` (default 7) of each artifact
kind and deletes the older ones, so running it repeatedly pushes the oldest
backups out of the window. If any blob is reported missing, the script exits
non-zero and names the hash (and skips rotation) — do not silence that,
investigate it (a missing source blob means a territory or model cannot be
restored to a working state without reconversion from scratch, and
reconversion needs the source).

**2. Check the schedule on the host.** `andrey-backup.service` is installed
there (it ran successfully on 2026-10-28). Its unit files live only on the host,
not in this repo, and CD does not refresh them. The intended schedule is daily
at 04:00 Moscow time; confirm that a timer drives it:

```bash
ssh root@85.192.26.113 'systemctl list-timers andrey-backup --all'
ssh root@85.192.26.113 'systemctl status andrey-backup.service'
```

Expect a line with the next scheduled run. If there is none, the service only
runs when started by hand: install an `andrey-backup.timer` beside the service
unit (`OnCalendar=*-*-* 04:00:00` with `Europe/Moscow` time) and
`systemctl daemon-reload && systemctl enable --now andrey-backup.timer`.

**3. Schedule `pull.sh` on the workstation**, daily at 05:00 (an hour after
the host timer, so there's always something to pull) — a `launchd` agent or
`cron` entry running:

```bash
HOST=root@85.192.26.113 DEST=$HOME/backups/andrey bash /path/to/ops/backup/pull.sh
```

## RPO / RTO

- **RPO: 24 hours.** Daily dumps; anything written since the last dump is
  lost in a restore.
- **RTO: restore time + reconversion time.** The SQL restore itself is
  seconds (1s for a 10 MB database, measured above). The dominant cost is
  mesh-worker's reconciler rebuilding every territory/model artifact from its
  source blob — measured live on 3 Aug 2026 at **about an hour** for 3
  territories and 57 models. A restore with all source blobs present should
  therefore be budgeted at roughly an hour end-to-end, not the few seconds
  the SQL step alone takes.

## Corroborating measurements (Step 1, taken 2026-08-04 on production)

| what | value |
| --- | --- |
| database `andrey` | 10 MB |
| latest dump before this run | 108 KB gzipped |
| rows | territories=3, models=57, placements=41, audit_log=68, users=8 |
| source blob hashes | 59, all present |
| source blobs, total bytes | 1 871 238 483 (≈1784 MB) |
| whole `blob-data` volume | 4.1 GB |
| `audit-digest` volume | 364 KB |
| disk | 119 GB total, 48 GB free |

# Restoring the `andrey` database

Read this before you need it. A backup nobody has restored is an assumption,
not a backup — the run below is the proof, not a promise.

## What gets backed up, and what deliberately does not

`ops/backup/dump.sh` (runs on the production host) produces three artifacts,
kept **separate on purpose**:

1. `andrey-<stamp>.sql.gz` — `pg_dump` of the `andrey` Postgres database.
2. `audit-digest-<stamp>.tar.gz` — the contents of the `audit-digest` volume
   (`digests.jsonl`, the witness to the audit journal's checkpoint chain).
   It travels in its own archive: bundling it with the SQL dump would give the
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

The plan `dump.sh` was drafted from copied a nonexistent path:
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

## The restore that was actually run

Performed against production **read-only** — no write, no script execution,
and no systemd unit installed on 85.192.26.113. Everything below ran on the
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

### 5. Audit chain verification against the pulled witness

Per `services/audit-service/README.md#verifying`, not written from memory:

```
$ docker run --rm --network container:restore-test-task12 \
    -v <scratch>:/d:ro \
    andrey-audit:latest verify \
    --db-dsn "postgres://andrey:x@127.0.0.1:5432/andrey?sslmode=disable" \
    --digest-file /d/digests.jsonl \
    --auto-migrate=false

{"level":"INFO","msg":"audit: witness loaded","path":"/d/digests.jsonl","lines":1479}
{"level":"INFO","msg":"audit: verification passed","checkpoints":1333}
$ echo $?
0
```

**Passed.** 1333 checkpoints recomputed from the restored database's
`audit_checkpoint` rows all matched the corresponding line in the witness
file pulled fresh from the `audit-digest` volume. The remaining 146 witness
lines (1479 total pulled vs. 1333 checked) cover checkpoints sealed *after*
the dump was taken — `Verify` looks up the witness by the checkpoint id it
found in the restored database, so those later lines are simply never
consulted. Per the service's own doc comment, a checkpoint the witness
hasn't recorded — or, symmetrically here, a witness entry with no matching
checkpoint in an older dump — is not a failure: the two only need to agree on
the range they both cover, and they did, byte for byte, for all 1333 of them.

Total time from container start to a passing `audit verify`: under 5 seconds
of actual work (2s container readiness + 1s SQL restore + ~0.2s verify);
pulling the two files down over SSH beforehand took a few seconds more. Ten
minutes overall including image checks and cleanup.

```
$ docker rm -f restore-test-task12
```

## What this did *not* verify

- **This was not the predeploy dump from `dump.sh` itself** — `dump.sh` has
  never run on the production host (no systemd timer exists yet; see below).
  The dump used here is one of the ad-hoc ones already in `/root/backups`
  from manual runs. The restore mechanics are identical either way — `pg_dump
  | gzip` in, `gunzip | psql` out — so this proves the *procedure*, but the
  corrected blob-copy logic in `dump.sh` itself was **not** exercised against
  production, because doing so would require running a script on the host,
  which is out of scope for this read-only pass.
- **Blob presence was not re-verified against the pulled dump's hash list**
  in this run (that would need a `dump.sh` execution to produce
  `source-hashes-*.txt`); the operator's own numbers already recorded 59/59
  source hashes present when Step 1 was measured on production.

## What the operator must run by hand

This repo only had read-only SSH to production. The following still needs a
human with write access:

**1. Install `dump.sh` on the host and run it once manually:**

```bash
scp ops/backup/dump.sh root@85.192.26.113:/opt/rosneft/ops/backup/dump.sh
ssh root@85.192.26.113 'chmod +x /opt/rosneft/ops/backup/dump.sh'
ssh root@85.192.26.113 'bash -x /opt/rosneft/ops/backup/dump.sh'
ssh root@85.192.26.113 'ls -lh /root/backups | tail -20'
```

Expect three new files (`andrey-<stamp>.sql.gz`, `audit-digest-<stamp>.tar.gz`,
`source-hashes-<stamp>.txt`) and a non-empty `blobs/` directory. If any blob
is reported missing, the script now exits non-zero and names the hash — do
not silence that, investigate it (a missing source blob means a territory or
model cannot be restored to a working state without reconversion from
scratch, and reconversion needs the source).

**2. Install the systemd timer on the host**, daily at 04:00 Moscow time:

```
/etc/systemd/system/andrey-backup.service
/etc/systemd/system/andrey-backup.timer
```

The service unit's `ExecStart` should point at
`/opt/rosneft/ops/backup/dump.sh`. Verify with:

```bash
ssh root@85.192.26.113 'systemctl list-timers andrey-backup --all'
```

Expect a line with the next scheduled run.

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

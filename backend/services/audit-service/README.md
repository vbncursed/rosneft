# audit-service

Owns the **append-only change journal** — who changed what, when — and the
Postgres triggers that fill it. Exposes an internal gRPC surface consumed
exclusively by `gateway`; it has no public HTTP listener.

It shares the `andrey` database with every other service, isolated by its own
`audit_goose_db_version` table. That shared database is what lets one table and
one trigger function cover territories, models, placements, panoramas,
documents, users and roles at once.

## Why triggers rather than application code

Capture happens in the database, not in Go. Three things follow:

- **Completeness is provable.** No write can reach an audited table without
  passing the trigger, so a new endpoint cannot silently escape the journal.
- **Cascades come for free.** Deleting a territory drops its placements,
  panoramas and documents through FKs; the trigger fires once per removed row.
  Go-side instrumentation would have to enumerate them, and would drift.
- **Failure is atomic with the change.** The trigger runs inside the mutation's
  transaction, so a journal write cannot fail while the change succeeds.

The cost is that the identity of the actor has to reach the database — see
below — and that this logic is SQL, which is why it carries the repository's
only integration tests.

## Responsibilities

- **`audit_log`** — one row per change: actor, company, action, entity, the
  before/after JSON snapshots, request id, result. The diff is **not** stored:
  it is fully determined by the two snapshots and is derived by the client.
- **`audit_capture()`** — one generic trigger function for every audited table,
  parameterised through `TG_ARGV` (entity name, pk column, label column). It
  redacts `password_hash` / `totp_secret` / `code_hash` unconditionally and
  drops writes that touched only bookkeeping columns.
- **`ensure_audit_triggers()`** — attaches the trigger to every audited table
  that exists, skipping the rest. Called on each boot, so this service needs no
  ordering against catalog / auth / content migrations, and picks up a table
  created later.
- **`ListEntries`** — a page of the journal, cursor-paged over descending id.
  Refuses a tenant-scoped read with an empty company id rather than executing
  it, since that query would match exactly the Root and system rows.
- **`Record`** — the events no trigger can see: login, logout, password change.
  Sessions live in Redis, not in a table.

## Append-only

`audit_log` carries a `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger that raises.
A `REVOKE` alone would not hold: `POSTGRES_USER` owns every table here and could
grant the right back to itself. The trigger fires against the owner too.

There is no retention policy and no cleanup job.

## Actor propagation

```
browser ──Bearer──▶ gateway ──x-actor-id / x-actor-company (gRPC metadata)──▶ catalog / content / auth
                                                                                      │
                                                              pkg/audittx.Run: BEGIN; SET LOCAL app.actor_id …
                                                                                      │
                                                                              audit_capture() reads current_setting()
```

No `.proto` carries identity — it rides metadata, so service contracts were left
untouched. `SET LOCAL` has no effect outside a transaction, which is why every
audited mutation runs through `pkg/audittx.Run`.

Background work (the mesh-worker reconciler, migrations) carries no actor. Those
changes are logged with a NULL actor rather than dropped, and read as "system".

## Tamper evidence

The append-only trigger stops the application and every SQL client using DML. It
does not stop somebody who can `ALTER TABLE … DISABLE TRIGGER`. For that the
service seals the journal periodically and witnesses the result outside the
database.

Every `AUDIT_CHECKPOINT_INTERVAL` (default `5m`) a tick folds the rows settled
since the previous tick into one SHA-256, chains it to the previous checkpoint,
and appends the result to `audit_checkpoint` — a table carrying the same
append-only triggers as the journal. The digest is then written twice: to the
service log under the key `audit: checkpoint`, and as one JSON line to
`AUDIT_DIGEST_FILE` on a volume that is not the database's.

**The file is the part that matters.** A chain stored only in Postgres protects
against nobody who can edit Postgres: the same credentials that rewrite the
journal recompute the chain. The copy on the other volume is what they would
also have to reach — so back it up separately from the database dump, or the two
share a fate and the evidence is worth nothing.

The digest is computed entirely in SQL (`pgcrypto`, claimed by migration `00004`
because service migrations run in no fixed order) with
`SET LOCAL timezone = 'UTC'`: jsonb renders `timestamptz` in the session's zone,
these containers run `Europe/Moscow`, and the same rows were measured to digest
differently under the two. That pin is load-bearing — moving it makes every
digest already witnessed irreproducible. The `at` field of the witness *file* is
rendered in local time instead, since it is display only and never enters a hash.

### Why the boundary is a watermark, not max(id)

`audit_log.id` comes from a sequence, and a sequence hands out ids at INSERT, not
at COMMIT. An id can therefore belong to a transaction nobody can see yet.
Digesting up to `max(id)` would skip such a row and then find it inside an
already-sealed range once it commits — indistinguishable, to `verify`, from a
forged insertion.

So each tick records `pg_sequence_last_value('audit_log_id_seq')` and the *next*
tick uses it as its boundary. Every transaction alive when that value was taken
has since committed or rolled back, so every id below it is settled.

This assumes the tick interval exceeds the longest write transaction. Mutations
here are single-statement upserts, so `5m` is generous. A longer transaction
produces a false alarm, never a missed forgery.

### Verifying

```bash
audit verify                                        # recompute the chain
audit verify --digest-file /var/audit/digests.jsonl # and compare to the witness
```

Exits non-zero and names the first failing checkpoint; later ones fold it in and
would all fail too. A checkpoint the witness has not seen is **not** a failure —
the file is appended after the row commits, and a witness enabled part-way
through the journal's life leaves a permanent, harmless gap.

The witness is keyed by the checkpoint's own id, never by `to_id`: a quiet
interval seals an empty range, so `from_id == to_id` repeats across consecutive
checkpoints while their digests keep advancing.

## Retention

The journal is kept **forever**. There is no cleanup job and no partitioning.

That is a decision, not an omission. Deleting rows requires the append-only
trigger out of the way, and the only way to reclaim space without disabling it is
partitioning — a migration that rebuilds the table carrying the strongest
guarantee in the system. Nobody has measured a problem worth that risk.

What exists instead:

- `audit_log_rows` and `audit_log_bytes`, published on the checkpoint tick. The
  row count is `reltuples`, the planner's estimate: an exact `count(*)` is a
  sequential scan, and the alert fires on orders of magnitude.
- `AuditJournalGrowth` fires above 5 GB — the signal to revisit this.
- `audit export --before=2026-01-01 --out=archive.jsonl` streams old entries out
  as JSONL keyed by the `audit_log` column names. It deletes nothing; deciding to
  delete is a separate, deliberate act. The output file is opened `O_EXCL`.

Upgrade path, when the alert fires: convert `audit_log` to monthly range
partitions, then `DETACH`/`DROP PARTITION` after exporting. `DROP PARTITION` is
DDL, so the row-level append-only trigger does not block it — which is exactly
why partitioning is the only honest way to implement retention here.

## Not captured

`territory_artifacts` and `model_artifacts` are deliberately absent from the
trigger list, and this is not a gap. The mesh-worker writes them with no human
actor. The human act — replacing a territory's source archive — is captured on
`territories.source_blob_hash`, because `UpsertTerritory` runs through
`pkg/audittx`. What the journal skips is only the conversion's own bookkeeping,
which the job record and the logs already cover.

## Layout

```
cmd/audit/     # cobra entry point: serve + migrate-{up,down,status}
internal/
  bootstrap/   # config → migrate → postgres → service → triggers → gRPC server
  config/      # Viper layered config, AUDIT_* env vars
  domain/      # Entry, Filter + sentinel errors
  migrate/     # goose migrations (schema, triggers, ignore list) + integration tests
  service/     # scope validation, paging, Record
  storage/     # PostgreSQL adapter, one method per file
  transport/   # gRPC handlers, one method per file
```

## Configuration

| Env | Default | Meaning |
| --- | --- | --- |
| `AUDIT_GRPC_ADDR` | `:9009` | gRPC listen address |
| `AUDIT_DB_DSN` | — | PostgreSQL DSN (required) |
| `AUDIT_AUTO_MIGRATE` | `true` | run goose migrations on startup |
| `AUDIT_CHECKPOINT_INTERVAL` | `5m` | how often to seal a checkpoint; `0` disables. Must exceed the longest write transaction |
| `AUDIT_DIGEST_FILE` | *(empty)* | append-only JSONL witness; empty disables it, and the chain then protects nobody who can edit the database |
| `AUDIT_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Tests

Service-layer tests run with `make test` like everywhere else. The trigger
behaviour needs a real Postgres and sits behind a build tag:

```bash
go test -tags=integration ./...   # needs Docker; uses testcontainers
```

They cover capture on insert/update/delete, secret redaction, the no-op guard,
actor attribution and its isolation between transactions, the append-only
guard, and idempotent trigger attachment.

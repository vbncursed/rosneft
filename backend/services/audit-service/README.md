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

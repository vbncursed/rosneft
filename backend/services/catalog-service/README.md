# catalog-service

Owns projects, artifacts, and placements. Postgres-backed, exposes a gRPC
surface consumed by `gateway` and `mesh-worker`. On boot it can run an
auto-migration and seed projects from a YAML file (`data/projects.yaml`).

## Responsibilities

- CRUD over `projects`, `artifacts`, `placements` in Postgres.
- Schema migrations (auto-applied at startup when enabled).
- YAML-driven seed at first boot for development environments.

## Layout

```
internal/
  bootstrap/   # config → pgstorage → service → grpc server
  config/      # Viper layered config, CATALOG_* env vars
  domain/      # entities + sentinel errors
  storage/
    pgstorage/ # one file = one DB method (add.go, get.go, …)
               # pgstorage.go owns the connection + initTables (auto-migrate)
  service/     # business layer; service.go owns the storage interface
               # and constructor, then one method per file
  api/         # gRPC handlers; api.go has the contract + constructor
data/projects.yaml  # seed data (volumes-mounted in Compose)
```

The split mirrors the project-wide convention: every storage / service / api
package has one file with the storage interface or constructor and the rest
of the files contain a single method each.

## Configuration

All env vars are prefixed `CATALOG_`. Defaults shown.

| Var | Default | Purpose |
| --- | --- | --- |
| `CATALOG_GRPC_ADDR` | `:9001` | gRPC listener |
| `CATALOG_DB_DSN` | *(required)* | Postgres DSN |
| `CATALOG_AUTO_MIGRATE` | `true` | Run schema migrations on boot |
| `CATALOG_SEED_FILE` | *(empty)* | Path to YAML seed; ignored if file absent |
| `CATALOG_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CATALOG_LOG_FORMAT` | `json` | `json` / `text` |
| `CATALOG_SHUTDOWN_TIMEOUT` | `15s` | Graceful drain window |

## Run locally

Postgres is required:

```bash
docker run -d --name pg -p 5432:5432 \
  -e POSTGRES_USER=andrey -e POSTGRES_PASSWORD=andrey -e POSTGRES_DB=andrey \
  postgres:17
```

Then from `backend/`:

```bash
make build
./bin/catalog \
  --db-dsn "postgres://andrey:andrey@localhost:5432/andrey?sslmode=disable" \
  --grpc-addr :9001 \
  --seed-file services/catalog-service/data/projects.yaml
```

Or via Compose: `make compose-up`.

## Tests

```bash
make test
```

Storage tests run against an in-memory fake; integration coverage is wired
through the higher-level service tests.

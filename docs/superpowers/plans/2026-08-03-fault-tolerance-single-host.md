# Отказоустойчивость на одном хосте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отказ перестаёт быть необратимым, кратковременный сбой зависимости перестаёт быть виден пользователю, а сработавший алерт доходит до человека — в пределах одного хоста, без второго узла.

**Architecture:** Восемь gRPC-клиентов получают retry-политику одной правкой в общем `grpcutil.Dial`. Готовность перестаёт быть декларацией: тикер в каждом сервисе пингует свою зависимость, двигает `grpc_health_v1` и пишет гейдж `service_ready`, а опрашивающим становится уже существующий Prometheus. Reconciler получает защёлку in-flight, без которой второй воркер конвертирует одно и то же дважды параллельно. Ограничение частоты ставится в nginx, где есть настоящий IP, и конфигурация nginx впервые заезжает под git. Бэкапы уезжают на рабочую машину и проверяются восстановлением.

**Tech Stack:** Go 1.26.5, grpc-go 1.82, `google.golang.org/grpc/health`, Prometheus client_golang, Cobra, Docker Compose, nginx, Alertmanager.

**Spec:** [`docs/superpowers/specs/2026-08-03-fault-tolerance-single-host-design.md`](../specs/2026-08-03-fault-tolerance-single-host-design.md)

## Навыки, которые обязан загрузить исполнитель каждой задачи

Субагент стартует с чистым контекстом: он не видит ни этого разговора, ни
спеки, ни навыков, загруженных тем, кто его запустил. Из репозитория к нему
доедет только `CLAUDE.md` (и `backend/CLAUDE.md` при работе в `backend/`).
Всё остальное — ниже, и вызывается инструментом Skill **до** первой правки.

**В каждой задаче без исключений, включая ops-задачи 9–12:**

- `ponytail:ponytail`
- `modern-go-guidelines:use-modern-go`
- `superpowers:verification-before-completion`

**Дополнительно в Go-задачах (1–8):**

- `cc-skills-golang:golang-how-to` — оркестратор, сам подтягивает нужное из
  своего набора по контексту; перечислять все 46 не надо
- `superpowers:test-driven-development`

**Точечно по задачам:**

| Задачи | Дополнительно |
| --- | --- |
| 1, 2, 3 — тикеры, горутины, пробы | `cc-skills-golang:golang-concurrency`, `cc-skills-golang:golang-observability`, `cc-skills-golang:golang-testing` |
| 4 — retry на bufconn | `cc-skills-golang:golang-grpc`, `cc-skills-golang:golang-testing` |
| 6 — защёлка, minimock | `cc-skills-golang:golang-testing`, `cc-skills-golang:golang-stretchr-testify` |
| 7, 8 — Cobra | `cc-skills-golang:golang-spf13-cobra` |

## Global Constraints

- **Файл — максимум 200 строк** (без пустых и комментариев). На бэкенде правило проверяется руками.
- **`make -C backend check` обязан пройти перед каждым коммитом, трогающим Go.** Это gofmt + `go mod tidy`-дрейф + `GOWORK=off go vet` + golangci-lint + `go test -race -shuffle=on` + govulncheck, ~80 с. Хук `.githooks/pre-commit` делает это сам после `make -C backend hooks`.
- **Один concern — один файл.** Никаких god-файлов; новый метод сервиса или storage идёт в собственный файл.
- **Тесты:** `testify/suite` для группировки, `gotest.tools/v3/assert` для утверждений (`assert.X(s.T(), …)`, никогда `s.Equal()`), `gojuno/minimock/v3` для моков. Контроллер строится в `SetupTest` через `minimock.NewController(s.T())`.
- **Modern Go 1.26:** `t.Context()` вместо `context.WithCancel(context.Background())`, `wg.Go(fn)`, `errors.AsType[T]`, `for i := range n`, `min`/`max`, `cmp.Or`, `new(val)` вместо `x := val; &x`.
- **`pkg/` — общий модуль.** Правка в `pkg/grpcutil` или `pkg/metrics` касается всех десяти сервисов; после неё `make -C backend check` прогоняется целиком, а не по одному модулю.
- **`docker-compose.override.yml` на проде не отслеживается git и содержит секреты.** Никогда не удалять, не перезаписывать, не «восстанавливать из репозитория». `GATEWAY_CSRF_SECRET` живёт только там, и без него шлюз **отказывается стартовать**.
- **Бинды одним файлом не переживают `git pull`:** git заменяет файл, инод меняется, контейнер держит старый. Конфигурации Prometheus и Alertmanager монтируются каталогом, и после правки контейнер **пересоздаётся** (`up -d --force-recreate`), а не перезапускается.
- **`docker compose build` умеет молча оставить старый образ** и написать «Started». Перед любым выводом из проверки сверять `docker image inspect andrey-<svc> --format '{{.Created}}'`.
- **На прод-хосте живёт посторонний проект `simpa-*`.** Фильтровать контейнеры по `name=postgres` нельзя — совпадёт и он. Наш — `andrey-postgres-1`, пользователь и база `andrey`.
- **Новый Go-сервис требует строки в `SERVICES` (`backend/Makefile`) и цели в `ops/prometheus/prometheus.yml`**, иначе он молча не собирается / не скрейпится. В этом плане новых Go-сервисов нет; `alertmanager` — не Go-сервис и в оба списка не идёт.

---

## Структура файлов

**Фаза 1 — Go. Один PR, проходит `make check`.**

| Файл | Ответственность |
| --- | --- |
| `backend/pkg/metrics/readiness.go` (создать) | Гейдж `service_ready{service}` и `SetReady` |
| `backend/pkg/grpcutil/readiness.go` (создать) | `WatchReadiness` — тикер, двигающий health-статус и гейдж |
| `backend/pkg/grpcutil/readiness_test.go` (создать) | Тесты тикера |
| `backend/pkg/grpcutil/client.go` (править) | Retry-политика в `Dial` |
| `backend/pkg/grpcutil/client_test.go` (создать) | Тест повторов на bufconn |
| `backend/pkg/grpcutil/healthcheck_cmd.go` (создать) | `CheckHealth` + `HealthcheckCmd` для gRPC-сервисов |
| `backend/pkg/healthz/probes.go` (создать) | `GRPCProbe`, `DirProbe` — пробы для HTTP-сервисов |
| `backend/services/*/internal/bootstrap/serve.go` (править, 9 сервисов) | Запуск `WatchReadiness` |
| `backend/services/*/cmd/*/main.go` (править, 10 сервисов) | Подкоманда `healthcheck` |
| `backend/services/catalog-service/internal/storage/ping.go` (удалить) | Осиротевший метод с ложным комментарием |
| `backend/services/mesh-service/internal/storage/ping.go` (удалить) | То же |
| `backend/services/mesh-service/internal/storage/redis.go` (править) | Ключи `rosneft:` → `andrey:` |
| `backend/services/mesh-service/internal/storage/lock_target.go` (создать) | `TryLockTarget` / `UnlockTarget` на Redis |
| `backend/services/mesh-service/internal/service/mesh.go` (править) | Два метода в интерфейс `Queue` |
| `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go` (править) | Защёлка перед `SubmitConversion` |
| `backend/services/mesh-service/internal/service/process_job.go` (править) | Снятие защёлки после публикации |
| `backend/services/mesh-service/internal/config/config.go` (править) | `WorkerName` по умолчанию — hostname |
| `backend/services/gateway-service/internal/bootstrap/transport.go` (править) | Восемь проб вместо голого `MarkReady()` |
| `backend/services/asset-service/internal/bootstrap/transport.go` (править) | Проба блоб-каталога |

**Фаза 2 — ops. Go не собирается, выкатывается руками.**

| Файл | Ответственность |
| --- | --- |
| `docker-compose.yml` (править) | `healthcheck`, `depends_on: service_healthy`, `replicas: 2`, привязка порта |
| `ops/prometheus/rules.yml` (править) | Правило `ServiceNotReady` |
| `ops/prometheus/prometheus.yml` (править) | Блок `alerting.alertmanagers` |
| `ops/alertmanager/alertmanager.yml` (создать) | Маршрутизация и Telegram-приёмник |
| `ops/nginx/rosneft.conf` (создать) | Вхост с `limit_req` |
| `ops/nginx/README.md` (создать) | Правка `mime.types` и порядок установки |
| `ops/backup/dump.sh` (создать) | Дамп + проверка + дайджесты + список исходных хешей |
| `ops/backup/pull.sh` (создать) | Тяга на рабочую машину |
| `ops/backup/RESTORE.md` (создать) | Проверенная процедура восстановления с фактическими числами |

---

# ФАЗА 1 — Go

## Task 1: Гейдж готовности и тикер, который его двигает

**Files:**
- Create: `backend/pkg/metrics/readiness.go`
- Create: `backend/pkg/grpcutil/readiness.go`
- Test: `backend/pkg/grpcutil/readiness_test.go`

**Interfaces:**
- Consumes: ничего (первая задача).
- Produces:
  - `metrics.SetReady(service string, ready bool)`
  - `grpcutil.ReadinessConfig{Service string; Health *health.Server; Names []string; Interval time.Duration; Probe func(context.Context) error}`
  - `grpcutil.WatchReadiness(ctx context.Context, cfg ReadinessConfig)` — блокирующая, запускается в горутине.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/pkg/grpcutil/readiness_test.go`:

```go
package grpcutil_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type ReadinessSuite struct{ suite.Suite }

func TestReadinessSuite(t *testing.T) { suite.Run(t, new(ReadinessSuite)) }

// statusOf reads the current serving status for the unnamed ("") service.
func statusOf(t *testing.T, h *health.Server) healthpb.HealthCheckResponse_ServingStatus {
	t.Helper()
	resp, err := h.Check(t.Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(t, err)
	return resp.GetStatus()
}

func (s *ReadinessSuite) TestFlipsToNotServingWhenProbeFails() {
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)

	var failing atomic.Bool
	failing.Store(true)

	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()
	go grpcutil.WatchReadiness(ctx, grpcutil.ReadinessConfig{
		Service:  "test",
		Health:   h,
		Names:    []string{""},
		Interval: 5 * time.Millisecond,
		Probe: func(context.Context) error {
			if failing.Load() {
				return errors.New("dependency down")
			}
			return nil
		},
	})

	assert.Assert(s.T(), waitFor(func() bool {
		return statusOf(s.T(), h) == healthpb.HealthCheckResponse_NOT_SERVING
	}), "expected NOT_SERVING while the probe fails")

	failing.Store(false)
	assert.Assert(s.T(), waitFor(func() bool {
		return statusOf(s.T(), h) == healthpb.HealthCheckResponse_SERVING
	}), "expected SERVING once the probe recovers")
}

func (s *ReadinessSuite) TestNilHealthServerIsAllowed() {
	ctx, cancel := context.WithCancel(s.T().Context())
	defer cancel()
	done := make(chan struct{})
	go func() {
		grpcutil.WatchReadiness(ctx, grpcutil.ReadinessConfig{
			Service:  "worker",
			Interval: 5 * time.Millisecond,
			Probe:    func(context.Context) error { return nil },
		})
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		s.T().Fatal("WatchReadiness did not return on ctx cancellation")
	}
}

// waitFor polls cond every millisecond for up to a second.
func waitFor(cond func() bool) bool {
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(time.Millisecond)
	}
	return false
}
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

```bash
cd backend/pkg && go test ./grpcutil/ -run TestReadinessSuite -v
```

Ожидается: `undefined: grpcutil.WatchReadiness`.

- [ ] **Step 3: Написать гейдж**

Создать `backend/pkg/metrics/readiness.go`:

```go
package metrics

import "github.com/prometheus/client_golang/prometheus"

// serviceReady is 1 while the service's dependencies answered their last probe.
//
// It exists because `up` cannot answer the question: a process whose Postgres
// pool has died still serves /metrics, so `up` stays 1 and TargetDown never
// fires. This gauge makes Prometheus the poller of readiness, which is the
// only poller the stack has.
var serviceReady = prometheus.NewGaugeVec(prometheus.GaugeOpts{
	Name: "service_ready",
	Help: "1 when the service's dependencies answered their last probe, 0 otherwise.",
}, []string{"service"})

func init() { Registry.MustRegister(serviceReady) }

// SetReady publishes the readiness of one service.
func SetReady(service string, ready bool) {
	v := 0.0
	if ready {
		v = 1
	}
	serviceReady.WithLabelValues(service).Set(v)
}
```

- [ ] **Step 4: Написать тикер**

Создать `backend/pkg/grpcutil/readiness.go`:

```go
package grpcutil

import (
	"context"
	"log/slog"
	"time"

	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/vbncursed/rosneft/backend/pkg/metrics"
)

// defaultReadinessInterval is deliberately shorter than the 30s Prometheus
// rule interval, so a flip is visible on the next scrape rather than the one
// after it.
const defaultReadinessInterval = 10 * time.Second

// ReadinessConfig configures WatchReadiness.
type ReadinessConfig struct {
	Service  string             // metric label, e.g. "catalog"
	Health   *health.Server     // optional: nil for processes with no gRPC server
	Names    []string           // gRPC service names to flip; include "" for the whole server
	Interval time.Duration      // defaults to 10s when <= 0
	Probe    func(context.Context) error
	Logger   *slog.Logger       // optional
}

// WatchReadiness probes cfg.Probe on a ticker, publishes the result as the
// service_ready gauge, and — when cfg.Health is set — flips the gRPC health
// status for every name in cfg.Names.
//
// It blocks until ctx is done; run it in a goroutine. The first probe runs
// immediately rather than after one interval, so a service that boots with a
// dead dependency reports it at once instead of looking ready for 10 seconds.
func WatchReadiness(ctx context.Context, cfg ReadinessConfig) {
	if cfg.Interval <= 0 {
		cfg.Interval = defaultReadinessInterval
	}

	last := true
	check := func() {
		probeCtx, cancel := context.WithTimeout(ctx, cfg.Interval)
		err := cfg.Probe(probeCtx)
		cancel()

		ready := err == nil
		metrics.SetReady(cfg.Service, ready)
		if ready == last {
			return
		}
		last = ready
		if cfg.Logger != nil {
			cfg.Logger.Warn("readiness changed", "service", cfg.Service, "ready", ready, "err", err)
		}
		if cfg.Health == nil {
			return
		}
		status := healthpb.HealthCheckResponse_NOT_SERVING
		if ready {
			status = healthpb.HealthCheckResponse_SERVING
		}
		for _, n := range cfg.Names {
			cfg.Health.SetServingStatus(n, status)
		}
	}

	check()
	t := time.NewTicker(cfg.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			check()
		}
	}
}
```

- [ ] **Step 5: Прогнать тест**

```bash
cd backend/pkg && go test ./grpcutil/ -run TestReadinessSuite -race -v
```

Ожидается: PASS.

**Внимание на первый прогон:** `last` инициализирован в `true`, поэтому первый провальный прогон обязан дать переход. Если тест `TestFlipsToNotServingWhenProbeFails` виснет — значит `check()` не вызывается до тикера, и первый шаг пропущен.

- [ ] **Step 6: Коммит**

```bash
make -C backend check
git add backend/pkg/metrics/readiness.go backend/pkg/grpcutil/readiness.go backend/pkg/grpcutil/readiness_test.go
git commit -m "feat(pkg): readiness ticker that moves gRPC health and a service_ready gauge

The gauge exists because up cannot answer the question it looks like it
answers: a process whose connection pool has died still serves /metrics, so
up stays 1 and TargetDown never fires."
```

---

## Task 2: Подключить пробы к девяти процессам и убрать два осиротевших метода

**Files:**
- Modify: `backend/services/catalog-service/internal/bootstrap/serve.go`
- Modify: `backend/services/content-service/internal/bootstrap/serve.go`
- Modify: `backend/services/audit-service/internal/bootstrap/serve.go`
- Modify: `backend/services/auth-service/internal/bootstrap/serve.go`
- Modify: `backend/services/twofa-service/internal/bootstrap/serve.go`
- Modify: `backend/services/passkey-service/internal/bootstrap/serve.go`
- Modify: `backend/services/mesh-service/internal/bootstrap/serve.go` (mesh-api)
- Modify: `backend/services/mesh-service/internal/bootstrap/run_worker.go` (mesh-worker)
- Modify: `backend/services/upload-service/internal/bootstrap/serve.go`
- Delete: `backend/services/catalog-service/internal/storage/ping.go`
- Delete: `backend/services/mesh-service/internal/storage/ping.go`

**Interfaces:**
- Consumes: `grpcutil.WatchReadiness`, `grpcutil.ReadinessConfig` из Task 1.
- Produces: ничего для последующих задач; наблюдаемый результат — метрика `service_ready{service}` у девяти целей.

- [ ] **Step 1: Удалить два осиротевших метода**

Оба файла несут доккомментарий «Used by readiness probes» и не вызываются ниоткуда — пинг при загрузке делает `bootstrap/postgres.go` собственным вызовом. Тикер ниже пингует пул напрямую, поэтому оставлять их значит оставлять ложный комментарий.

```bash
git rm backend/services/catalog-service/internal/storage/ping.go
git rm backend/services/mesh-service/internal/storage/ping.go
```

- [ ] **Step 2: Убедиться, что их правда никто не звал**

```bash
cd backend && make build
```

Ожидается: успешная сборка всех десяти бинарей. Ошибка компиляции здесь означала бы, что вызывающий всё-таки есть — тогда метод не удалять, а подключить его к тикеру.

- [ ] **Step 3: Подключить тикер в catalog**

В `backend/services/catalog-service/internal/bootstrap/serve.go`, сразу после `grpcSrv, healthSrv := InitGRPCServer(svc, logger)`:

```go
	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "catalog",
		Health:  healthSrv,
		Names:   []string{"", catalogv1.CatalogService_ServiceDesc.ServiceName},
		Probe:   func(ctx context.Context) error { return pool.Ping(ctx) },
		Logger:  logger,
	})
```

Импорт: `"github.com/vbncursed/rosneft/backend/pkg/grpcutil"` (в этом файле его ещё нет; `catalogv1` уже импортирован).

- [ ] **Step 4: Повторить для content, audit, upload**

Тот же блок, отличаются только `Service`, имя proto-сервиса в `Names` и проба:

| Сервис | `Service` | Проба |
| --- | --- | --- |
| content | `"content"` | `pool.Ping(ctx)` |
| audit | `"audit"` | `pool.Ping(ctx)` |
| upload | `"upload"` | `func(context.Context) error { _, err := os.Stat(cfg.BlobDir); return err }` |

upload-сервис не ходит в Postgres: его состояние — блоб-том и каталог незавершённых загрузок. Пробой служит `os.Stat` корня хранилища, потому что именно его исчезновение (отвалившийся том) делает сервис бесполезным при живом процессе.

- [ ] **Step 5: Повторить для auth, twofa, passkey — две зависимости**

У этих трёх и Postgres, и Redis. Проба проверяет обе и возвращает объединённую ошибку:

```go
		Probe: func(ctx context.Context) error {
			return errors.Join(pool.Ping(ctx), redisClient.Ping(ctx).Err())
		},
```

`errors.Join` — а не первая попавшаяся ошибка — потому что в логе должно быть видно, что именно упало: сообщение «readiness changed» несёт `err` целиком.

- [ ] **Step 6: mesh-api и mesh-worker**

mesh-api (`serve.go`): проба — `redisClient.Ping(ctx).Err()`, `Names` включает `meshv1.MeshService_ServiceDesc.ServiceName`.

mesh-worker (`run_worker.go`): gRPC-сервера у него нет, поэтому `Health` не задаётся вовсе — `WatchReadiness` это допускает и просто пишет гейдж. Ставить рядом с запуском reconciler-тикера:

```go
	go grpcutil.WatchReadiness(rootCtx, grpcutil.ReadinessConfig{
		Service: "mesh-worker",
		Probe:   func(ctx context.Context) error { return redisClient.Ping(ctx).Err() },
		Logger:  logger,
	})
```

- [ ] **Step 7: Проверить на живом стенде**

```bash
make -C backend compose-up
sleep 20
for s in catalog content audit auth twofa passkey mesh-api mesh-worker upload; do
  echo -n "$s: "
  docker exec andrey-prometheus-1 wget -qO- "http://$s:9101/metrics" | grep '^service_ready' || echo MISSING
done
```

Ожидается: девять строк `service_ready{service="…"} 1`. `MISSING` у любого — тикер не подключён.

Затем проверить переход:

```bash
docker pause andrey-postgres-1
sleep 15
docker exec andrey-prometheus-1 wget -qO- http://catalog:9101/metrics | grep '^service_ready'
docker unpause andrey-postgres-1
```

Ожидается: `service_ready{service="catalog"} 0`, затем возврат к 1 в пределах 15 секунд.

**`pause`, а не `stop`:** остановленный Postgres рвёт соединение, и `Ping` падает мгновенно — это проверяет более лёгкий случай. `pause` замораживает процесс с открытыми сокетами, то есть воспроизводит зависший пул, ради которого гейдж и заводится.

- [ ] **Step 8: Коммит**

```bash
make -C backend check
git add -A backend/services
git commit -m "feat(services): publish real readiness for nine processes

Two ping.go files claimed in their doc comments to be used by readiness
probes and were called by nobody. The probes are now real, and they ping the
pool directly, so both files are gone rather than left describing code that
was never written."
```

---

## Task 3: Пробы у двух HTTP-сервисов

**Files:**
- Create: `backend/pkg/healthz/probes.go`
- Test: `backend/pkg/healthz/probes_test.go`
- Modify: `backend/services/gateway-service/internal/bootstrap/transport.go:84-85`
- Modify: `backend/services/asset-service/internal/bootstrap/transport.go:21-23`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces:
  - `healthz.GRPCProbe(conn grpc.ClientConnInterface) healthz.Probe`
  - `healthz.DirProbe(path string) healthz.Probe`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/pkg/healthz/probes_test.go`:

```go
package healthz_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

type ProbesSuite struct{ suite.Suite }

func TestProbesSuite(t *testing.T) { suite.Run(t, new(ProbesSuite)) }

func (s *ProbesSuite) TestDirProbePassesOnExistingDir() {
	err := healthz.DirProbe(s.T().TempDir())(s.T().Context())
	assert.NilError(s.T(), err)
}

func (s *ProbesSuite) TestDirProbeFailsOnMissingDir() {
	err := healthz.DirProbe(s.T().TempDir() + "/nope")(s.T().Context())
	assert.ErrorContains(s.T(), err, "nope")
}

func (s *ProbesSuite) TestDirProbeFailsOnAFile() {
	// A blob store root that has been replaced by a file is not a working
	// store, and Stat alone would call that healthy.
	f := s.T().TempDir() + "/file"
	assert.NilError(s.T(), os.WriteFile(f, []byte("x"), 0o600))
	err := healthz.DirProbe(f)(s.T().Context())
	assert.ErrorContains(s.T(), err, "not a directory")
}
```

Добавить `"os"` в импорты.

- [ ] **Step 2: Прогнать и убедиться, что падает**

```bash
cd backend/pkg && go test ./healthz/ -run TestProbesSuite -v
```

Ожидается: `undefined: healthz.DirProbe`.

- [ ] **Step 3: Написать пробы**

Создать `backend/pkg/healthz/probes.go`:

```go
package healthz

import (
	"context"
	"fmt"
	"os"

	"google.golang.org/grpc"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// GRPCProbe reports whether the peer behind conn answers grpc_health_v1 with
// SERVING. Used by the gateway to fan its /readyz out across its backends.
func GRPCProbe(conn grpc.ClientConnInterface) Probe {
	return func(ctx context.Context) error {
		resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
		if err != nil {
			return err
		}
		if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
			return fmt.Errorf("healthz: peer reports %s", resp.GetStatus())
		}
		return nil
	}
}

// DirProbe reports whether path exists and is a directory. A blob store root
// replaced by a file is not a working store, so IsDir is checked rather than
// existence alone.
func DirProbe(path string) Probe {
	return func(context.Context) error {
		fi, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !fi.IsDir() {
			return fmt.Errorf("healthz: %s is not a directory", path)
		}
		return nil
	}
}
```

- [ ] **Step 4: Прогнать тест**

```bash
cd backend/pkg && go test ./healthz/ -run TestProbesSuite -race -v
```

Ожидается: PASS.

- [ ] **Step 5: Открыть соединение у восьми клиентов шлюза**

`catalog.Client`, `content.Client`, `auth.Client`, `twofa.Client`,
`passkey.Client`, `mesh.Client`, `upload.Client`, `audit.Client` держат
`conn *grpc.ClientConn` **неэкспортированным** полем — снаружи до него не
добраться, и без этого шага следующий не скомпилируется.

Каждому добавить в его `client.go`:

```go
// Conn exposes the underlying connection so the gateway can register a
// readiness probe against this backend. It is not for making calls — the
// typed methods on Client are.
func (c *Client) Conn() grpc.ClientConnInterface { return c.conn }
```

Возвращается **интерфейс**, а не `*grpc.ClientConn`: так снаружи нельзя
случайно закрыть чужое соединение или переиспользовать его для собственного
стаба в обход типизированных методов.

- [ ] **Step 6: Подключить восемь проб в шлюзе**

В `backend/services/gateway-service/internal/bootstrap/transport.go` заменить

```go
	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	hz.MarkReady()
```

на

```go
	// Eight named probes, evaluated concurrently under one 2s deadline — the
	// shape healthz was written for. MarkReady on its own reported ok with an
	// empty checks map from the process's first millisecond.
	hz := healthz.New(healthz.Config{Service: "gateway-service"})
	for name, conn := range backends {
		hz.Register(name, healthz.GRPCProbe(conn))
	}
	hz.MarkReady()
```

`backends` — новый параметр `InitMux`: `map[string]grpc.ClientConnInterface` с ключами `catalog`, `content`, `auth`, `twofa`, `passkey`, `mesh`, `upload`, `audit`. Собирается в `RunServe`, где все восемь клиентов уже есть под именами `cat`, `con`, `authClient`, `twofaClient`, `passkeyClient`, `m`, `up`, `auditClient`:

```go
	backends := map[string]grpc.ClientConnInterface{
		"catalog": cat.Conn(),
		"content": con.Conn(),
		"auth":    authClient.Conn(),
		"twofa":   twofaClient.Conn(),
		"passkey": passkeyClient.Conn(),
		"mesh":    m.Conn(),
		"upload":  up.Conn(),
		"audit":   auditClient.Conn(),
	}
```

**Если `InitMux` после этого перевалит за 200 строк** — вынести сборку карты и регистрацию проб в отдельный файл `backend/services/gateway-service/internal/bootstrap/readiness.go` с функцией `registerBackendProbes(hz *healthz.Handler, backends map[string]grpc.ClientConnInterface)`.

- [ ] **Step 7: Подключить пробу в asset**

В `backend/services/asset-service/internal/bootstrap/transport.go`:

```go
	hz := healthz.New(healthz.Config{Service: "asset-service"})
	hz.Register("blobdir", healthz.DirProbe(blobDir))
	hz.MarkReady()
```

`blobDir` пробрасывается в `InitMux` из конфигурации (`ASSET_BLOB_DIR`).

- [ ] **Step 8: Проверить на живом стенде**

```bash
make -C backend compose-up && sleep 20
curl -s localhost:8080/readyz | python3 -m json.tool
```

Ожидается: `"status": "ok"` и **восемь** записей в `checks`, каждая `"ok"`.

```bash
docker stop andrey-catalog-1
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/readyz
curl -s localhost:8080/readyz | python3 -m json.tool
docker start andrey-catalog-1
```

Ожидается: `503`, `"status": "degraded"`, и в `checks` ровно `catalog` с текстом ошибки, остальные семь — `ok`.

- [ ] **Step 9: Коммит**

```bash
make -C backend check
git add backend/pkg/healthz backend/services/gateway-service backend/services/asset-service
git commit -m "feat(gateway,asset): /readyz checks something

healthz was built for named concurrent probes and had none registered: both
services called MarkReady in the constructor, so /readyz answered ok with an
empty checks map from the first millisecond. Polling that would have returned
a false ok, which is why the probes come before the poller."
```

---

## Task 4: Retry-политика для всех gRPC-клиентов

**Files:**
- Modify: `backend/pkg/grpcutil/client.go`
- Test: `backend/pkg/grpcutil/client_test.go`

**Interfaces:**
- Consumes: ничего.
- Produces: поведение `grpcutil.Dial` — сигнатура не меняется.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/pkg/grpcutil/client_test.go`:

```go
package grpcutil_test

import (
	"context"
	"net"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type DialSuite struct{ suite.Suite }

func TestDialSuite(t *testing.T) { suite.Run(t, new(DialSuite)) }

// serveCountingHealth starts a bufconn gRPC server whose interceptor fails the
// first failures attempts with the given code and succeeds afterwards.
func (s *DialSuite) serveCountingHealth(failures int32, code codes.Code) (*grpc.ClientConn, *atomic.Int32) {
	var attempts atomic.Int32
	lis := bufconn.Listen(1024 * 1024)
	srv := grpc.NewServer(grpc.UnaryInterceptor(
		func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
			if attempts.Add(1) <= failures {
				return nil, status.Error(code, "not yet")
			}
			return h(ctx, req)
		},
	))
	healthpb.RegisterHealthServer(srv, health.NewServer())
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	conn, err := grpcutil.Dial("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}))
	assert.NilError(s.T(), err)
	s.T().Cleanup(func() { _ = conn.Close() })
	return conn, &attempts
}

func (s *DialSuite) TestRetriesUnavailable() {
	conn, attempts := s.serveCountingHealth(2, codes.Unavailable)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), int32(3), attempts.Load())
}

func (s *DialSuite) TestDoesNotRetryDeadlineExceeded() {
	// DEADLINE_EXCEEDED may mean the handler is still running, so a retry
	// would be a second execution. It must stay out of the retryable set.
	conn, attempts := s.serveCountingHealth(1, codes.DeadlineExceeded)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.Assert(s.T(), err != nil)
	assert.Equal(s.T(), int32(1), attempts.Load())
}

func (s *DialSuite) TestStopsAtMaxAttempts() {
	conn, attempts := s.serveCountingHealth(10, codes.Unavailable)

	_, err := healthpb.NewHealthClient(conn).Check(s.T().Context(), &healthpb.HealthCheckRequest{})
	assert.Assert(s.T(), err != nil)
	assert.Equal(s.T(), int32(3), attempts.Load())
}
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

```bash
cd backend/pkg && go test ./grpcutil/ -run TestDialSuite -v
```

Ожидается: `TestRetriesUnavailable` падает с `attempts = 1` — повторов нет.

- [ ] **Step 3: Добавить политику**

В `backend/pkg/grpcutil/client.go` добавить константу и опцию:

```go
// retryServiceConfig applies to every method ("name":[{}]) on every client
// built by Dial.
//
// UNAVAILABLE and nothing else. gRPC does not retry an RPC once response
// headers have arrived, so a call that reached a handler and returned anything
// is never repeated — which is what makes this safe for mutations.
// DEADLINE_EXCEEDED is deliberately absent: it can mean the handler is still
// running, and a retry would be a second execution.
//
// retryThrottling stops a struggling backend from being hit with three times
// the traffic at the moment it is least able to take it.
const retryServiceConfig = `{
  "methodConfig": [{
    "name": [{}],
    "retryPolicy": {
      "MaxAttempts": 3,
      "InitialBackoff": "0.1s",
      "MaxBackoff": "1s",
      "BackoffMultiplier": 2,
      "RetryableStatusCodes": ["UNAVAILABLE"]
    }
  }],
  "retryThrottling": { "maxTokens": 10, "tokenRatio": 0.1 }
}`
```

и в список `opts` в `Dial`, перед `grpc.WithDefaultCallOptions`:

```go
		grpc.WithDefaultServiceConfig(retryServiceConfig),
```

- [ ] **Step 4: Прогнать тесты**

```bash
cd backend/pkg && go test ./grpcutil/ -race -v
```

Ожидается: PASS, все три теста `DialSuite`.

**Если `TestRetriesUnavailable` даёт `attempts = 1`** — политика не применилась. Причина почти всегда одна: невалидный JSON. `grpc.NewClient` в этом случае возвращает ошибку, поэтому `assert.NilError` на `Dial` упадёт раньше — если он прошёл, JSON разобран.

- [ ] **Step 5: Коммит**

```bash
make -C backend check
git add backend/pkg/grpcutil/client.go backend/pkg/grpcutil/client_test.go
git commit -m "feat(pkg): retry UNAVAILABLE on every gRPC client

Eight clients get this from one place because Dial is the only place a gRPC
connection is constructed in this codebase. Mutations are safe by
construction: gRPC does not retry once response headers have arrived, so a
call that reached a handler is never repeated."
```

---

## Task 5: Ключи Redis переименовываются в `andrey:`

**Files:**
- Modify: `backend/services/mesh-service/internal/storage/redis.go:16,18`

**Interfaces:**
- Consumes: ничего.
- Produces: константы `storage.JobsStream = "andrey:mesh:jobs"`, `jobKeyPrefix = "andrey:mesh:job:"`.

- [ ] **Step 1: Найти все вхождения**

```bash
cd backend && grep -rn "rosneft:" --include="*.go" . | grep -v "github.com/vbncursed"
```

Ожидается ровно две строки — `redis.go:16` и `redis.go:18`. Больше — переименовать и их; меньше — остановиться и разобраться, файл уже правили.

- [ ] **Step 2: Переименовать**

В `backend/services/mesh-service/internal/storage/redis.go`:

```go
	JobsStream    = "andrey:mesh:jobs"
	ConsumerGroup = "mesh-workers"
	jobKeyPrefix  = "andrey:mesh:job:"
```

- [ ] **Step 3: Убедиться, что не осталось**

```bash
cd backend && grep -rn "rosneft:" --include="*.go" . | grep -v "github.com/vbncursed"
```

Ожидается: пусто.

```bash
cd backend && go test ./services/mesh-service/... -race
```

Ожидается: PASS. Тесты, в которых имя стрима зашито строкой, здесь и всплывут.

- [ ] **Step 4: Сверить имена в шаге выкатки**

Раздел «Выкатка на прод» ниже удаляет осиротевшие ключи по шаблону
`rosneft:mesh:*`. Сверить, что шаблон покрывает **обе** переименованные
константы — и стрим, и префикс ключей задач. Пропущенный префикс оставит
десятки ключей `rosneft:mesh:job:<id>` висеть в Redis навсегда: у них нет TTL.

```bash
docker exec andrey-redis-1 redis-cli --scan --pattern 'rosneft:*' | head
```

На локальном стенде после пересборки ожидается пусто (локальный Redis
пересоздаётся); на проде этот вывод будет непустым до шага выкатки.

- [ ] **Step 5: Коммит**

```bash
make -C backend check
git add backend/services/mesh-service/internal/storage/redis.go
git commit -m "refactor(mesh): name Redis keys after the product, not the repository

The stream and the job key prefix were the last two runtime strings carrying
the repository name; the cookie, the database, the volume and the containers
are all andrey. Renaming abandons the existing stream — safe here because the
reconciler re-queues anything without LOD0 within five minutes, but the old
keys must be deleted by hand at deploy."
```

---

## Task 6: Защёлка in-flight в reconciler

**Files:**
- Create: `backend/services/mesh-service/internal/storage/lock_target.go`
- Modify: `backend/services/mesh-service/internal/service/mesh.go` (интерфейс `Queue`)
- Modify: `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go`
- Modify: `backend/services/mesh-service/internal/service/process_job.go`
- Test: `backend/services/mesh-service/internal/service/reconcile_missing_artifacts_test.go`

**Interfaces:**
- Consumes: `storage.JobsStream` из Task 5 (только как соседняя константа, прямой зависимости нет).
- Produces:
  - `Queue.TryLockTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) (bool, error)`
  - `Queue.UnlockTarget(ctx context.Context, kind domain.Kind, slug string) error`
  - `service.ReconcileLockTTL = 30 * time.Minute`

- [ ] **Step 1: Расширить интерфейс `Queue`**

В `backend/services/mesh-service/internal/service/mesh.go`:

```go
// Queue is the persistence + queue contract — both API and worker use it.
type Queue interface {
	SaveJob(ctx context.Context, j domain.Job) error
	GetJob(ctx context.Context, id string) (domain.Job, error)
	EnqueueJob(ctx context.Context, jobID string) error

	// TryLockTarget claims a target for the reconciler. Reports false when
	// another attempt already holds it. The lock is what stops the reconciler
	// re-queueing an entity whose conversion is still running: HasLOD0 only
	// turns true at the very end of processing, so a conversion longer than
	// the tick interval would otherwise be queued again on every tick.
	TryLockTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) (bool, error)

	// UnlockTarget releases the claim. Failing to call it is not fatal — the
	// TTL expires — but it delays the next legitimate reconcile.
	UnlockTarget(ctx context.Context, kind domain.Kind, slug string) error
}
```

Добавить импорт `"time"`.

- [ ] **Step 2: Перегенерировать моки**

```bash
cd backend/services/mesh-service && go generate ./internal/service/...
```

Ожидается: `internal/service/mocks/queue_mock.go` содержит `TryLockTargetMock` и `UnlockTargetMock`.

- [ ] **Step 3: Написать падающие тесты**

Дописать в `backend/services/mesh-service/internal/service/reconcile_missing_artifacts_test.go`:

```go
func (s *ReconcileSuite) TestSkipsTargetAlreadyInFlight() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(false, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 0, n)
	// SaveJob is not configured on the mock: the controller fails the test if
	// the reconciler reaches it, which is exactly the regression we guard.
}

func (s *ReconcileSuite) TestQueuesTargetWhenLockIsFree() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(nil)
	s.queue.EnqueueJobMock.Return(nil)
	s.queue.GetJobMock.Return(domain.Job{ID: "j1"}, nil)

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), 1, n)
}

func (s *ReconcileSuite) TestReleasesLockWhenSubmitFails() {
	s.catalog.ListTargetsMock.Return([]domain.ConversionTarget{
		{Kind: domain.KindTerritory, Slug: "t1"},
	}, nil)
	s.catalog.HasLOD0Mock.Return(false, nil)
	s.queue.TryLockTargetMock.Return(true, nil)
	s.queue.SaveJobMock.Return(errors.New("redis down"))
	s.queue.UnlockTargetMock.Return(nil)

	_, err := s.svc.ReconcileMissingArtifacts(s.T().Context())

	assert.ErrorContains(s.T(), err, "redis down")
	// Without the release, a failed submit would block this target for the
	// full 30-minute TTL — the reconciler's whole job is to retry.
}
```

Если файла ещё нет — создать его по образцу соседних `*_test.go` в этом пакете: `suite.Suite`, `SetupTest` с `minimock.NewController(s.T())`, поля `s.queue`, `s.catalog`, `s.svc`.

- [ ] **Step 4: Прогнать и убедиться, что падает**

```bash
cd backend/services/mesh-service && go test ./internal/service/ -run TestReconcileSuite -v
```

Ожидается: `TestSkipsTargetAlreadyInFlight` падает — reconciler дошёл до `SaveJob`, минимок ругается на незаданный ожидатель.

- [ ] **Step 5: Реализовать защёлку в reconciler**

В `backend/services/mesh-service/internal/service/reconcile_missing_artifacts.go` заменить тело цикла:

```go
// ReconcileLockTTL bounds how long a claimed target stays claimed if the
// worker dies between claiming it and finishing. Longer than the longest
// realistic conversion, shorter than a working day.
const ReconcileLockTTL = 30 * time.Minute

	for _, t := range targets {
		if err := ctx.Err(); err != nil {
			return queued, err
		}
		has, err := m.catalog.HasLOD0(ctx, t.Kind, t.Slug)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: check %s/%s: %w", t.Kind, t.Slug, err)
		}
		if has {
			continue
		}
		// HasLOD0 stays false for the entire conversion — the artifact is
		// published last — so without this claim a conversion longer than the
		// tick interval is queued again on every tick, and with two workers
		// the duplicate runs concurrently against the same territory.
		locked, err := m.queue.TryLockTarget(ctx, t.Kind, t.Slug, ReconcileLockTTL)
		if err != nil {
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: lock %s/%s: %w", t.Kind, t.Slug, err)
		}
		if !locked {
			continue
		}
		if _, err := m.SubmitConversion(ctx, t.Kind, t.Slug); err != nil {
			// Release rather than wait out the TTL: retrying is this loop's
			// entire purpose.
			_ = m.queue.UnlockTarget(ctx, t.Kind, t.Slug)
			return queued, fmt.Errorf("service.ReconcileMissingArtifacts: submit %s/%s: %w", t.Kind, t.Slug, err)
		}
		slog.InfoContext(ctx, "reconcile: queued conversion", "kind", t.Kind, "slug", t.Slug)
		queued++
	}
```

Добавить импорт `"time"`.

- [ ] **Step 6: Снимать защёлку после обработки**

В `backend/services/mesh-service/internal/service/process_job.go`, после успешной публикации артефактов и до возврата:

```go
	// Release the reconciler's claim. A user-initiated conversion holds no
	// claim, so this is a no-op for that path.
	if err := m.queue.UnlockTarget(ctx, job.Kind, job.Slug); err != nil {
		slog.WarnContext(ctx, "process: unlock target failed", "kind", job.Kind, "slug", job.Slug, "err", err)
	}
```

Ошибка снятия логируется, а не возвращается: артефакты уже опубликованы, ронять из-за этого успешную конверсию нельзя — TTL всё равно освободит ключ.

- [ ] **Step 7: Прогнать тесты**

```bash
cd backend/services/mesh-service && go test ./... -race -shuffle=on
```

Ожидается: PASS.

- [ ] **Step 8: Реализовать защёлку на Redis**

Создать `backend/services/mesh-service/internal/storage/lock_target.go`:

```go
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// lockKey names the reconciler's claim on one conversion target.
func lockKey(kind domain.Kind, slug string) string {
	return fmt.Sprintf("andrey:mesh:inflight:%s:%s", kind, slug)
}

// TryLockTarget claims a target with SET NX EX. Reports false when the key
// already exists, i.e. another reconcile pass or another worker holds it.
func (r *Redis) TryLockTarget(ctx context.Context, kind domain.Kind, slug string, ttl time.Duration) (bool, error) {
	ok, err := r.client.SetNX(ctx, lockKey(kind, slug), "1", ttl).Result()
	if err != nil {
		return false, fmt.Errorf("storage.TryLockTarget: setnx: %w", err)
	}
	return ok, nil
}

// UnlockTarget releases the claim. Deleting a key that is not there is not an
// error: a user-initiated conversion never took one.
func (r *Redis) UnlockTarget(ctx context.Context, kind domain.Kind, slug string) error {
	if err := r.client.Del(ctx, lockKey(kind, slug)).Err(); err != nil {
		return fmt.Errorf("storage.UnlockTarget: del: %w", err)
	}
	return nil
}
```

- [ ] **Step 9: Проверить на живом стенде**

```bash
make -C backend compose-up && sleep 30
docker exec andrey-redis-1 redis-cli KEYS 'andrey:mesh:inflight:*'
```

Затем поставить конверсию через UI или API и во время неё:

```bash
docker exec andrey-redis-1 redis-cli KEYS 'andrey:mesh:inflight:*'
docker exec andrey-redis-1 redis-cli TTL andrey:mesh:inflight:KIND_TERRITORY:<slug>
```

Ожидается: ключ есть, TTL близок к 1800 и убывает; после завершения конверсии ключа нет.

- [ ] **Step 10: Коммит**

```bash
make -C backend check
git add backend/services/mesh-service
git commit -m "fix(mesh): stop the reconciler re-queueing a running conversion

HasLOD0 only turns true when the artifact is published, at the very end, so a
conversion longer than the five-minute tick was queued again on every tick.
One worker wasted CPU on it; two workers would have run the duplicate
concurrently against the same territory, including its placement rescale."
```

---

## Task 7: Имя воркера — hostname

**Files:**
- Modify: `backend/services/mesh-service/internal/config/config.go`
- Test: `backend/services/mesh-service/internal/config/config_test.go`

**Interfaces:**
- Consumes: ничего.
- Produces: `config.Config.WorkerName` по умолчанию равен hostname процесса.

- [ ] **Step 1: Написать падающий тест**

Дописать в `backend/services/mesh-service/internal/config/config_test.go` (создать по образцу соседних, если файла нет):

```go
func (s *ConfigSuite) TestWorkerNameDefaultsToHostname() {
	host, err := os.Hostname()
	assert.NilError(s.T(), err)

	got := config.DefaultWorkerName()

	assert.Equal(s.T(), host, got)
	// Two containers sharing one consumer name are one consumer to Redis, and
	// XAUTOCLAIM can no longer tell which of them died.
	assert.Assert(s.T(), got != "mesh-worker-1")
}
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

```bash
cd backend/services/mesh-service && go test ./internal/config/ -v
```

Ожидается: `undefined: config.DefaultWorkerName`.

- [ ] **Step 3: Реализовать**

В `backend/services/mesh-service/internal/config/config.go`:

```go
// DefaultWorkerName is the process hostname, which under Compose is the
// container id and is therefore unique per replica.
//
// Redis Streams treats one consumer name as one consumer: two containers
// sharing a name share a pending-entries list, and XAUTOCLAIM can no longer
// tell which of them died. Falling back to a fixed string would reintroduce
// exactly that, so an unavailable hostname is an error, not a default.
func DefaultWorkerName() string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		return ""
	}
	return host
}
```

и в объявлении флага заменить зашитое значение:

```go
	flags.String("worker-name", DefaultWorkerName(), "consumer name in the Redis Streams group")
```

В `Validate()` добавить:

```go
	if c.WorkerName == "" {
		return errors.New("config: worker-name is empty and the hostname is unavailable")
	}
```

Пустое имя отвергается, а не подменяется константой: константа вернула бы ровно ту проблему, ради которой это меняется.

- [ ] **Step 4: Прогнать тест**

```bash
cd backend/services/mesh-service && go test ./internal/config/ -race -v
```

Ожидается: PASS.

- [ ] **Step 5: Убрать зашитое имя из compose**

В `docker-compose.yml`, сервис `mesh-worker`, удалить строку:

```yaml
      MESH_WORKER_NAME: "mesh-worker-1"
```

**Без этого шага правка не действует ни на что:** переменная окружения перекрывает значение флага по умолчанию, и оба контейнера снова назовутся одинаково.

- [ ] **Step 6: Коммит**

```bash
make -C backend check
git add backend/services/mesh-service docker-compose.yml
git commit -m "fix(mesh): derive the consumer name from the hostname

MESH_WORKER_NAME was pinned to mesh-worker-1 in compose, so two replicas would
have registered as one consumer: a shared pending-entries list, and no way for
XAUTOCLAIM to tell which container died. The compose line has to go too — an
env var overrides the flag default."
```

---

## Task 8: Подкоманда `healthcheck` у каждого бинаря

**Files:**
- Create: `backend/pkg/grpcutil/healthcheck_cmd.go`
- Test: `backend/pkg/grpcutil/healthcheck_cmd_test.go`
- Modify: `backend/services/{catalog,content,audit,auth,twofa,passkey,upload}-service/cmd/*/main.go`
- Modify: `backend/services/mesh-service/cmd/mesh-api/main.go`
- Modify: `backend/services/gateway-service/cmd/gateway/main.go`
- Modify: `backend/services/asset-service/cmd/asset/main.go`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `grpcutil.CheckHealth(ctx context.Context, target string) error`
  - `grpcutil.HealthcheckCmd(addr func(*cobra.Command) (string, error)) *cobra.Command`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/pkg/grpcutil/healthcheck_cmd_test.go`:

```go
package grpcutil_test

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/grpcutil"
)

type HealthcheckSuite struct{ suite.Suite }

func TestHealthcheckSuite(t *testing.T) { suite.Run(t, new(HealthcheckSuite)) }

func (s *HealthcheckSuite) TestPassesAgainstAServingServer() {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, h)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	assert.NilError(s.T(), grpcutil.CheckHealth(s.T().Context(), lis.Addr().String()))
}

func (s *HealthcheckSuite) TestFailsAgainstNotServing() {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	assert.NilError(s.T(), err)
	srv := grpc.NewServer()
	h := health.NewServer()
	h.SetServingStatus("", healthpb.HealthCheckResponse_NOT_SERVING)
	healthpb.RegisterHealthServer(srv, h)
	go func() { _ = srv.Serve(lis) }()
	s.T().Cleanup(srv.Stop)

	assert.ErrorContains(s.T(), grpcutil.CheckHealth(s.T().Context(), lis.Addr().String()), "NOT_SERVING")
}

func (s *HealthcheckSuite) TestFailsAgainstNothing() {
	assert.Assert(s.T(), grpcutil.CheckHealth(s.T().Context(), "127.0.0.1:1") != nil)
}
```

Добавить `"net"` в импорты.

- [ ] **Step 2: Прогнать и убедиться, что падает**

```bash
cd backend/pkg && go test ./grpcutil/ -run TestHealthcheckSuite -v
```

Ожидается: `undefined: grpcutil.CheckHealth`.

- [ ] **Step 3: Реализовать**

Создать `backend/pkg/grpcutil/healthcheck_cmd.go`:

```go
package grpcutil

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// healthcheckTimeout bounds the whole probe, dial included.
const healthcheckTimeout = 3 * time.Second

// CheckHealth dials target and reports whether it answers grpc_health_v1 with
// SERVING for the unnamed service.
//
// The connection is built with a bare grpc.NewClient rather than Dial: the
// retry policy would turn one failing probe into three, and a health check
// that retries is a health check that lies about how quickly it noticed.
func CheckHealth(ctx context.Context, target string) error {
	conn, err := newBareClient(target)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()

	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		return fmt.Errorf("grpcutil.CheckHealth %q: %w", target, err)
	}
	if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		return fmt.Errorf("grpcutil.CheckHealth %q: %s", target, resp.GetStatus())
	}
	return nil
}

// HealthcheckCmd builds the `healthcheck` subcommand. addr resolves the
// service's own listen address from the command's flags and config, so each
// service keeps ownership of its own configuration loading.
func HealthcheckCmd(addr func(*cobra.Command) (string, error)) *cobra.Command {
	return &cobra.Command{
		Use:   "healthcheck",
		Short: "Probe this service's own health endpoint and exit 0 or 1",
		Long: "Used as the container healthcheck. The images are distroless — " +
			"no shell, no curl, no wget — so the service binary is the only " +
			"thing that can run inside them.",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			target, err := addr(cmd)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(cmd.Context(), healthcheckTimeout)
			defer cancel()
			return CheckHealth(ctx, target)
		},
	}
}
```

`newBareClient` — маленький хелпер в том же файле:

```go
func newBareClient(target string) (*grpc.ClientConn, error) {
	conn, err := grpc.NewClient(target, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("grpcutil.CheckHealth: dial %q: %w", target, err)
	}
	return conn, nil
}
```

Добавить импорты `"google.golang.org/grpc"` и `"google.golang.org/grpc/credentials/insecure"`.

- [ ] **Step 4: Добавить cobra в модуль pkg**

```bash
cd backend/pkg && GOWORK=off go get github.com/spf13/cobra && GOWORK=off go mod tidy
```

**`GOWORK=off` обязателен.** В режиме воркспейса `tidy` паркует контрольные суммы в `go.work.sum`, а Docker собирает по одному модулю и падает на неполном `go.sum`. Ровно это ловит `make tidy-check`.

- [ ] **Step 5: Прогнать тесты**

```bash
cd backend/pkg && go test ./grpcutil/ -race -v
```

Ожидается: PASS.

- [ ] **Step 6: Подключить в восьми gRPC-сервисах**

В каждом `main.go` (catalog, content, audit, auth, twofa, passkey, upload, mesh-api) добавить в `cmd.AddCommand(...)`:

```go
		grpcutil.HealthcheckCmd(func(c *cobra.Command) (string, error) {
			cfg, err := loadCfg(c)
			if err != nil {
				return "", err
			}
			return "localhost" + cfg.GRPCAddr, nil
		}),
```

`"localhost" + cfg.GRPCAddr` — потому что адрес хранится в форме `":9001"`, а клиенту нужен хост.

**У mesh-worker подкоманды нет:** он не слушает ни gRPC, ни HTTP. Его состояние читается гейджем `service_ready` из Task 2, и в compose у него healthcheck не появится.

- [ ] **Step 7: Подключить в gateway и asset**

Эти два — HTTP, и общий хелпер им не подходит. В каждом `main.go` добавить локальную подкоманду:

```go
func newHealthcheckCmd() *cobra.Command {
	return &cobra.Command{
		Use:          "healthcheck",
		Short:        "Probe this service's own /readyz and exit 0 or 1",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadCfg(cmd)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(cmd.Context(), 3*time.Second)
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost"+cfg.HTTPAddr+"/readyz", nil)
			if err != nil {
				return err
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				return fmt.Errorf("readyz: %s", resp.Status)
			}
			return nil
		},
	}
}
```

- [ ] **Step 8: Проверить на живом стенде**

```bash
make -C backend compose-up && sleep 20
docker exec andrey-catalog-1 /catalog healthcheck && echo OK
docker exec andrey-gateway-1 /gateway healthcheck && echo OK
```

Ожидается: `OK` дважды, код выхода 0.

**Путь до бинаря сверить с Dockerfile каждого сервиса** — он может быть `/catalog`, `/app/catalog` или иным. Ошибиться здесь легко, и в compose это проявится как вечный `unhealthy`.

```bash
docker pause andrey-postgres-1 && sleep 15
docker exec andrey-catalog-1 /catalog healthcheck; echo "exit=$?"
docker unpause andrey-postgres-1
```

Ожидается: `exit=1` и `NOT_SERVING` в выводе — то есть подкоманда видит тикер из Task 2.

- [ ] **Step 9: Коммит**

```bash
make -C backend check
git add backend/pkg backend/services
git commit -m "feat: healthcheck subcommand on every service binary

The images are distroless: no shell, no curl, no wget. The service binary is
the only thing that can run inside them, so the container healthcheck has to
be the binary itself."
```

---

# ФАЗА 2 — ops

Go здесь не собирается. Каждая задача заканчивается проверкой на локальном compose, а выкатка на прод — общим разделом в конце.

## Task 9: compose — healthcheck, порядок загрузки, две реплики, привязка порта

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: подкоманду `healthcheck` из Task 8, `DefaultWorkerName` из Task 7.
- Produces: ничего для Go-кода.

- [ ] **Step 1: Проверить, открыт ли порт шлюза наружу**

С машины **вне** прод-хоста:

```bash
curl -m 5 -s -o /dev/null -w '%{http_code}\n' http://85.192.26.113:8080/healthz
```

- `200` — шлюз доступен в обход nginx, а с ним в обход TLS и будущих лимитов. Шаг 2 обязателен.
- таймаут или `000` — файрвол закрывает порт, шаг 2 всё равно делается: полагаться на правило файрвола, которого нет в репозитории, — это то же самое, что полагаться на конфигурацию nginx, которой в репозитории тоже не было.

- [ ] **Step 2: Сузить публикацию**

В `docker-compose.yml`, сервис `gateway`:

```yaml
    ports:
      # Localhost only: nginx terminates TLS and applies limit_req in front.
      # Publishing on 0.0.0.0 let anything reach the gateway around both.
      - "127.0.0.1:8080:8080"
```

**Локальная разработка не ломается:** SPA ходит через Vite-прокси на localhost, и он тоже локальный.

- [ ] **Step 3: Добавить healthcheck десяти сервисам**

Каждому из catalog, content, audit, auth, twofa, passkey, upload, mesh-api, gateway, asset:

```yaml
    healthcheck:
      test: ["CMD", "/catalog", "healthcheck"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
```

- Путь до бинаря — свой у каждого сервиса, сверять с его `Dockerfile`.
- **`CMD`, не `CMD-SHELL`.** В distroless нет шелла, и `CMD-SHELL` даст вечный `unhealthy` без внятного сообщения.
- `start_period: 30s` — окно миграций у catalog, content и audit.
- **mesh-worker healthcheck не получает:** он ничего не слушает.

- [ ] **Step 4: Заменить `service_started` на `service_healthy` там, где порядок важен**

```yaml
  gateway:
    depends_on:
      catalog: { condition: service_healthy }
      auth:    { condition: service_healthy }
      content: { condition: service_started }
      twofa:   { condition: service_started }
      passkey: { condition: service_started }
      mesh-api: { condition: service_started }
      upload:  { condition: service_started }
      asset:   { condition: service_started }
      audit:   { condition: service_started }
```

Только catalog и auth: без них шлюз бесполезен. Остальным достаточно retry-политики из Task 4 — она и заведена, чтобы порядок загрузки перестал быть вопросом.

- [ ] **Step 5: Две реплики воркера**

```yaml
  mesh-worker:
    deploy:
      replicas: 2
```

`container_name` у воркера не задан, порты не публикуются — конфликта нет. `docker compose up` уважает `deploy.replicas` и вне Swarm.

- [ ] **Step 6: Проверить на локальном стенде**

```bash
docker compose down && make -C backend compose-up
sleep 45
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
```

Ожидается: десять сервисов в состоянии `(healthy)`, два контейнера `andrey-mesh-worker-1` и `andrey-mesh-worker-2` в состоянии `Up` (без healthcheck).

```bash
docker exec andrey-redis-1 redis-cli XINFO CONSUMERS andrey:mesh:jobs mesh-workers
```

Ожидается: два потребителя с **разными** именами.

- [ ] **Step 7: Коммит**

```bash
git add docker-compose.yml
git commit -m "chore(compose): healthchecks, ordered boot for two deps, two workers

The gateway published 8080 on every interface, which let anything reach it
around nginx — and therefore around TLS and around the rate limit that lands
next. CMD rather than CMD-SHELL: the images are distroless."
```

---

## Task 10: Правило готовности, Alertmanager и Telegram

**Files:**
- Modify: `ops/prometheus/rules.yml`
- Modify: `ops/prometheus/prometheus.yml`
- Create: `ops/alertmanager/alertmanager.yml`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: метрику `service_ready` из Task 1–2.
- Produces: ничего для Go-кода.

- [ ] **Step 1: Добавить правило**

В `ops/prometheus/rules.yml`, в группу `andrey-core`:

```yaml
      - alert: ServiceNotReady
        expr: service_ready == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} is up but not ready"
          description: "Its dependency probe has been failing for two minutes. TargetDown cannot see this: the process is alive and /metrics answers."
```

`for: 2m`, а не `1m`: перезапуск Postgres при выкатке роняет готовность на несколько секунд, и минутного окна хватало бы на ложную тревогу при каждом деплое.

- [ ] **Step 2: Указать Prometheus, куда слать**

В `ops/prometheus/prometheus.yml`, после блока `rule_files`:

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
```

- [ ] **Step 3: Написать конфигурацию Alertmanager**

Создать `ops/alertmanager/alertmanager.yml`:

```yaml
route:
  # Group by alert and by service: eight services flapping at once should be
  # eight lines in one message, not eight messages.
  group_by: ["alertname", "service"]
  group_wait: 30s
  group_interval: 5m
  # Hourly. A firing alert that repeats every five minutes trains the reader
  # to mute the chat, which is the same as having no receiver at all.
  repeat_interval: 1h
  receiver: telegram

receivers:
  - name: telegram
    telegram_configs:
      - bot_token_file: /run/secrets/telegram_bot_token
        chat_id: 0 # overridden by the untracked compose override
        api_url: https://api.telegram.org
        parse_mode: HTML
        message: |
          <b>{{ .Status | toUpper }}</b> {{ .CommonLabels.alertname }}
          {{ range .Alerts }}{{ .Annotations.summary }}
          {{ end }}
```

**Токен читается из файла, а не из поля `bot_token`:** конфигурация отслеживается git, а токен — секрет. Файл подкладывается на прод-хосте и монтируется через неотслеживаемый override.

- [ ] **Step 4: Добавить сервис в compose**

```yaml
  alertmanager:
    restart: unless-stopped
    image: prom/alertmanager:latest
    environment:
      <<: *tz
    command:
      - --config.file=/etc/alertmanager/alertmanager.yml
      - --storage.path=/alertmanager
    volumes:
      # Mounted as a directory, not a single file: git replaces a file on
      # pull, the inode changes, and a per-file bind keeps serving the old
      # one. This trap has already fired on ops/prometheus/*.yml.
      - ./ops/alertmanager:/etc/alertmanager:ro
      - alertmanager-data:/alertmanager
    expose:
      - "9093"
```

и в конец файла:

```yaml
volumes:
  alertmanager-data:
```

**В `ops/prometheus/prometheus.yml` цель `alertmanager:9101` не добавляется:** он не Go-сервис этого стека и `/metrics` в нашем формате не отдаёт. Правило «новый сервис — строка в prometheus.yml» относится к сервисам из `SERVICES`.

- [ ] **Step 5: Прописать секреты в неотслеживаемый override (на прод-хосте)**

В `/opt/rosneft/docker-compose.override.yml`:

```yaml
services:
  alertmanager:
    volumes:
      - /root/secrets/telegram_bot_token:/run/secrets/telegram_bot_token:ro
```

и заменить `chat_id` — Alertmanager не читает переменные окружения в конфигурации, поэтому chat id либо правится в файле на хосте, либо конфигурация целиком подменяется через override. **Выбран второй путь:** в override монтируется `/root/secrets/alertmanager.yml`, собранный из репозиторного файла с подставленным chat id. В репозитории остаётся образец.

- [ ] **Step 6: Проверить доставку**

```bash
docker compose up -d --force-recreate prometheus alertmanager
docker exec andrey-prometheus-1 wget -qO- http://localhost:9090/api/v1/alertmanagers | python3 -m json.tool
```

Ожидается: `alertmanager:9093` в `activeAlertmanagers`.

```bash
docker stop andrey-content-1
# ждать до 2.5 минут
docker start andrey-content-1
```

Ожидается: сообщение в Telegram про `TargetDown` (и `ServiceNotReady`, если сервис успел отдать `service_ready 0`), затем `resolved`.

**`--force-recreate` обязателен**, иначе Prometheus продолжит держать конфигурацию, которая была на момент старта контейнера. Проверять содержимое **внутри** контейнера:

```bash
docker exec andrey-prometheus-1 cat /etc/prometheus/prometheus.yml | grep -A3 alerting
```

- [ ] **Step 7: Коммит**

```bash
git add ops/prometheus ops/alertmanager docker-compose.yml
git commit -m "feat(ops): give the eight alert rules somewhere to arrive

They have been evaluating into nothing. Adds ServiceNotReady on top, which is
the one condition TargetDown structurally cannot see: a process whose pool is
dead still answers /metrics, so up stays 1."
```

---

## Task 11: nginx под git и ограничение частоты

**Files:**
- Create: `ops/nginx/rosneft.conf`
- Create: `ops/nginx/README.md`

**Interfaces:**
- Consumes: привязку порта из Task 9.
- Produces: ничего для Go-кода.

- [ ] **Step 1: Снять текущий вхост с прод-хоста**

```bash
ssh root@85.192.26.113 'cat /etc/nginx/sites-enabled/rosneft' > ops/nginx/rosneft.conf
```

**Первым коммитом идёт снятый как есть файл, без правок.** Иначе первая же ошибка в лимитах будет неотличима от ошибки в переписанном вхосте, и разбираться придётся в двух изменениях сразу.

- [ ] **Step 2: Закоммитить снимок как есть**

```bash
git add ops/nginx/rosneft.conf
git commit -m "chore(ops): track the production nginx vhost

Nothing in the repository described it. A host rebuild lost the mime.types
patch for mjs and webmanifest once already, and the pdf.js viewer silently
stopped executing its modules for two days."
```

- [ ] **Step 3: Добавить зоны и лимиты**

В `ops/nginx/rosneft.conf`, в `http`-уровень (в Debian/Ubuntu это `/etc/nginx/nginx.conf`, поэтому зоны выносятся в отдельный файл `ops/nginx/limits.conf` для `/etc/nginx/conf.d/`):

```nginx
# ops/nginx/limits.conf → /etc/nginx/conf.d/limits.conf
#
# The gateway cannot do this itself: it deliberately refuses to rewrite
# RemoteAddr from X-Forwarded-For (see GHSA-3fxj-6jh8-hvhx), so to Go every
# request arrives from nginx and a per-IP limiter would bucket the whole
# internet into one key. Here the address is real.
limit_req_zone $binary_remote_addr zone=api:10m   rate=30r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_status 429;
```

В `server`-блоке вхоста:

```nginx
    location /api/ {
        # burst=60 nodelay: the SPA fires several requests on first paint and
        # chunked upload sends frequent PATCHes. A tighter burst would throttle
        # normal use, and a rate limit that fires on normal use gets removed.
        limit_req zone=api burst=60 nodelay;
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE and chunked upload both hold a connection open for minutes.
        proxy_read_timeout 30m;
        proxy_buffering off;
    }

    location ~ ^/api/auth/(login|2fa|passkey) {
        # Five a minute per address. auth-service already locks an account
        # after five failed logins, but that counts per user; this counts per
        # address and it fires before the request reaches Go at all.
        limit_req zone=login burst=5;
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

**Порядок `location` важен:** регулярное выражение имеет приоритет над префиксом, поэтому блок логина сработает раньше общего `/api/`. Если поменять их местами в файле — ничего не изменится, но если общий блок сделать регулярным, приоритет решит порядок объявления.

- [ ] **Step 4: Записать процедуру установки**

Создать `ops/nginx/README.md`:

```markdown
# nginx на прод-хосте

Файлы здесь **не выкатываются автоматически**. Они копируются руками:

    scp ops/nginx/rosneft.conf root@85.192.26.113:/etc/nginx/sites-available/rosneft
    scp ops/nginx/limits.conf  root@85.192.26.113:/etc/nginx/conf.d/limits.conf
    ssh root@85.192.26.113 'nginx -t && systemctl reload nginx'

`nginx -t` **до** reload, всегда: битая конфигурация при reload оставляет
работать старую, но при следующем рестарте хоста nginx не поднимется.

## Правка mime.types, которой нет в этих файлах

Стоковый `/etc/nginx/mime.types` (1.24) знает `js`, но не знает `mjs` и
`webmanifest` — оба отдаются как `application/octet-stream`. Chrome строго
проверяет MIME у ES-модулей, поэтому вендоренный pdf.js 6 загружал статичный
тулбар и молча ничего не делал: `viewer.mjs` и `pdf.mjs` приходили с кодом 200
и не исполнялись.

    application/javascript  js mjs;
    application/manifest+json  webmanifest;

Резервная копия исходного файла — `/root/backups/mime.types-*.bak`.

Вендорите новый `.mjs`/`.wasm`-рантайм? Проверьте `content_type` curl'ом с
`--resolve` **прежде** чем считать, что это работает.
```

- [ ] **Step 5: Проверить лимиты снаружи**

После установки, с машины вне хоста:

```bash
for i in $(seq 1 20); do
  curl -m 5 -s -o /dev/null -w '%{http_code} ' \
    -X POST https://andrey.vbncursed.fun/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}'
done; echo
```

Ожидается: несколько `401`, затем `429` начиная примерно с шестого.

```bash
curl -m 5 -s -o /dev/null -w '%{http_code}\n' http://85.192.26.113:8080/healthz
```

Ожидается: таймаут или `000` — после Task 9 шлюз слушает только localhost.

Обычная работа SPA лимита касаться не должна: открыть территорию, подвигать плейсмент, загрузить файл — ни одного `429`.

- [ ] **Step 6: Коммит**

```bash
git add ops/nginx
git commit -m "feat(ops): rate limit in nginx, where the client IP is real

A Go limiter on the gateway would have bucketed all traffic into one key: the
gateway deliberately distrusts X-Forwarded-For, so RemoteAddr is always nginx.
The vhost is tracked now, together with the mime.types note a host rebuild
would otherwise lose again."
```

---

## Task 12: Бэкапы, вывоз и проверенное восстановление

**Files:**
- Create: `ops/backup/dump.sh`
- Create: `ops/backup/pull.sh`
- Create: `ops/backup/RESTORE.md`

**Interfaces:**
- Consumes: ничего.
- Produces: ничего для Go-кода.

- [ ] **Step 1: Замерить, прежде чем планировать объём**

```bash
ssh root@85.192.26.113 '
  docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc \
    "select count(*), pg_size_pretty(sum(pg_column_size(t.*))) from territories t"
  docker system df -v | grep -E "blob-data|audit-digest"
  docker run --rm -v andrey_blob-data:/b alpine du -sh /b
'
```

Записать фактические числа сюда, в план. Направление 04 показало, что оценка без замера ошибается в разы: там пятнадцатиминутный замер трёх файлов опроверг числа, из которых исходила спека.

- [ ] **Step 2: Написать скрипт дампа**

Создать `ops/backup/dump.sh`:

```bash
#!/usr/bin/env bash
# Daily backup, run by systemd timer on the production host.
#
# Three artifacts, deliberately separate:
#   1. the Postgres dump
#   2. the audit digests — the witness to the journal being unrewritten. It
#      lives on its own volume for a reason, and putting it inside the same
#      archive as the dump would give the two a shared fate, which is exactly
#      what the witness exists to prevent.
#   3. the source blobs, by hash. Converted artifacts are NOT copied: the
#      reconciler rebuilds them from the sources, verified live on 3 Aug when
#      the territory artifacts were deleted and came back on their own.
set -euo pipefail

DEST=${DEST:-/root/backups}
STAMP=$(date +%Y%m%d-%H%M%S)
KEEP=${KEEP:-7}
mkdir -p "$DEST"

dump="$DEST/andrey-$STAMP.sql.gz"

# PIPESTATUS, not `set -e`: a failed pg_dump still produces a valid 20-byte
# gzip, and the pipeline's exit status comes from gzip, which succeeded. This
# has bitten this project before.
docker exec andrey-postgres-1 pg_dump -U andrey -d andrey | gzip > "$dump"
if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
  echo "dump.sh: pg_dump failed" >&2
  rm -f "$dump"
  exit 1
fi

gzip -t "$dump"

# Size sanity: a dump that suddenly halves is a dump of half a database.
prev=$(ls -1t "$DEST"/andrey-*.sql.gz 2>/dev/null | sed -n 2p || true)
if [[ -n "$prev" ]]; then
  now_sz=$(stat -c%s "$dump")
  prev_sz=$(stat -c%s "$prev")
  if (( now_sz * 2 < prev_sz )); then
    echo "dump.sh: dump is less than half the previous one ($now_sz vs $prev_sz)" >&2
    exit 1
  fi
fi

# 2. Audit digests — separate archive, separate fate.
docker run --rm -v andrey_audit-digest:/d -v "$DEST":/out alpine \
  tar czf "/out/audit-digest-$STAMP.tar.gz" -C /d .

# 3. Source blobs by hash. Artifacts are rebuilt, sources are not.
docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc \
  "select source_blob_hash from territories where source_blob_hash <> ''
   union
   select source_blob_hash from models where source_blob_hash <> ''" \
  | tr -d ' ' > "$DEST/source-hashes-$STAMP.txt"

mkdir -p "$DEST/blobs"
while read -r h; do
  [[ -z "$h" ]] && continue
  sub=${h:0:2}
  docker run --rm -v andrey_blob-data:/b -v "$DEST/blobs":/out alpine \
    sh -c "test -f /b/$sub/$h && cp -n /b/$sub/$h /out/$h || true"
done < "$DEST/source-hashes-$STAMP.txt"

# Rotation.
ls -1t "$DEST"/andrey-*.sql.gz        | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$DEST"/audit-digest-*.tar.gz  | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$DEST"/source-hashes-*.txt    | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "dump.sh: ok $STAMP"
```

**Путь до блоба (`/b/$sub/$h`) сверить с реализацией шардинга** в `backend/pkg/blobstore/fs.go` — там двухсимвольный префикс, но точную форму имени файла надо прочитать, а не предположить.

- [ ] **Step 3: Прогнать вручную и проверить каждый артефакт**

```bash
ssh root@85.192.26.113 'bash -x /opt/rosneft/ops/backup/dump.sh'
ssh root@85.192.26.113 'ls -lh /root/backups | tail -20'
```

Ожидается: три свежих файла и непустой каталог `blobs/`.

Проверить, что ловушка с gzip действительно ловится:

```bash
ssh root@85.192.26.113 'printf "" | gzip > /tmp/empty.gz && gzip -t /tmp/empty.gz && echo "gzip -t passed an empty file — check the size guard instead"'
```

Пустой gzip проходит `gzip -t`. Именно поэтому в скрипте есть **и** проверка `PIPESTATUS`, **и** сверка размера: ни одна из трёх проверок по отдельности не закрывает случай.

- [ ] **Step 4: Написать тягу на рабочую машину**

Создать `ops/backup/pull.sh`:

```bash
#!/usr/bin/env bash
# Runs on the WORKSTATION, not on the host. The receiver pulls; the host does
# not push. A compromised or burned host cannot then erase the copies — under
# a push scheme it could.
set -euo pipefail

HOST=${HOST:-root@85.192.26.113}
DEST=${DEST:-$HOME/backups/andrey}
KEEP=${KEEP:-30}

mkdir -p "$DEST"
rsync -az --info=stats2 -e ssh "$HOST:/root/backups/" "$DEST/"

# Verify what arrived, on this side. A backup verified only on the machine
# that produced it is a backup verified by the thing that might be broken.
latest=$(ls -1t "$DEST"/andrey-*.sql.gz | head -1)
gzip -t "$latest"
echo "pull.sh: verified $latest"

ls -1t "$DEST"/andrey-*.sql.gz | tail -n +$((KEEP+1)) | xargs -r rm -f
```

- [ ] **Step 5: Поставить таймеры**

На прод-хосте — `/etc/systemd/system/andrey-backup.{service,timer}`, ежедневно в 04:00 по Москве.
На рабочей машине — launchd-агент или cron, ежедневно в 05:00.

Проверка:

```bash
ssh root@85.192.26.113 'systemctl list-timers andrey-backup --all'
```

Ожидается: строка с ближайшим запуском.

- [ ] **Step 6: Восстановить и убедиться, что восстановилось**

Это не документация, а шаг работы. На рабочей машине:

```bash
latest=$(ls -1t ~/backups/andrey/andrey-*.sql.gz | head -1)
docker run -d --name restore-test -e POSTGRES_PASSWORD=x -e POSTGRES_USER=andrey -e POSTGRES_DB=andrey postgres:latest
sleep 10
gunzip -c "$latest" | docker exec -i restore-test psql -U andrey -d andrey
docker exec restore-test psql -U andrey -d andrey -tAc \
  "select 'territories', count(*) from territories
   union all select 'models', count(*) from models
   union all select 'placements', count(*) from placements
   union all select 'audit_log', count(*) from audit_log
   union all select 'users', count(*) from users"
```

Сверить с боевыми:

```bash
ssh root@85.192.26.113 'docker exec andrey-postgres-1 psql -U andrey -d andrey -tAc "..."'
```

Затем прогнать проверку цепочки аудита против **вывезенного** свидетельства:

```bash
tar xzf ~/backups/andrey/audit-digest-*.tar.gz -C /tmp/digests
docker run --rm --network container:restore-test -v /tmp/digests:/d andrey-audit \
  audit verify --digest-file /d/digests.jsonl
```

Ожидается: цепочка сходится. Расхождение здесь означает либо повреждённый дамп, либо — что важнее — что журнал переписывали.

**Точная форма вызова `audit verify` сверяется с `services/audit-service/README.md`**, а не пишется по памяти.

```bash
docker rm -f restore-test
```

- [ ] **Step 7: Записать процедуру с фактическими числами**

Создать `ops/backup/RESTORE.md` — процедура из шага 6 плюс:

- дата прогона и **фактические** счётчики строк, а не «должны совпасть»;
- время, которое занял разворот;
- явно: RPO — сутки, RTO — время разворота плюс переконвертация артефактов
  (3 территории и 57 моделей заняли около часа 3 августа);
- что артефакты не копируются и почему.

Непроверенный бэкап — это предположение. Эта страница — единственное, что отличает одно от другого.

- [ ] **Step 8: Коммит**

```bash
chmod +x ops/backup/dump.sh ops/backup/pull.sh
git add ops/backup
git commit -m "feat(ops): backups that leave the host and a restore that was run

gzip -t alone is not enough: a failed pg_dump produces a valid empty gzip and
the pipeline's status comes from gzip. PIPESTATUS, gzip -t and a size guard
each catch a case the other two miss.

The receiver pulls rather than the host pushing, so a compromised host cannot
erase the copies. The audit digests travel in their own archive: sharing one
with the dump would give the witness and the thing it witnesses a shared fate."
```

---

# Выкатка на прод

Порядок, который сработал в прошлые три раза. Отклоняться от него дороже, чем кажется.

- [ ] **Шаг 1: Дамп и его проверка — до всего остального**

```bash
ssh root@85.192.26.113 '
  docker exec andrey-postgres-1 pg_dump -U andrey -d andrey | gzip > /root/backups/andrey-predeploy-$(date +%Y%m%d-%H%M%S).sql.gz
  gzip -t /root/backups/andrey-predeploy-*.sql.gz && echo VERIFIED
'
```

- [ ] **Шаг 2: Проверить и дополнить неотслеживаемый override**

`GATEWAY_CSRF_SECRET` и `GATEWAY_COOKIE_SECURE=true` обязаны там остаться. Добавляются: монтирование токена Telegram и подменённая конфигурация Alertmanager с chat id.

```bash
ssh root@85.192.26.113 'grep -c GATEWAY_CSRF_SECRET /opt/rosneft/docker-compose.override.yml'
```

Ожидается: `1`. Ноль — **остановиться**: без него шлюз не стартует, и это не деградация, а падение.

- [ ] **Шаг 3: Влить и пересобрать**

```bash
ssh root@85.192.26.113 'cd /opt/rosneft && git merge --ff-only origin/main && docker compose build'
ssh root@85.192.26.113 'for s in gateway catalog auth twofa passkey content audit mesh-api mesh-worker asset upload; do
  echo -n "$s: "; docker image inspect andrey-$s --format "{{.Created}}"; done'
```

**Сверить даты до выводов.** `docker compose build` трижды за прошлую сессию написал «Started», оставив старый образ.

- [ ] **Шаг 4: Поднять**

```bash
ssh root@85.192.26.113 'cd /opt/rosneft && docker compose up -d'
ssh root@85.192.26.113 'cd /opt/rosneft && docker compose up -d --force-recreate prometheus alertmanager'
```

Второй командой — обязательно: конфигурации Prometheus и Alertmanager монтируются, и без пересоздания контейнер держит старую.

- [ ] **Шаг 5: Удалить осиротевшие ключи Redis**

```bash
ssh root@85.192.26.113 'docker exec andrey-redis-1 redis-cli --scan --pattern "rosneft:mesh:*" | xargs -r docker exec -i andrey-redis-1 redis-cli DEL'
ssh root@85.192.26.113 'docker exec andrey-redis-1 redis-cli --scan --pattern "rosneft:*"'
```

Ожидается: второй вывод пуст. Task 5 сменил префикс, старый стрим и его consumer group остались висеть.

- [ ] **Шаг 6: Установить nginx**

```bash
scp ops/nginx/rosneft.conf root@85.192.26.113:/etc/nginx/sites-available/rosneft
scp ops/nginx/limits.conf  root@85.192.26.113:/etc/nginx/conf.d/limits.conf
ssh root@85.192.26.113 'nginx -t && systemctl reload nginx'
```

- [ ] **Шаг 7: Прогнать все семь критериев приёмки из спеки**

Каждый — командой, вывод которой записывается. Не «проверено», а вывод.

---

# Критерии приёмки

Из спеки, дословно. Проверяется **вживую на проде**: в направлениях 01, 02 и 04 ни один из четырёх дефектов не нашли тесты — их нашли код-ревью, регрессионный скрипт на живом стенде и прямой вопрос заказчика.

- [ ] **1. Retry.** `docker stop andrey-catalog-1`, запрос к `/api/territories` в окне перезапуска отвечает успехом, а не 500.
- [ ] **2. Готовность.** `docker pause andrey-postgres-1` → `service_ready{service="catalog"}` уходит в 0 в пределах 30 с, `/readyz` шлюза отдаёт 503 с именем упавшей пробы в `checks`. `unpause` возвращает обратно.
- [ ] **3. Воркеры.** `XINFO CONSUMERS andrey:mesh:jobs mesh-workers` показывает два потребителя с разными именами. Переконвертация территории при работающем reconciler'е создаёт **одну** задачу.
- [ ] **4. Лимит.** 20 запросов подряд к `/api/auth/login` снаружи дают 429 начиная примерно с шестого; обычная работа SPA лимита не касается.
- [ ] **5. Порт.** `curl http://85.192.26.113:8080/healthz` снаружи не отвечает.
- [ ] **6. Алерт.** Остановленный сервис даёт сообщение в Telegram в пределах двух с половиной минут; поднятый — `resolved`.
- [ ] **7. Бэкап.** Дамп развёрнут в одноразовый контейнер, `audit verify` сошёлся, счётчики строк совпали, числа записаны в `ops/backup/RESTORE.md`.

# После выкатки

- [ ] Обновить `docs/superpowers/continue-here.md`: состояние, что закрыто, что осталось.
- [ ] Обновить `backend/CLAUDE.md`: раздел про retry-политику в `Dial`, про `WatchReadiness` и `service_ready`, про защёлку in-flight, про подкоманду `healthcheck` и про то, что образы distroless и `CMD-SHELL` в них не работает.
- [ ] Обновить артефакт аудита: направление 07, **правкой, а не переписыванием** — снятая оценка 45% остаётся видна рядом с новой. Ожидаемая — 70–75%.

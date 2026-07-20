# Native Metrics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить четыре Grafana-iframe'а на `/admin/metrics` собственной страницей метрик в стиле сайта, читающей Prometheus напрямую, и удалить Grafana из стека.

**Architecture:** Prometheus остаётся источником данных и получает 8 правил алертов, переехавших из Grafana. Новый BFF-роут `/api/metrics/query` резолвит id панели в PromQL на сервере (клиент выражения не присылает), ходит в `/api/v1/query_range` или `/api/v1/query` и отдаёт доменные `Series[]`. Новый bounded context `metrics/` рисует панели на Recharts через один стилизованный компонент-обёртку.

**Tech Stack:** Next.js 16.2.10 (App Router, RSC), React 19.2.7, TypeScript strict, Tailwind CSS 4, Recharts 3.9.2, Prometheus, `node --test`.

## Global Constraints

- Все команды фронтенда запускаются из `frontend/`.
- Жёсткий лимит **200 строк на файл** (ESLint `max-lines`, skipBlankLines + skipComments).
- Clean Architecture / DDD: каждый файл в одном из слоёв `domain/`, `application/`, `infrastructure/`, `presentation/` внутри контекста.
- `presentation/` не импортирует `infrastructure/` и не видит DTO. Исключение: RSC-роуты в `src/app/**` могут импортировать gateway напрямую.
- Библиотека анимаций — только `motion/react`, только в `presentation/`, импорт пресетов из `@/shared/presentation/motion/`.
- Слово «Rosneft»/«Роснефть» запрещено в отображаемом тексте. Бренд — «Andrey».
- Go-код не трогаем: меняются только `ops/*.yml`, `docker-compose.yml` и `frontend/`.
- Единственный путевой алиас — `@/*` → `frontend/src/*`.
- Тесты — `node --test` без фреймворков, файлы `*.test.ts` рядом с кодом, импорт с расширением `.ts`.
- Визуальные токены сайта (взяты из существующих компонентов): карточка `rounded-xl border border-white/10 bg-black/30`, акцент `cyan-300`, вторичный текст `text-neutral-300` / `text-neutral-400`, микро-заголовки `text-[10px] uppercase tracking-[0.28em]`, ошибка `border-red-300/40 bg-red-500/15 text-red-200`.

---

### Task 1: Правила алертов в Prometheus, снос Grafana

**Files:**
- Create: `ops/prometheus/rules.yml`
- Modify: `ops/prometheus/prometheus.yml`
- Modify: `docker-compose.yml`
- Delete: `ops/grafana/` (весь каталог)

**Interfaces:**
- Consumes: ничего.
- Produces: серия `ALERTS{alertname, severity, alertstate}` в Prometheus; переменная окружения `PROMETHEUS_URL` у сервиса `frontend`.

- [ ] **Step 1: Создать файл правил**

Восемь правил перенесены из `ops/grafana/provisioning/alerting/rules.yaml` без изменения PromQL. В Grafana условие «> порога» проверял отдельный threshold-узел `C`; в Prometheus порог уже внутри `expr`, и правило горит, пока выражение возвращает непустой результат — поэтому выражения переносятся как есть.

Create `ops/prometheus/rules.yml`:

```yaml
groups:
  - name: andrey-core
    interval: 1m
    rules:
      - alert: TargetDown
        expr: up{job="services"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "A service target is down"

      - alert: HighGrpcErrorRate
        expr: sum by (service)(rate(grpc_server_handled_total{grpc_code!="OK"}[5m])) / clamp_min(sum by (service)(rate(grpc_server_handled_total[5m])),0.001) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "gRPC error rate above 5%"

      - alert: HighHttp5xxRate
        expr: sum(rate(http_requests_total{code=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])),0.001) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "HTTP 5xx rate above 5%"

      - alert: HighLatencyP99
        expr: histogram_quantile(0.99, sum by (le,grpc_service)(rate(grpc_server_handling_seconds_bucket[5m]))) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "gRPC p99 latency above 2s"

      - alert: ConversionFailures
        expr: rate(mesh_conversions_total{status="failed"}[10m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Mesh conversions are failing"

      - alert: MemoryGrowth
        expr: process_resident_memory_bytes > 1.5e9
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "A service is using over 1.5GB RSS"

      - alert: QueueBacklog
        expr: mesh_queue_depth >= 16
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Mesh worker pulling full batches for 10m (stream backlog)"

      - alert: LoginFailureSpike
        expr: rate(auth_logins_total{status="failed"}[5m]) * 60 > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Login failures above 30/min (possible brute force)"
```

- [ ] **Step 2: Подключить правила в конфиге Prometheus**

Modify `ops/prometheus/prometheus.yml` — добавить блок `rule_files` сразу после `global`, остальное не трогать:

```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 10s

rule_files:
  - rules.yml

scrape_configs:
  - job_name: services
    static_configs:
      - targets:
          - gateway:9101
          - catalog:9101
          - auth:9101
          - twofa:9101
          - passkey:9101
          - content:9101
          - mesh-api:9101
          - mesh-worker:9101
          - asset:9101
          - upload:9101
        labels: { stack: andrey }
    relabel_configs:
      - source_labels: [__address__]
        regex: '([^:]+):.*'
        target_label: service
        replacement: '$1'
```

`rule_files` разрешается относительно каталога конфига, поэтому `rules.yml` должен лежать рядом — в контейнере это `/etc/prometheus/rules.yml`, что и делает следующий шаг.

- [ ] **Step 3: Проверить синтаксис правил через promtool**

Run:
```bash
docker run --rm -v "$PWD/ops/prometheus:/etc/prometheus:ro" \
  --entrypoint promtool prom/prometheus:latest check rules /etc/prometheus/rules.yml
```
Expected: `SUCCESS: 8 rules found` (точная формулировка вывода — `Checking /etc/prometheus/rules.yml` и `SUCCESS: 8 rules found`).

Если promtool ругается на выражение — исправить и запустить снова, прежде чем идти дальше.

- [ ] **Step 4: Смонтировать файл правил в compose**

Modify `docker-compose.yml`, сервис `prometheus` — добавить третий том:

```yaml
  prometheus:
    image: prom/prometheus:latest
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    volumes:
      - ./ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./ops/prometheus/rules.yml:/etc/prometheus/rules.yml:ro
      - prometheus-data:/prometheus
    expose:
      - "9090"
    depends_on:
      gateway: { condition: service_started }
```

- [ ] **Step 5: Удалить сервис grafana из compose**

Modify `docker-compose.yml` — удалить целиком блок `grafana:` (от `  grafana:` до строки перед `  frontend:`), включая все его `environment`, `volumes`, `expose`, `depends_on`.

В секции `volumes:` внизу файла удалить запись `grafana-data`.

- [ ] **Step 6: Переключить переменную окружения фронтенда**

Modify `docker-compose.yml`, сервис `frontend` — в его `environment` удалить строку с `GRAFANA_URL` и добавить:

```yaml
      PROMETHEUS_URL: "http://prometheus:9090"
```

Если у `frontend` есть `depends_on` с `grafana` — удалить эту запись, при необходимости добавив `prometheus: { condition: service_started }`.

- [ ] **Step 7: Проверить, что упоминаний Grafana в конфигах не осталось**

Run:
```bash
grep -rn -i "grafana" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "^./docs/superpowers/"
```
Expected: остались только `frontend/src/app/api/grafana/[...path]/route.ts`, `frontend/src/app/admin/metrics/page.tsx` и файлы в `ops/grafana/` — их удалят Task 7 и Step 8. Любое другое попадание (например, в README или deploy-скриптах на проде) — почистить сейчас же в этом шаге.

- [ ] **Step 8: Удалить каталог ops/grafana**

Run:
```bash
git rm -r ops/grafana
```
Expected: удалено 7+ файлов (`provisioning/datasources/prometheus.yml`, `provisioning/dashboards/provider.yml`, `provisioning/alerting/{rules,contactpoints,policies}.yaml`, `dashboards/{red,domain,runtime,alerts}.json`).

- [ ] **Step 9: Проверить, что compose-файл валиден**

Run: `docker compose -p andrey config >/dev/null && echo OK`
Expected: `OK`, без предупреждений про неопределённый том `grafana-data`.

- [ ] **Step 10: Commit**

```bash
git add ops docker-compose.yml
git commit -m "feat(ops): move alert rules into Prometheus, drop Grafana"
```

---

### Task 2: Доменный слой метрик

**Files:**
- Create: `frontend/src/metrics/domain/series.ts`
- Create: `frontend/src/metrics/domain/panel.ts`
- Test: `frontend/src/metrics/domain/series.test.ts`
- Test: `frontend/src/metrics/domain/panel.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type Point = { t: number; v: number }`
  - `type Series = { label: string; points: Point[] }`
  - `type Row = { t: number } & Record<string, number>`
  - `function toRows(series: Series[]): Row[]`
  - `type Unit = "rps" | "cpm" | "percent" | "seconds" | "bytes" | "mbps" | "count"`
  - `function formatValue(v: number, unit: Unit): string`
  - `const RANGES: readonly ["1h", "6h", "24h", "7d"]`
  - `type Range = "1h" | "6h" | "24h" | "7d"`
  - `const RANGE_SECONDS: Record<Range, number>`
  - `function isRange(v: string): v is Range`
  - `function stepSeconds(range: Range): number`
  - `type PanelKind = "line" | "stat" | "alerts"`
  - `type PanelDef = { id: string; title: string; unit: Unit; kind: PanelKind; expr: string; instant?: boolean }`

- [ ] **Step 1: Написать падающий тест на series.ts**

Create `frontend/src/metrics/domain/series.test.ts`:

```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toRows, formatValue, type Series } from "./series.ts";

const a: Series = { label: "auth", points: [{ t: 10, v: 1 }, { t: 20, v: 2 }] };
const b: Series = { label: "gateway", points: [{ t: 20, v: 5 }, { t: 30, v: 6 }] };

test("toRows: merges series onto a shared, sorted time axis", () => {
  assert.deepEqual(toRows([a, b]), [
    { t: 10, auth: 1 },
    { t: 20, auth: 2, gateway: 5 },
    { t: 30, gateway: 6 },
  ]);
});

test("toRows: empty input yields no rows", () => {
  assert.deepEqual(toRows([]), []);
  assert.deepEqual(toRows([{ label: "x", points: [] }]), []);
});

test("formatValue: renders each unit in a compact, human form", () => {
  assert.equal(formatValue(142.4, "rps"), "142/s");
  assert.equal(formatValue(0.0512, "percent"), "5.1%");
  assert.equal(formatValue(0.0034, "seconds"), "3ms");
  assert.equal(formatValue(2.5, "seconds"), "2.50s");
  assert.equal(formatValue(1610612736, "bytes"), "1.5 GB");
  assert.equal(formatValue(12.25, "mbps"), "12.2 MB/s");
  assert.equal(formatValue(30, "cpm"), "30/min");
  assert.equal(formatValue(7, "count"), "7");
});

test("formatValue: no data reads as a dash, not NaN", () => {
  assert.equal(formatValue(Number.NaN, "rps"), "—");
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './series.ts'`.

- [ ] **Step 3: Реализовать series.ts**

Create `frontend/src/metrics/domain/series.ts`:

```ts
export type Point = { t: number; v: number };

/** Одна временная серия: подпись (обычно имя сервиса или статус) и точки. */
export type Series = { label: string; points: Point[] };

/** Строка для чарта: общая ось времени, по колонке на серию. */
export type Row = { t: number } & Record<string, number>;

/**
 * Схлопывает серии в общую ось времени. Пропуски остаются пропусками —
 * Recharts рисует разрыв там, где у серии нет ключа, а не проваливается в ноль.
 */
export function toRows(series: Series[]): Row[] {
  const byTime = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      const row = byTime.get(p.t) ?? ({ t: p.t } as Row);
      row[s.label] = p.v;
      byTime.set(p.t, row);
    }
  }
  return [...byTime.values()].sort((x, y) => x.t - y.t);
}

export type Unit = "rps" | "cpm" | "percent" | "seconds" | "bytes" | "mbps" | "count";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function formatValue(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "rps":
      return `${round(v)}/s`;
    case "cpm":
      return `${round(v)}/min`;
    case "percent":
      return `${(v * 100).toFixed(1)}%`;
    case "seconds":
      return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
    case "bytes":
      return v >= GB ? `${(v / GB).toFixed(1)} GB` : `${(v / MB).toFixed(1)} MB`;
    case "mbps":
      return `${v.toFixed(1)} MB/s`;
    case "count":
      return String(round(v));
  }
}

function round(v: number): number {
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}
```

- [ ] **Step 4: Убедиться, что тесты series проходят**

Run: `cd frontend && yarn test`
Expected: PASS для четырёх тестов из `series.test.ts`.

- [ ] **Step 5: Написать падающий тест на panel.ts**

Create `frontend/src/metrics/domain/panel.test.ts`:

```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { RANGES, RANGE_SECONDS, isRange, stepSeconds } from "./panel.ts";

test("stepSeconds: never finer than the 15s scrape interval", () => {
  for (const r of RANGES) assert.ok(stepSeconds(r) >= 15, `${r} стал мельче скрейпа`);
});

test("stepSeconds: is a whole number of scrape intervals", () => {
  for (const r of RANGES) assert.equal(stepSeconds(r) % 15, 0, `${r} не кратен 15`);
});

test("stepSeconds: keeps every range near 200 points", () => {
  for (const r of RANGES) {
    const points = RANGE_SECONDS[r] / stepSeconds(r);
    assert.ok(points >= 150 && points <= 250, `${r} даёт ${points} точек`);
  }
});

test("isRange: accepts the four known ranges and rejects anything else", () => {
  assert.equal(isRange("6h"), true);
  assert.equal(isRange("7d"), true);
  assert.equal(isRange("99y"), false);
  assert.equal(isRange(""), false);
});
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './panel.ts'`.

- [ ] **Step 7: Реализовать panel.ts**

Create `frontend/src/metrics/domain/panel.ts`:

```ts
import type { Unit } from "./series.ts";

export const RANGES = ["1h", "6h", "24h", "7d"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_SECONDS: Record<Range, number> = {
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

export function isRange(v: string): v is Range {
  return (RANGES as readonly string[]).includes(v);
}

/** Prometheus скрейпит раз в 15s — точки чаще этого не существуют. */
const SCRAPE = 15;
const TARGET_POINTS = 200;

/** Шаг query_range: ~200 точек на диапазон, округлённо до целых скрейпов. */
export function stepSeconds(range: Range): number {
  const raw = RANGE_SECONDS[range] / TARGET_POINTS;
  return Math.max(SCRAPE, Math.round(raw / SCRAPE) * SCRAPE);
}

export type PanelKind = "line" | "stat" | "alerts";

/**
 * Определение панели. `expr` живёт только на сервере: клиент присылает id,
 * роут резолвит его сюда. Так в браузерный бандл не попадает PromQL и не
 * появляется возможность выполнить произвольный запрос к Prometheus.
 */
export type PanelDef = {
  id: string;
  title: string;
  unit: Unit;
  kind: PanelKind;
  expr: string;
  instant?: boolean;
};
```

- [ ] **Step 8: Убедиться, что все тесты проходят**

Run: `cd frontend && yarn test`
Expected: PASS, все восемь новых тестов зелёные, ранее существовавшие тесты не сломаны.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/metrics/domain
git commit -m "feat(metrics): domain types, range/step math and value formatting"
```

---

### Task 3: Реестр панелей и gateway в Prometheus

**Files:**
- Create: `frontend/src/metrics/domain/panels.ts`
- Create: `frontend/src/metrics/infrastructure/prometheus-gateway.ts`
- Test: `frontend/src/metrics/infrastructure/prometheus-gateway.test.ts`

**Interfaces:**
- Consumes: `PanelDef`, `Range`, `stepSeconds` из `@/metrics/domain/panel`; `Series` из `@/metrics/domain/series`.
- Produces:
  - `const PANELS: readonly PanelDef[]`
  - `function findPanel(id: string): PanelDef | undefined`
  - `const SECTIONS: readonly { title: string; panelIds: readonly string[] }[]`
  - `function toSeries(body: unknown): Series[]` (экспортируется для теста)
  - `function fetchPanel(panel: PanelDef, range: Range): Promise<Series[]>`

- [ ] **Step 1: Создать реестр панелей**

Все выражения — те же, что в удалённых дашбордах `ops/grafana/dashboards/*.json`.

Create `frontend/src/metrics/domain/panels.ts`:

```ts
import type { PanelDef } from "./panel.ts";

export const PANELS: readonly PanelDef[] = [
  // — Плитки: мгновенный снимок.
  { id: "stat-up", title: "Сервисов живо", unit: "count", kind: "stat", instant: true,
    expr: 'sum(up{job="services"})' },
  { id: "stat-rps", title: "Запросов в секунду", unit: "rps", kind: "stat", instant: true,
    expr: "sum(rate(http_requests_total[5m]))" },
  { id: "stat-errors", title: "Доля ошибок", unit: "percent", kind: "stat", instant: true,
    expr: 'sum(rate(http_requests_total{code=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])),0.001)' },
  { id: "stat-p99", title: "Задержка p99", unit: "seconds", kind: "stat", instant: true,
    expr: "histogram_quantile(0.99, sum by (le)(rate(grpc_server_handling_seconds_bucket[5m])))" },
  { id: "stat-queue", title: "Очередь конвертаций", unit: "count", kind: "stat", instant: true,
    expr: "max(mesh_queue_depth)" },

  // — Services (RED).
  { id: "red-rate", title: "gRPC: запросы по сервисам", unit: "rps", kind: "line",
    expr: "sum by (service)(rate(grpc_server_handled_total[5m]))" },
  { id: "red-errors", title: "gRPC: ошибки по сервисам", unit: "rps", kind: "line",
    expr: 'sum by (service)(rate(grpc_server_handled_total{grpc_code!="OK"}[5m]))' },
  { id: "red-latency", title: "gRPC: p99 по сервисам", unit: "seconds", kind: "line",
    expr: "histogram_quantile(0.99, sum by (le, grpc_service)(rate(grpc_server_handling_seconds_bucket[5m])))" },
  { id: "red-http", title: "HTTP: запросы", unit: "rps", kind: "line",
    expr: "sum(rate(http_requests_total[5m]))" },

  // — Domain.
  { id: "domain-conversions", title: "Конвертации по статусам", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(mesh_conversions_total[5m])) * 60" },
  { id: "domain-conversion-p95", title: "Длительность конвертации p95", unit: "seconds", kind: "line",
    expr: "histogram_quantile(0.95, sum by (le)(rate(mesh_conversion_duration_seconds_bucket[10m])))" },
  { id: "domain-queue", title: "Глубина очереди", unit: "count", kind: "line",
    expr: "mesh_queue_depth" },
  { id: "domain-upload", title: "Пропускная способность загрузок", unit: "mbps", kind: "line",
    expr: "sum(rate(upload_bytes_total[5m])) / 1048576" },
  { id: "domain-auth", title: "Входы по статусам", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(auth_logins_total[5m])) * 60" },
  { id: "domain-twofa", title: "Проверки 2FA по статусам", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(twofa_verifications_total[5m])) * 60" },

  // — Go runtime.
  { id: "runtime-memory", title: "Резидентная память", unit: "bytes", kind: "line",
    expr: "process_resident_memory_bytes" },
  { id: "runtime-goroutines", title: "Горутины", unit: "count", kind: "line",
    expr: "go_goroutines" },
  { id: "runtime-gc", title: "Пауза GC (max)", unit: "seconds", kind: "line",
    expr: 'max by (service)(go_gc_duration_seconds{quantile="1"})' },
  { id: "runtime-fds", title: "Открытые дескрипторы", unit: "count", kind: "line",
    expr: "process_open_fds" },

  // — Алерты: ALERTS существует, только пока правило активно.
  { id: "alerts", title: "Алерты", unit: "count", kind: "alerts", instant: true,
    expr: 'ALERTS{alertstate=~"firing|pending"}' },
] as const;

export function findPanel(id: string): PanelDef | undefined {
  return PANELS.find((p) => p.id === id);
}

/** Порядок секций на странице. Плитки и алерты рендерятся отдельно. */
export const SECTIONS = [
  { title: "Сервисы (RED)", panelIds: ["red-rate", "red-errors", "red-latency", "red-http"] },
  { title: "Домен", panelIds: ["domain-conversions", "domain-conversion-p95", "domain-queue",
      "domain-upload", "domain-auth", "domain-twofa"] },
  { title: "Go runtime", panelIds: ["runtime-memory", "runtime-goroutines", "runtime-gc", "runtime-fds"] },
] as const;

export const STAT_IDS = ["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"] as const;
```

- [ ] **Step 2: Написать падающий тест на маппер**

Create `frontend/src/metrics/infrastructure/prometheus-gateway.test.ts`:

```ts
// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toSeries } from "./prometheus-gateway.ts";

test("toSeries: maps a matrix response, one series per label set", () => {
  const body = {
    status: "success",
    data: {
      resultType: "matrix",
      result: [
        { metric: { service: "auth" }, values: [[10, "1.5"], [25, "2"]] },
        { metric: { service: "gateway" }, values: [[10, "3"]] },
      ],
    },
  };
  assert.deepEqual(toSeries(body), [
    { label: "auth", points: [{ t: 10, v: 1.5 }, { t: 25, v: 2 }] },
    { label: "gateway", points: [{ t: 10, v: 3 }] },
  ]);
});

test("toSeries: maps a vector response into single-point series", () => {
  const body = {
    status: "success",
    data: { resultType: "vector", result: [{ metric: { status: "failed" }, value: [42, "7"] }] },
  };
  assert.deepEqual(toSeries(body), [{ label: "failed", points: [{ t: 42, v: 7 }] }]);
});

test("toSeries: drops NaN and Inf samples instead of charting them", () => {
  const body = {
    status: "success",
    data: {
      resultType: "matrix",
      result: [{ metric: { service: "auth" }, values: [[10, "NaN"], [20, "+Inf"], [30, "4"]] }],
    },
  };
  assert.deepEqual(toSeries(body), [{ label: "auth", points: [{ t: 30, v: 4 }] }]);
});

test("toSeries: a series left with no finite samples is dropped entirely", () => {
  const body = {
    status: "success",
    data: { resultType: "matrix", result: [{ metric: { service: "auth" }, values: [[10, "NaN"]] }] },
  };
  assert.deepEqual(toSeries(body), []);
});

test("toSeries: empty result is empty output, not an error", () => {
  assert.deepEqual(toSeries({ status: "success", data: { resultType: "matrix", result: [] } }), []);
});

test("toSeries: label falls back through service, grpc_service, status, alertname", () => {
  const body = {
    status: "success",
    data: {
      resultType: "vector",
      result: [
        { metric: { grpc_service: "catalog.v1.Catalog" }, value: [1, "1"] },
        { metric: { alertname: "TargetDown", severity: "critical" }, value: [1, "1"] },
        { metric: {}, value: [1, "1"] },
      ],
    },
  };
  assert.deepEqual(toSeries(body).map((s) => s.label), ["catalog.v1.Catalog", "TargetDown", "value"]);
});

test("toSeries: a failed Prometheus response throws", () => {
  assert.throws(() => toSeries({ status: "error", error: "parse error" }), /parse error/);
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `cd frontend && yarn test`
Expected: FAIL — `Cannot find module './prometheus-gateway.ts'`.

- [ ] **Step 4: Реализовать gateway**

Create `frontend/src/metrics/infrastructure/prometheus-gateway.ts`:

```ts
import { RANGE_SECONDS, stepSeconds, type PanelDef, type Range } from "@/metrics/domain/panel";
import type { Point, Series } from "@/metrics/domain/series";

const PROMETHEUS = process.env.PROMETHEUS_URL ?? "http://prometheus:9090";

// Форма ответа Prometheus — деталь реализации этого файла и наружу не выходит.
type PromMetric = Record<string, string>;
type PromSample = [number, string];
type PromResult = { metric: PromMetric; values?: PromSample[]; value?: PromSample };
type PromBody = {
  status: string;
  error?: string;
  data?: { resultType: string; result: PromResult[] };
};

// Лейбл серии: первый попавшийся осмысленный, иначе просто «value».
const LABEL_KEYS = ["service", "grpc_service", "status", "alertname", "code", "method"];

function labelOf(metric: PromMetric): string {
  for (const k of LABEL_KEYS) if (metric[k]) return metric[k];
  const rest = Object.entries(metric).filter(([k]) => k !== "__name__" && k !== "stack");
  return rest.length ? rest.map(([k, v]) => `${k}=${v}`).join(",") : "value";
}

export function toSeries(body: unknown): Series[] {
  const b = body as PromBody;
  if (b?.status !== "success") throw new Error(b?.error ?? "prometheus query failed");
  const out: Series[] = [];
  for (const r of b.data?.result ?? []) {
    const samples = r.values ?? (r.value ? [r.value] : []);
    const points: Point[] = [];
    for (const [t, raw] of samples) {
      const v = Number(raw);
      // NaN/±Inf штатно приходят из histogram_quantile без трафика — это не точки.
      if (Number.isFinite(v)) points.push({ t, v });
    }
    if (points.length) out.push({ label: labelOf(r.metric), points });
  }
  return out;
}

export async function fetchPanel(panel: PanelDef, range: Range): Promise<Series[]> {
  const now = Math.floor(Date.now() / 1000);
  const url = new URL(
    panel.instant ? "/api/v1/query" : "/api/v1/query_range",
    PROMETHEUS,
  );
  url.searchParams.set("query", panel.expr);
  if (panel.instant) {
    url.searchParams.set("time", String(now));
  } else {
    url.searchParams.set("start", String(now - RANGE_SECONDS[range]));
    url.searchParams.set("end", String(now));
    url.searchParams.set("step", String(stepSeconds(range)));
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`prometheus ${res.status}`);
  return toSeries(await res.json());
}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && yarn test`
Expected: PASS, все семь тестов маппера зелёные.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/metrics
git commit -m "feat(metrics): panel registry and Prometheus gateway"
```

---

### Task 4: BFF-роут `/api/metrics/query`

**Files:**
- Create: `frontend/src/app/api/metrics/query/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser` из `@/auth/application/current-user`; `findPanel` из `@/metrics/domain/panels`; `isRange` из `@/metrics/domain/panel`; `fetchPanel` из `@/metrics/infrastructure/prometheus-gateway`.
- Produces: HTTP-контракт `GET /api/metrics/query?panel=<id>&range=<1h|6h|24h|7d>` → `200` с `Series[]` в теле, `400` на неизвестный id или диапазон, `403` не-владельцу, `502` при недоступном Prometheus.

- [ ] **Step 1: Написать роут**

Create `frontend/src/app/api/metrics/query/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/auth/application/current-user";
import { isRange } from "@/metrics/domain/panel";
import { findPanel } from "@/metrics/domain/panels";
import { fetchPanel } from "@/metrics/infrastructure/prometheus-gateway";

export async function GET(req: NextRequest) {
  // Gate: метрики видит только владелец. Матчер в src/proxy.ts исключает /api,
  // поэтому эта проверка — единственная, ровно как было у прокси Grafana.
  const p = await getCurrentUser();
  if (!p?.isOwner) return new Response("forbidden", { status: 403 });

  const params = req.nextUrl.searchParams;
  const panel = findPanel(params.get("panel") ?? "");
  const range = params.get("range") ?? "";
  // PromQL резолвится из реестра на сервере: клиент присылает только id,
  // так что произвольный запрос к Prometheus через этот роут невозможен.
  if (!panel || !isRange(range)) return new Response("bad request", { status: 400 });

  try {
    return Response.json(await fetchPanel(panel, range), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return new Response("upstream unavailable", { status: 502 });
  }
}
```

- [ ] **Step 2: Проверить типы и линт**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: обе команды без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/metrics
git commit -m "feat(metrics): owner-gated BFF route resolving panel ids to PromQL"
```

---

### Task 5: Хук поллинга и чарт

**Files:**
- Create: `frontend/src/metrics/application/use-panel-series.ts`
- Create: `frontend/src/metrics/presentation/charts/time-series-chart.tsx`
- Modify: `frontend/package.json` (добавление recharts)

**Interfaces:**
- Consumes: `Series`, `toRows`, `formatValue`, `Unit` из `@/metrics/domain/series`; `Range` из `@/metrics/domain/panel`.
- Produces:
  - `function usePanelSeries(panelId: string, range: Range): { series: Series[]; error: boolean; loading: boolean }`
  - default-экспорт `TimeSeriesChart` с пропсами `{ series: Series[]; unit: Unit }`

- [ ] **Step 1: Установить Recharts**

Run:
```bash
cd frontend && yarn add recharts@3.9.2
```
Expected: `recharts@3.9.2` в `dependencies`, без предупреждений о конфликте peer-зависимостей с React 19 (Recharts 3.9.2 объявляет `react: ^19.0.0`).

- [ ] **Step 2: Написать хук поллинга**

Create `frontend/src/metrics/application/use-panel-series.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { Range } from "@/metrics/domain/panel";
import type { Series } from "@/metrics/domain/series";

const POLL_MS = 30_000;

/**
 * Тянет одну панель и перезапрашивает раз в 30 секунд. Поллинг замирает,
 * когда вкладка скрыта: страница висит открытой часами, и незачем долбить
 * Prometheus, пока на неё никто не смотрит.
 */
export function usePanelSeries(panelId: string, range: Range) {
  const [series, setSeries] = useState<Series[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const res = await fetch(
          `/api/metrics/query?panel=${encodeURIComponent(panelId)}&range=${range}`,
          { signal: ac.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(String(res.status));
        setSeries(await res.json());
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    }

    function tick() {
      if (document.visibilityState === "visible") void load();
      timer = setTimeout(tick, POLL_MS);
    }

    void load();
    timer = setTimeout(tick, POLL_MS);
    // Вкладку вернули — не ждём остатка интервала, обновляем сразу.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ac.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [panelId, range]);

  return { series, error, loading };
}
```

- [ ] **Step 3: Написать чарт**

Единственный файл, импортирующий Recharts. Вся стилизация под сайт живёт здесь, чтобы панели её не переопределяли.

Create `frontend/src/metrics/presentation/charts/time-series-chart.tsx`:

```tsx
"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatValue, toRows, type Series, type Unit } from "@/metrics/domain/series";

// Палитра серий — акценты сайта, начиная с фирменного cyan.
const COLORS = ["#67e8f9", "#a78bfa", "#fbbf24", "#34d399", "#fb7185", "#60a5fa"];

const AXIS = { stroke: "transparent", tick: { fill: "#a3a3a3", fontSize: 11 } } as const;

function clockOf(t: number): string {
  return new Date(t * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function TimeSeriesChart({ series, unit }: { series: Series[]; unit: Unit }) {
  const rows = toRows(series);
  return (
    <ResponsiveContainer width="100%" height={224}>
      <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="t" tickFormatter={clockOf} minTickGap={48} tickLine={false} {...AXIS} />
        <YAxis
          width={56}
          tickFormatter={(v: number) => formatValue(v, unit)}
          tickLine={false}
          {...AXIS}
        />
        <Tooltip
          contentStyle={{
            background: "#0c0d10",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a3a3a3" }}
          labelFormatter={(t: number) => clockOf(t)}
          formatter={(v: number, name: string) => [formatValue(v, unit), name]}
        />
        {series.length > 1 && (
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, color: "#a3a3a3", paddingTop: 8 }}
          />
        )}
        {series.map((s, i) => (
          <Line
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Проверить типы и линт**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: без ошибок. Если `max-lines` ругается — вынести `AXIS`/`COLORS`/`clockOf` в соседний `chart-theme.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/yarn.lock frontend/src/metrics
git commit -m "feat(metrics): polling hook and site-styled Recharts wrapper"
```

---

### Task 6: Панели, плитки, переключатель диапазона, алерты

**Files:**
- Create: `frontend/src/metrics/presentation/components/panel-card.tsx`
- Create: `frontend/src/metrics/presentation/components/stat-tile.tsx`
- Create: `frontend/src/metrics/presentation/components/range-picker.tsx`
- Create: `frontend/src/metrics/presentation/components/alerts-card.tsx`

**Interfaces:**
- Consumes: `usePanelSeries`; `PanelDef`, `Range`, `RANGES`; `formatValue`, `Series`.
- Produces:
  - `PanelCard` с пропсами `{ panel: Pick<PanelDef, "id" | "title" | "unit">; range: Range }`
  - `StatTile` с пропсами `{ panel: Pick<PanelDef, "id" | "title" | "unit">; range: Range }`
  - `RangePicker` с пропсами `{ value: Range; onChange: (r: Range) => void }`
  - `AlertsCard` с пропсами `{ range: Range }`

- [ ] **Step 1: Написать оболочку панели**

`PanelDef` целиком в клиент не передаётся — компоненты берут только `id`/`title`/`unit`, чтобы PromQL не утёк в бандл.

Create `frontend/src/metrics/presentation/components/panel-card.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { PanelDef, Range } from "@/metrics/domain/panel";

// Recharts весит около 450 КБ — грузим его только на этой owner-only странице,
// а не в общий бандл сайта.
const TimeSeriesChart = dynamic(() => import("../charts/time-series-chart"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-white/5" />,
});

export type PanelView = Pick<PanelDef, "id" | "title" | "unit">;

export default function PanelCard({ panel, range }: { panel: PanelView; range: Range }) {
  const { series, error, loading } = usePanelSeries(panel.id, range);
  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400">
        {panel.title}
      </h3>
      {error ? (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-6 text-center text-sm text-red-200">
          Метрика недоступна
        </p>
      ) : loading ? (
        <div className="h-56 animate-pulse rounded-lg bg-white/5" />
      ) : series.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-sm text-neutral-500">Нет данных</p>
      ) : (
        <TimeSeriesChart series={series} unit={panel.unit} />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Написать плитку**

Create `frontend/src/metrics/presentation/components/stat-tile.tsx`:

```tsx
"use client";

import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { Range } from "@/metrics/domain/panel";
import { formatValue } from "@/metrics/domain/series";
import type { PanelView } from "./panel-card";

export default function StatTile({ panel, range }: { panel: PanelView; range: Range }) {
  const { series, error, loading } = usePanelSeries(panel.id, range);
  const last = series[0]?.points.at(-1)?.v;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-neutral-400">{panel.title}</p>
      <p
        className={`mt-1 font-mono text-2xl ${error ? "text-red-200" : "text-cyan-300"}`}
        aria-busy={loading}
      >
        {error ? "—" : loading || last === undefined ? "…" : formatValue(last, panel.unit)}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Написать переключатель диапазона**

Create `frontend/src/metrics/presentation/components/range-picker.tsx`:

```tsx
"use client";

import { RANGES, type Range } from "@/metrics/domain/panel";

const LABELS: Record<Range, string> = { "1h": "1 ч", "6h": "6 ч", "24h": "24 ч", "7d": "7 д" };

export default function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1" role="group"
      aria-label="Период">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={r === value}
          className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
            r === value ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {LABELS[r]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Написать карточку алертов**

Create `frontend/src/metrics/presentation/components/alerts-card.tsx`:

```tsx
"use client";

import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { Range } from "@/metrics/domain/panel";

export default function AlertsCard({ range }: { range: Range }) {
  const { series, error, loading } = usePanelSeries("alerts", range);

  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400">Алерты</h3>
      {error ? (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-4 text-sm text-red-200">
          Не удалось получить состояние алертов
        </p>
      ) : loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      ) : series.length === 0 ? (
        <p className="py-4 text-sm text-neutral-400">Всё спокойно — активных алертов нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {series.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            >
              <span>{s.label}</span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-amber-200/70">
                активен
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Проверить типы и линт**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: без ошибок, ни один файл не превышает 200 строк.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/metrics/presentation/components
git commit -m "feat(metrics): panel card, stat tile, range picker and alerts card"
```

---

### Task 7: Сборка страницы и снос iframe-прокси

**Files:**
- Create: `frontend/src/metrics/presentation/components/metrics-dashboard.tsx`
- Modify: `frontend/src/app/admin/metrics/page.tsx` (заменить целиком)
- Delete: `frontend/src/app/api/grafana/[...path]/route.ts` (и пустые каталоги над ним)

**Interfaces:**
- Consumes: `PanelCard`, `StatTile`, `RangePicker`, `AlertsCard`; `PANELS`, `SECTIONS`, `STAT_IDS`; `PanelView`.
- Produces: `MetricsDashboard` с пропсами `{ stats: PanelView[]; sections: { title: string; panels: PanelView[] }[] }`.

- [ ] **Step 1: Написать композицию дашборда**

Create `frontend/src/metrics/presentation/components/metrics-dashboard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Range } from "@/metrics/domain/panel";
import AlertsCard from "./alerts-card";
import PanelCard, { type PanelView } from "./panel-card";
import RangePicker from "./range-picker";
import StatTile from "./stat-tile";

export type Section = { title: string; panels: PanelView[] };

export default function MetricsDashboard({
  stats,
  sections,
}: {
  stats: PanelView[];
  sections: Section[];
}) {
  const [range, setRange] = useState<Range>("6h");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Метрики</h1>
          <p className="mt-1 text-xs text-neutral-400">Обновляется каждые 30 секунд</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((p) => (
          <StatTile key={p.id} panel={p} range={range} />
        ))}
      </div>

      <AlertsCard range={range} />

      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-white/70">{s.title}</h2>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {s.panels.map((p) => (
              <PanelCard key={p.id} panel={p} range={range} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Переписать страницу**

Страница остаётся RSC с гейтом `isOwner`. Из `PANELS` в клиент уходят только `id`/`title`/`unit` — `expr` остаётся на сервере.

Modify `frontend/src/app/admin/metrics/page.tsx` — заменить содержимое целиком:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { findPanel, SECTIONS, STAT_IDS } from "@/metrics/domain/panels";
import MetricsDashboard from "@/metrics/presentation/components/metrics-dashboard";
import type { PanelView } from "@/metrics/presentation/components/panel-card";

// Клиент получает только идентификатор, заголовок и единицу измерения:
// PromQL остаётся на сервере, в реестре панелей.
function view(id: string): PanelView {
  const p = findPanel(id);
  if (!p) throw new Error(`unknown panel: ${id}`);
  return { id: p.id, title: p.title, unit: p.unit };
}

export default async function MetricsPage() {
  const p = await getCurrentUser();
  if (!p?.isOwner) redirect("/");

  return (
    <MetricsDashboard
      stats={STAT_IDS.map(view)}
      sections={SECTIONS.map((s) => ({ title: s.title, panels: s.panelIds.map(view) }))}
    />
  );
}
```

- [ ] **Step 3: Удалить прокси Grafana**

Run:
```bash
cd /Users/vbncursed/programming/rosneft && git rm -r "frontend/src/app/api/grafana"
```
Expected: удалён `frontend/src/app/api/grafana/[...path]/route.ts`.

- [ ] **Step 4: Убедиться, что в коде не осталось следов Grafana**

Run:
```bash
grep -rn -i "grafana" frontend/src ops docker-compose.yml
```
Expected: пусто.

- [ ] **Step 5: Прогнать тесты, типы, линт и сборку**

Run: `cd frontend && yarn test && npx tsc --noEmit && yarn lint && yarn build`
Expected: все тесты зелёные, типы чистые, линт чистый, сборка успешна. В выводе сборки маршрут `/api/metrics/query` присутствует, `/api/grafana/[...path]` отсутствует.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(metrics): native metrics dashboard, drop the Grafana iframes"
```

---

### Task 8: Проверка на живом стеке

**Files:** нет — только запуск и наблюдение.

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: подтверждение, что страница работает на реальных данных.

- [ ] **Step 1: Поднять стек с новым Prometheus**

Run:
```bash
cd /Users/vbncursed/programming/rosneft && docker compose -p andrey up -d --remove-orphans
```
Expected: контейнер `grafana` удалён благодаря `--remove-orphans`; `prometheus` в состоянии `running`.

- [ ] **Step 2: Убедиться, что Prometheus загрузил правила**

Run:
```bash
docker compose -p andrey exec prometheus wget -qO- http://localhost:9090/api/v1/rules \
  | grep -o '"name":"[A-Za-z]*"' | sort -u
```
Expected: восемь имён — `TargetDown`, `HighGrpcErrorRate`, `HighHttp5xxRate`, `HighLatencyP99`, `ConversionFailures`, `MemoryGrowth`, `QueueBacklog`, `LoginFailureSpike` (плюс имя группы `andrey-core`).

- [ ] **Step 3: Запустить фронтенд локально**

Фронтенд не входит в docker-стек — он запускается отдельно (см. память проекта `local-frontend-run`).

Run:
```bash
cd frontend && GATEWAY_URL=http://localhost:8080 NEXT_PUBLIC_API_URL=http://localhost:8080 \
  PROMETHEUS_URL=http://localhost:9090 yarn dev
```

Внимание: Prometheus объявлен через `expose`, а не `ports`, поэтому с хоста он недоступен. Для локального прогона либо временно добавить `ports: ["9090:9090"]` в `docker-compose.yml` (в коммит не включать), либо прокинуть порт разово:
```bash
docker compose -p andrey port prometheus 9090 || \
  docker run --rm -d --network andrey_default -p 9090:9090 alpine/socat \
  TCP-LISTEN:9090,fork TCP:prometheus:9090
```

- [ ] **Step 4: Проверить гейт роута без сессии**

Run: `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/metrics/query?panel=stat-rps&range=6h'`
Expected: `403`.

- [ ] **Step 5: Проверить отказ на неизвестной панели**

Залогиниться владельцем в браузере, затем в консоли DevTools:
```js
await fetch("/api/metrics/query?panel=up{}&range=6h").then((r) => r.status)
```
Expected: `400` — произвольное выражение не проходит, потому что резолвится только id из реестра.

- [ ] **Step 6: Проверить страницу глазами**

Открыть `http://localhost:3000/admin/metrics` владельцем и убедиться:
- пять плиток показывают числа, а не `…` и не `—`;
- переключение периода `1 ч / 6 ч / 24 ч / 7 д` перерисовывает все графики;
- карточка алертов показывает либо «Всё спокойно», либо список активных;
- через 30 секунд графики обновляются (правый край сдвигается);
- страница выглядит частью сайта: тёмный фон, `cyan`-акценты, те же скругления и типографика, что в соседних разделах консоли.

- [ ] **Step 7: Проверить остановку поллинга в скрытой вкладке**

Открыть вкладку Network в DevTools, переключиться на другую вкладку браузера на минуту, вернуться.
Expected: пока вкладка скрыта, новых запросов к `/api/metrics/query` нет; при возврате сразу идёт пачка запросов.

- [ ] **Step 8: Проверить поведение при недоступном Prometheus**

Run: `docker compose -p andrey stop prometheus`
Expected: панели показывают «Метрика недоступна» в красной рамке, страница не падает, остальной интерфейс консоли работает.

Затем вернуть: `docker compose -p andrey start prometheus` — панели должны восстановиться в течение 30 секунд без перезагрузки страницы.

- [ ] **Step 9: Финальный коммит, если что-то правилось**

```bash
git add -A && git commit -m "fix(metrics): live-stack verification fixes"
```
Если правок не потребовалось — шаг пропустить.

---

## Заметки по ревью

После Task 7 и до Task 8 имеет смысл прогнать `/code-review` по диффу ветки: основное, на что смотреть — не утёк ли PromQL в клиентский бандл (`grep -r "rate(" frontend/.next/static` должен быть пуст) и держится ли лимит в 200 строк по всем новым файлам.

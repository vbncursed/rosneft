# Нативная страница метрик вместо Grafana-iframe

Дата: 2026-07-20

## Проблема

`/admin/metrics` встраивает четыре iframe'а Grafana через BFF-прокси `/api/grafana/[...path]`.
Визуально это чужой продукт внутри нашего интерфейса: своя типографика, свои цвета, свои
отступы, свои контролы. Страница не выглядит частью сайта.

## Решение

Убрать Grafana полностью. Prometheus остаётся источником данных, страница рисуется нашими
компонентами на Recharts, правила алертов переезжают в сам Prometheus.

## Область

**В объёме:** инфраструктурные метрики — те же, что показывают текущие четыре дашборда
(RED, Domain, Go Runtime, Alerts).

**Вне объёма:** продуктовые/бизнес-метрики (число территорий, моделей, пользователей,
объём хранилища). Их нет в Prometheus, для них потребовался бы новый эндпоинт в gateway
с запросами в БД. Отдельная задача.

**Go-код не трогаем.** Экспортёры метрик, `pkg/metrics`, сервисы — без изменений. Меняется
только `ops/` (YAML) и `docker-compose.yml`.

## Текущее состояние

- `frontend/src/app/admin/metrics/page.tsx` — 4 iframe, owner-only.
- `frontend/src/app/api/grafana/[...path]/route.ts` — прокси в Grafana, гейт `isOwner`,
  идентичность через заголовок `x-webauth-user`.
- `frontend/src/auth/presentation/console/console-sidebar.tsx:25` — пункт меню «Metrics».
- Prometheus: `retention 15d`, `scrape_interval 15s`, job `services`, 10 таргетов на `:9101`,
  лейбл `service` выводится из hostname. Наружу не опубликован (`expose`, не `ports`).
- Grafana: `expose: 3000`, provisioning датасорса/дашбордов/алертов из `ops/grafana/`.
- Правила алертов: `ops/grafana/provisioning/alerting/rules.yaml`, группа `andrey-core`,
  интервал `1m`, 8 правил.
- Contact point — вебхук на `http://localhost:3000/api/health` с `disableResolveMessage`,
  то есть фактически заглушка: уведомления сейчас никуда не доставляются.

## Доступные метрики

Из `backend/pkg/metrics` и доменных модулей:

| Метрика | Лейблы | Источник |
|---|---|---|
| `grpc_server_handled_total` | `grpc_service, grpc_method, grpc_code` | `pkg/metrics/grpc.go` |
| `grpc_server_handling_seconds` | `grpc_service, grpc_method` (histogram) | `pkg/metrics/grpc.go` |
| `http_requests_total` | `method, code` | `pkg/metrics/http.go` |
| `http_request_duration_seconds` | `method` (histogram) | `pkg/metrics/http.go` |
| `auth_logins_total` | `status` | auth-service |
| `twofa_verifications_total` | `status` | twofa-service |
| `upload_bytes_total`, `uploads_total` | `status` | upload-service |
| `mesh_conversions_total` | `status` | mesh-service worker |
| `mesh_conversion_duration_seconds` | histogram | mesh-service worker |
| `mesh_queue_depth` | gauge | mesh-service worker |
| `go_*`, `process_*` | `service` | стандартные коллекторы |

Плюс `up{job="services"}` от самого Prometheus и `ALERTS{alertstate=...}` после переезда правил.

## Архитектура

### 1. Инфраструктура

- Новый `ops/prometheus/rules.yml` — 8 правил из Grafana, один в один по PromQL, в формате
  `groups: [{name, interval, rules: [{alert, expr, for, labels, annotations}]}]`.
- `ops/prometheus/prometheus.yml` — добавляется `rule_files: ["rules.yml"]`.
- `docker-compose.yml` — удаляются сервис `grafana` и том `grafana-data`; у `frontend`
  убирается `GRAFANA_URL`, добавляется `PROMETHEUS_URL: http://prometheus:9090`.
- Каталог `ops/grafana/` удаляется целиком.

Что теряем: ad-hoc построение графиков в браузере. Уведомлений не теряем — их и не было.
Историю состояний алертов теряем: `ALERTS` существует в Prometheus только пока правило
активно. Панель алертов показывает «что горит сейчас», без журнала. Для восьми
инфраструктурных правил это принято осознанно.

### 2. BFF-роут

`frontend/src/app/api/grafana/[...path]/route.ts` удаляется.
Появляется `frontend/src/app/api/metrics/query/route.ts`:

- `GET ?panel=<id>&range=<1h|6h|24h|7d>`;
- гейт `getCurrentUser()` → `403` если не `isOwner` (как в старом роуте);
- id панели резолвится в PromQL **на сервере** через реестр панелей — клиент никогда не
  присылает выражение. Неизвестный id → `400`. Это закрывает выполнение произвольного
  PromQL и не тащит выражения в браузерный бандл;
- `step` считается из диапазона так, чтобы точек было ~200, но не чаще `scrape_interval` (15s);
- запрос уходит в `${PROMETHEUS_URL}/api/v1/query_range`, а для панелей с `instant: true`
  (алерты) — в `/api/v1/query`;
- ответ Prometheus маппится в доменные `Series[]` прямо в роуте через gateway; наружу
  DTO Prometheus не выходит;
- `cache: "no-store"`.

Матчер `frontend/src/proxy.ts` исключает `api`, поэтому гейт роута остаётся единственным —
как и было для `/api/grafana`.

### 3. Новый bounded context `metrics/`

```
frontend/src/metrics/
  domain/
    series.ts        # Series { label, points: { t: number; v: number }[] }
    panel.ts         # PanelDef { id, title, unit, kind, instant? }, Range
    panels.ts        # реестр: id → PromQL + метаданные (server-side)
  infrastructure/
    prometheus-gateway.ts   # Prometheus DTO → Series, расчёт step
  application/
    use-metrics-panels.ts   # фетч панелей, поллинг 30с, состояние диапазона
  presentation/
    components/
      metrics-dashboard.tsx  # композиция секций
      panel-card.tsx         # рамка панели: заголовок, состояние загрузки/ошибки
      range-picker.tsx
      stat-tile.tsx
      alerts-card.tsx
    charts/
      time-series-chart.tsx  # единственный файл, импортирующий recharts
```

Слои: `presentation` не импортирует `infrastructure` и DTO. `domain/panels.ts` содержит
PromQL и используется только роутом; клиент получает список id/заголовков через пропсы
серверного компонента страницы.

### 4. Страница

`app/admin/metrics/page.tsx` остаётся RSC с гейтом `isOwner`, рендерит
`<MetricsDashboard />` с начальным списком панелей.

Состав:

1. **Полоса плиток**: сервисов живо `x/y`, req/s, error rate %, p99 latency, глубина очереди.
2. **Services (RED)**: rate по сервисам, error rate по сервисам, p99 по сервисам.
3. **Domain**: конверсии по статусам, p95 конверсии, throughput аплоадов MB/s,
   неудачные логины, неудачные 2FA.
4. **Runtime**: RSS по сервисам, goroutines, GC pause, открытые дескрипторы.
5. **Alerts**: `ALERTS{alertstate=~"firing|pending"}` — список с severity и именем правила.

Переключатель диапазона `1ч / 6ч / 24ч / 7д` (потолок — retention 15 дней).
Автообновление раз в 30 секунд; поллинг останавливается, когда вкладка скрыта
(`document.visibilityState`), и возобновляется при возврате.

### 5. Визуал

Recharts подключается через `next/dynamic` с `ssr: false` — 450 КБ не попадают в общий
бандл, страница owner-only и грузит их сама.

Единая стилизация в `time-series-chart.tsx`: грид `white/10`, оси без осевых линий,
подписи тем же кеглем и цветом, что в остальном интерфейсе, тултип — карточка теми же
классами, что и панели, палитра серий из существующих Tailwind-токенов. Все панели
берут стиль отсюда, а не задают его у себя.

Анимации, если понадобятся, — через `@/shared/presentation/motion/`, как требует CLAUDE.md,
с уважением `prefers-reduced-motion`.

### 6. Обработка ошибок

- Prometheus недоступен / роут вернул не-2xx → панель показывает состояние ошибки в своей
  рамке, остальные панели продолжают работать; поллинг не прекращается.
- Пустой результат запроса → «нет данных» вместо пустого графика.
- `NaN`/`+Inf` в значениях (типично для `histogram_quantile` без трафика) → точка
  отбрасывается при маппинге.

### 7. Проверки

`node --test` (уже настроен, `yarn test`) на двух чистых функциях:

- маппер ответа Prometheus → `Series[]`: обычный ответ, пустой `result`, `NaN`/`Inf`
  в значениях, несколько серий с разными лейблами;
- расчёт `step` по диапазону: не мельче `scrape_interval`, ~200 точек на каждом
  из четырёх диапазонов.

Вёрстку тестами не покрываем.

## Ограничения

- Лимит 200 строк на файл (ESLint) — соблюдается разбиением на компоненты выше.
- Clean Architecture / DDD по слоям.
- `motion` — только в `presentation`.
- Продуктовые метрики отсутствуют и в объём не входят.

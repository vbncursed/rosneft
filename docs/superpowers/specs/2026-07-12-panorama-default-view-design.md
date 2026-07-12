# Panorama default view direction (defaultYaw)

**Дата:** 2026-07-12
**Контекст:** full-stack — `backend/` (catalog + content + gateway) и `frontend/src/panorama/`

## Проблема

При входе в панораму камера всегда смотрит в **+Z мировой оси**
(`panorama-rig.tsx:57`: `controls.target.set(a.x, a.y, a.z + LOOK_RADIUS)`).
Оператор не может задать, куда панорама должна смотреть по умолчанию при
открытии. `yawOffset` не помогает — он крутит текстуру-сферу, а не камеру.

## Цель

Хранить per-panorama **дефолтный горизонтальный угол взгляда** (`defaultYaw`,
радианы) и применять его при открытии. Оператор внутри панорамы поворачивает
камеру в нужную сторону, жмёт «Set default view» (захват текущего yaw камеры),
сохраняет — при следующем открытии камера смотрит туда.

## Модель

- Новое поле `defaultYaw` — `float64` / `DOUBLE PRECISION`, радианы, **default 0**.
- Yaw как `atan2(dirX, dirZ)`: `0` = +Z (текущее поведение), растёт к +X.
  Обратно совместимо: у существующих панорам поле = 0 → смотрят в +Z как сейчас.
- World-space угол камеры (не относительно `yawOffset`). Захват и применение
  используют одну и ту же формулу, текстура-поворот постоянен → консистентно.

## Scope (срезано по ladder'у)

**Только read + update.** Create-путь НЕ трогаем: `defaultYaw` задаётся лишь
после создания через «Set default view»; на аплоаде берётся DB default 0.
Конкретно: НЕ трогаем `CreatePanoramaRequest` (proto), `PanoramaCreate`
(openapi/dto), gateway/content create-хендлеры **в части записи** значения.
INSERT в `create_panorama.go` не пишет `default_yaw` (колонка = DEFAULT 0), но
его RETURNING/outer SELECT обязаны вернуть `default_yaw`, т.к. используют общий
`panoramaSelectCols`/`scanPanorama` (иначе scan не сойдётся по колонкам).

## Backend (мирроринг пути `yawOffset`)

Go 1.26. Порядок: миграция → proto+gen → content-service → gateway → openapi+gen.

1. **Миграция** (catalog владеет DDL таблицы `panoramas`, авто-миграция на бут):
   новый `catalog-service/internal/migrate/migrations/00013_panorama_default_yaw.sql`:
   ```sql
   -- +goose Up
   ALTER TABLE panoramas ADD COLUMN default_yaw DOUBLE PRECISION NOT NULL DEFAULT 0;
   -- +goose Down
   ALTER TABLE panoramas DROP COLUMN default_yaw;
   ```
   (Новый номер, не редактируем 00004. content-service `00001_init.sql` — no-op,
   НЕ трогаем.)

2. **proto** `backend/proto/rosneft/content/v1/content.proto`: добавить
   `double default_yaw` в `Panorama` (append новым тегом после `updated_at`,
   без перенумерации ради wire-совместимости) и в `UpdatePanoramaRequest`
   (следующий свободный тег). НЕ в `CreatePanoramaRequest`. Затем `make proto-gen`
   (из `backend/`), commit `content.pb.go`.

3. **content-service**:
   - `internal/domain/panorama.go`: `DefaultYaw float64`.
   - `internal/storage/queries.go`: `pa.default_yaw` в `panoramaSelectCols`;
     `&p.DefaultYaw` в `scanPanorama` (позиция в SELECT = позиция в scan).
   - `internal/storage/update_panorama.go`: `default_yaw = $N` в SET, в RETURNING
     и outer SELECT, `p.DefaultYaw` в args.
   - `internal/storage/create_panorama.go`: `default_yaw` **только** в inner
     RETURNING + outer SELECT (не в INSERT columns/args).
   - `internal/transport/grpcapi/panoramas.go`: `DefaultYaw: req.GetDefaultYaw()`
     в `UpdatePanorama`.
   - `internal/transport/grpcapi/converters.go`: `DefaultYaw: p.DefaultYaw` в
     `panoramaToProto`.

4. **gateway-service**:
   - `internal/domain/panorama.go`: `DefaultYaw float64`.
   - `internal/clients/content/panoramas.go`: `DefaultYaw: p.DefaultYaw` в
     `UpdatePanorama` request builder.
   - `internal/clients/content/converters.go`: `DefaultYaw: p.GetDefaultYaw()` в
     `panoramaFromProto`.
   - `internal/transport/httpapi/panoramas.go`: читать `body.DefaultYaw` в
     `UpdatePanorama` (тот же nil-pointer-to-float паттерн, что у `YawOffset`).
   - `internal/transport/httpapi/converters.go`: `DefaultYaw: p.DefaultYaw` в
     `panoramaToAPI`.
   - `api/openapi.yaml`: `defaultYaw` (type number, format double) в схеме
     `Panorama` (+ в `required`) и в `PanoramaUpdate`. НЕ в `PanoramaCreate`.
     Затем `make openapi-gen`, commit `openapi_gen.go` + `openapi_spec_gen.go`.

## Frontend (`frontend/src/panorama/`)

1. **`domain/look-yaw.ts`** (новый, чистый) — единственная нетривиальная логика,
   с юнит-тестом:
   ```ts
   yawToTarget(anchor: Vec3, yaw: number, radius: number): Vec3
   // { x: anchor.x + sin(yaw)*r, y: anchor.y, z: anchor.z + cos(yaw)*r }
   dirToYaw(dx: number, dz: number): number  // Math.atan2(dx, dz)
   ```

2. **`domain/panorama.ts`**: `defaultYaw` в `Panorama` (required) и
   `PanoramaUpdate`. НЕ в `PanoramaCreate`.

3. **`presentation/three/camera-position-tracker.tsx`**: сейчас на событии
   OrbitControls `change` пишет только `camera.position` в `positionRef`.
   Добавить запись текущего yaw через `dirToYaw` от `camera.getWorldDirection()`
   в новый `yawRef` (второй проп).

4. **`application/use-panorama-overlays.ts`**: завести `cameraYawRef` рядом с
   `cameraPositionRef`, вернуть его; прокинуть в canvas-дерево (tracker) и в панель.

5. **`presentation/three/panorama-rig.tsx`**: `enterPanorama` применяет
   `panorama.defaultYaw` через `yawToTarget(anchor, defaultYaw, LOOK_RADIUS)`
   вместо хардкода `+Z`. `defaultYaw` пробросить в `enterPanorama` из пропса.

6. **`presentation/components/panorama-edit-panel.tsx`**: стейт `defaultYaw`
   (init из `panorama.defaultYaw`), кнопка **«Set default view»** — активна
   ТОЛЬКО в `inPanoramaMode` (зеркало «Set from camera», которая наоборот
   disabled в панораме); читает `cameraYawRef`, кладёт в стейт; рядом readout
   текущего угла в °. `dirty` учитывает `defaultYaw`; «Save anchor» шлёт
   `defaultYaw` в патче.

7. **`application/use-panoramas.ts`**: `defaultYaw` в типе `patch`, в optimistic
   merge (`patch.defaultYaw ?? current.defaultYaw`) и в теле `updatePanorama`.

8. **`presentation/components/panorama-section.tsx`**: `defaultYaw` в типе
   `onSavePanorama` патча; проброс `cameraYawRef` в панель.

9. **`infrastructure/panorama-gateway.ts`**: `mapPanorama` мапит `defaultYaw`.

10. **`shared/infrastructure/api/dto.ts`**: регенерится через
    `yarn openapi:generate` из обновлённого `openapi.yaml` (не редактируем руками).

## Флоу

Войти в панораму → покрутить камеру → «Set default view» (захват yaw из
`cameraYawRef`) → «Save anchor» → optimistic + PUT
`/api/territories/{slug}/panoramas/{id}` с `{title, position, yawOffset,
defaultYaw}` → при следующем `enterPanorama` камера наводится на сохранённый yaw.

## Обработка ошибок / edge

- `defaultYaw` отсутствует/0 → +Z (как сегодня).
- Кнопка захвата disabled вне panorama mode (нет валидного yaw камеры).
- `cameraYawRef.current == null` (не готово) → клик ничего не делает (как
  текущий `useCameraPos`).

## Тестирование

- **Runnable (ponytail):** unit на `look-yaw.ts` — round-trip
  `dirToYaw` ∘ `yawToTarget` для нескольких углов; `yaw=0 → target = anchor+Z`.
  Раннер: `node --test` (как остальные фронт-тесты).
- **Backend:** `make proto-gen`, `make openapi-gen`, `make build`, `make test`
  зелёные. Персист проверяется живым PUT→GET round-trip (contract) или вручную.
- **Ручная проверка:** войти в панораму, повернуть, Set default view, Save,
  выйти и снова войти → камера смотрит туда же; старые панорамы (defaultYaw=0)
  смотрят в +Z как раньше.

## Ограничения

200 строк/файл соблюдается; `look-yaw.ts` вынесен отдельно в т.ч. чтобы не
раздувать `panorama-rig.tsx`.

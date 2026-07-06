# Перетаскивание точки панорамы по 3D-модели — дизайн

Дата: 2026-07-06
Контекст: `frontend/src/panorama/` (bounded context уже существует)

## Задача

Дать оператору перетаскивать маркер точки панорамы (`Panorama.position`)
прямо по 3D-модели территории, вместо дискретных нёджей ±шаг в
калибровке / числовых полей. Позиция сохраняется автоматически на
отпускание.

## Жёсткое ограничение

Не ломать существующий функционал. Фича полностью аддитивна и работает
только внутри нового режима `moveMode`. Вне режима поведение маркеров,
калибровки, панели редактирования, входа в панораму — без изменений.

## Принятые решения (согласованы с пользователем)

1. **Высота при drag — скольжение по поверхности.** Курсор raycast'ит меш
   территории; маркер садится в точку касания. Высота = Y точки
   пересечения. (Домен: якорь панорамы — точка съёмки; для этой задачи
   принято класть его на поверхность.)
2. **Активация — отдельный режим «Move».** Тумблер (кнопка + хоткей `v`),
   зеркалит существующий `measureMode`. В режиме Move клик по маркеру
   тащит его, а НЕ входит в панораму. Вне режима — клик по-прежнему
   входит в панораму.
3. **Сохранение — авто на drop.** На отпускание — optimistic PUT через
   уже существующий `usePanoramas.update(id, { position })`. `yawOffset`
   и `title` сохраняются как есть (patch-семантика уже реализована).

## Что НЕ трогаем

Backend, OpenAPI/DTO, `panorama-gateway.ts`, домен `panorama.ts`
(`position` уже `Vec3`), `usePanoramas` (PUT/откат/toast уже есть),
`panorama-calibration-panel` (нёджи остаются как точная доводка),
`UIOverlay` (кнопка Move живёт в панораме, не в measure-тулбаре).

## Архитектура

Поток данных при перетаскивании:

```
[moveMode ON]
  pointerdown на маркере → drag.begin(id); OrbitControls.enabled = false
  pointermove над мешем территории → intersections[0].point → drag.move(point)
                                    → маркер рендерится в livePos (следует за курсором)
  pointerup → drag.end() → onCommit(id, livePos)
            → usePanoramas.update(id, { position: livePos })  (optimistic PUT + откат)
            → OrbitControls.enabled = true; состояние drag очищено
```

### Компоненты и границы

| Единица | Роль | Зависит от |
|---|---|---|
| `panorama/application/use-panorama-drag.ts` (**новый**) | Владеет `moveMode` + транзиентным drag-состоянием `{draggingId, livePos}`. API: `moveMode, draggingId, livePos, toggle, exit, begin, move, end`. `end` дёргает инъектированный `onCommit`. | `onCommit`, `Vec3` |
| `model-viewer.tsx` | Держит `use-panorama-drag` (onCommit = `updatePanoramaState(id,{position})`); `canMovePanorama = useCan()("panorama:write")`; координирует взаимоисключение с measure/selection; прокидывает вниз. | существующий |
| `scene-canvas.tsx` | Территория `raycastable={measureMode \|\| moveMode}`; на wrapper-`<group>` — `onPointerMove` (early-return вне drag) → `intersections[0].point` → `drag.move`; OrbitControls off на время drag (`useThree(s=>s.controls)` + эффект по `draggingId`); `invalidate()` на каждый move (frameloop="demand"); прокидывает `moveMode/draggingId/livePos` + handlers в markers-layer. | существующий |
| `panorama-markers-layer.tsx` | Прозрачный проброс новых пропов на каждый маркер. | — |
| `panorama-marker.tsx` | В `moveMode`: `onPointerDown` → `begin(id)` (вместо click→activate); курсор `grab`/`grabbing`; `pointer-events:none` пока этот маркер тащат (чтобы move проходил к канвасу); рендер в `livePos` если `id===draggingId`. Вне `moveMode` — поведение как сейчас. | `Panorama` |
| `panorama-section.tsx` | Кнопка-тумблер «Move / Moving» рядом с «Hide/Show panorama points», гейт `canWrite && panoramas.length>0`, `aria-pressed`. Стиль/токены — как у существующих кнопок секции (cyan/glass). | `moveMode`, `onToggleMove` |

### Взаимоисключение режимов (в `model-viewer.tsx`)

- Вход в Move → `measure.exit()` + `editor.setSelectedId(null)` (как measure
  сейчас сбрасывает selection).
- Вход в Measure → также `drag.exit()`.
- `handleEscape`: если `moveMode` активен — сначала выйти из него; порядок
  слоёв согласуется с текущей логикой Esc.
- Хоткей `v` → `drag.toggle` (свободен; занято `Esc/m/t/r/s/g/p`).

## Обработка ошибок и краевые случаи

- **PUT упал** → `usePanoramas.update` уже делает optimistic-откат + toast.
  Маркер визуально вернётся на прежнюю позицию.
- **Drop вне меша** (нет пересечения) → коммитим последнюю валидную
  `livePos`; если ни одного `move` не было (чистый клик) → no-op, маркер
  на месте.
- **Esc** во время drag / в режиме — выходит из режима, состояние drag
  очищено, OrbitControls восстановлен.
- **Права**: drag гейтится `panorama:write`. Флаг читается вне Canvas
  (context не пересекает R3F-границу) и идёт пропом, как `canEditPlacements`.
- **Активная панорама**: Move-режим требует 3D-вид (`!activePanorama`);
  маркеры и так рендерятся только там.

## Проверка

Юнит-тест на `use-panorama-drag`:
- `begin(1) → move(p1) → move(p2) → end()` вызывает `onCommit(1, p2)` и
  очищает `draggingId`/`livePos`.
- `begin(1) → end()` (без `move`) не вызывает `onCommit`.
- `exit()` во время drag очищает состояние без коммита.

## Соответствие правилам проекта

- Каждый новый/тронутый файл < 200 строк.
- Слои соблюдены: drag-логика в `application/`, рендер в
  `presentation/three/`, тумблер в `presentation/components/`.
- Нет спекулятивных абстракций: переиспользуются raycast-точка
  (measure-tool), OrbitControls-disable и optimistic-PUT (placement/панорама).

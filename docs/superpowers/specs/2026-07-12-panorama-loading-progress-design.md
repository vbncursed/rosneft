# Progress-bar при входе в панораму

**Дата:** 2026-07-12
**Контекст:** `frontend/src/panorama/`

## Проблема

При входе в панораму (клик по маяку-бикону или пикеру в панели) вызывается
`activate(id)` в `panorama/application/use-panorama-orchestration.ts:33`. Это:

1. Прячет территориальный GLB (`scene-canvas.tsx:239`,
   `visible={!activePanorama || calibrating}`).
2. Монтирует `PanoramaSphere`, который грузит большую equirect-картинку
   (Insta360 Pro, многомегабайтная JPG/PNG) через
   `useLoader(TextureLoader, assetUrl(panorama.sourceBlobHash))`
   (`panorama-sphere.tsx:54`).

Сфера обёрнута в `<Suspense fallback={null}>` (`panorama-scene-layer.tsx:47`),
а территория уже спрятана — поэтому **пока картинка качается (долго), юзер
видит пустой экран без индикатора**. Непонятно, идёт ли загрузка и сколько ждать.

## Цель

Показывать **честный процент загрузки** (0→100%) на весь экран, пока грузится
equirect. Как только текстура готова — переключаться на сферу. Никакого
пустого кадра.

## Ключевое техническое ограничение

`TextureLoader` / `ImageLoader` грузит картинку через элемент `<img>` и **не
отдаёт байтовый прогресс** — браузер по нему не эмитит `ProgressEvent`. Чтобы
показать реальный процент, нужно грузить equirect через **streaming `fetch()`**:
читать `response.body` (`ReadableStream`), считать `loaded / total` по заголовку
`Content-Length`, собрать все чанки в `Blob` → `createImageBitmap` →
`THREE.Texture`. Это убирает Suspense для сферы (прогресс нельзя срендерить из
компонента, который сам suspend-ится).

## Архитектура

Всё изменение локализовано в bounded context `panorama/`. Триггер входа
(`activate`), маяк, пикер, `model-viewer.tsx`, `ui-overlay.tsx` — **не трогаем**.

### 1. `panorama/application/use-panorama-texture.ts` (новый, ~50 строк)

Хук загрузки текстуры с прогрессом.

- **Вход:** активная панорама (или `null`).
- **Логика:** при смене `panorama.id` запускает `fetch(assetUrl(sourceBlobHash))`,
  стримит тело, аккумулирует прогресс. По завершении создаёт `THREE.Texture`
  из `ImageBitmap` (`texture.needsUpdate = true`, `colorSpace = SRGBColorSpace`,
  как сейчас в `panorama-sphere.tsx`). Предыдущий fetch отменяется через
  `AbortController` при быстром переключении панорам; собранный `ImageBitmap`/
  `Texture` освобождается (`.close()` / `.dispose()`) на cleanup.
- **Выход:** `{ texture: Texture | null, progress: number, status: 'idle' | 'loading' | 'ready' | 'error' }`.
- **Fallback:** если `Content-Length` отсутствует — `progress` остаётся `null`,
  UI показывает indeterminate-бар вместо процента.
- **Кэш:** свой `fetch` не кэшируется как `useLoader`, но URL immutable
  (hash-based) + ETag → браузер закэширует; повторный вход быстрый.
  Помечается `ponytail:`-комментарием.

### 2. `panorama/presentation/three/panorama-scene-layer.tsx` (правка)

Убрать `<Suspense fallback={null}>` вокруг сферы. Вызвать `usePanoramaTexture`.

- `status === 'loading'` → рендерить drei `<Html fullscreen>` с чёрным фоном и
  progress-баром по центру.
- `status === 'ready'` → рендерить `<PanoramaSphere texture={texture} …>` и
  `<PanoramaRig>`.
- `status === 'error'` → вызвать существующий `onPanoramaError`.

`PanoramaErrorBoundary` больше не нужен для перехвата suspense-throw (ошибка
теперь приходит из хука через `status`), но остаётся уместным как страховка —
решается на этапе имплементации.

### 3. `panorama/presentation/three/panorama-sphere.tsx` (правка)

Убрать `useLoader`. Принимать готовую `texture` пропсом. Сфера, `opacity`,
calibration — без изменений.

### 4. `panorama/presentation/components/panorama-loading-bar.tsx` (новый, ~20 строк)

Копия визуала `viewer/presentation/components/loading-progress.tsx`
(стеклянный cyan-бар) внутри panorama-контекста — чтобы не импортировать
presentation из чужого контекста (CLAUDE.md не санкционирует такой
кросс-контекстный импорт). Принимает `progress: number | null`; при `null`
рендерит indeterminate-анимацию.

## Поток данных

```
activate(id) → activePanoramaId set → panorama-scene-layer:
  usePanoramaTexture(activePanorama)
    ├─ loading → <Html fullscreen> + <PanoramaLoadingBar progress={p}/>
    ├─ ready   → <PanoramaSphere texture/> + <PanoramaRig/>
    └─ error   → onPanoramaError()
```

## Обработка ошибок

- Сетевая ошибка / non-2xx / abort-без-нового-запроса → `status: 'error'` →
  `onPanoramaError` (существующий путь показа ошибки).
- Отмена из-за переключения панорамы → тихо игнорируется (не error).
- Нет `Content-Length` → indeterminate-бар, загрузка продолжается нормально.

## Тестирование

- Runnable-проверка (ponytail): unit на логику прогресса в
  `use-panorama-texture` — мок стримящего `fetch`, проверка что `progress`
  монотонно растёт до 100 и `status` доходит до `ready`; отдельный кейс без
  `Content-Length` → `progress` null, `status` доходит до `ready`.
- Ручная проверка в браузере: вход в панораму показывает бар, растущий до
  100%, затем сфера; быстрое переключение панорам не роняет и не течёт по
  памяти.

## Ограничения (200 строк/файл)

Все новые и правленые файлы остаются в пределах лимита.

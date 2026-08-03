# Progressive LOD Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать территорию на грубом уровне детализации почти сразу после открытия, а полное качество догрузить фоном — без действий пользователя.

**Architecture:** Бэкенд перестаёт подавать LOD-проходу уже сжатый GLB и добавляет `gltfpack -ts`, чтобы младшие LOD теряли не только треугольники, но и пиксели текстур. Фронтенд получает чистую функцию выбора уровня, хук поверх неё и невидимый компонент-грелку: показывается самый грубый доступный LOD, целевой грузится в `<Suspense>` рядом и подменяет его по готовности.

**Tech Stack:** Go 1.26.5 (mesh-service, `gltfpack` из zeux/meshoptimizer), TypeScript + React 19, `@react-three/drei` `useGLTF`, vitest + `node --test`.

**Спека:** [`docs/superpowers/specs/2026-08-03-progressive-lod-design.md`](../specs/2026-08-03-progressive-lod-design.md)

## Global Constraints

- **Кап 200 строк на файл** — и в `frontend/` (ESLint `max-lines`, skipBlankLines + skipComments), и в `backend/` (проверяется руками).
- **`make -C backend check` обязателен перед каждым коммитом, трогающим Go.** ~80 с. Хук `.githooks/pre-commit` делает это сам после `make -C backend hooks`.
- **Никакого `"use client"`** во фронтенде — SPA без серверного рантайма.
- **Modern Go 1.26:** `t.Context()` в тестах, `for i := range n`, `errors.AsType[T]`, `new(val)` вместо `x := val; &x`.
- **Два тест-раннера во фронте:** чистая доменная логика → `node --test` (`*.test.ts`), jsdom/React → vitest (`*.spec.ts[x]`). Глобы не пересекаются.
- **Тесты в Go:** `testify/suite` для группировки + `gotest.tools/v3/assert` для утверждений (`assert.X(s.T(), …)`, не `s.Equal()`).
- **Слои фронтенда:** зависимости строго внутрь. `domain` не импортирует ничего наружу, `application` не импортирует `presentation`.
- **Работаем в ветке `dev`.** В `main` не коммитим — прод на нём.

---

## Порядок и точка отмены

Задачи 1–3 самодостаточны. **Задача 3 — точка отмены:** если замер покажет, что LOD2 не стал легче LOD0 хотя бы вчетверо, задачи 4–10 не выполняются, а работа останавливается для повторного разбора. Не «сделать всё равно».

---

## Структура файлов

**Backend, изменяемые:**
- `backend/services/mesh-service/internal/converter/convert.go` — делится на `convertRaw` (парс → normalize → GLB) и `finish` (compress → hash → результат). `Convert` становится их композицией.
- `backend/services/mesh-service/internal/converter/convert_lods.go` — берёт сырые байты у `convertRaw`, отдаёт их в `simplifyLOD`.
- `backend/services/mesh-service/internal/compression/simplify.go` — состав аргументов выносится в чистый `simplifyArgs`, туда добавляется `-ts`.

**Backend, создаваемые:**
- `backend/services/mesh-service/internal/converter/raw.go` — тип `rawGLB` и метод `convertRaw`. Отдельный файл, потому что `convert.go` уже 204 строки и после добавления не влезет в кап.
- `backend/services/mesh-service/internal/compression/simplify_test.go` — тест состава аргументов.

**Frontend, изменяемые:**
- `frontend/src/shared/domain/lod-artifact.ts` — добавляется `pickCoarsest` и `selectProgressive`.
- `frontend/src/shared/domain/lod-artifact.test.ts` — тесты к ним.
- `frontend/src/viewer/presentation/three/gltf-model.tsx` — территория переезжает на хук; протухший комментарий переписывается.
- `frontend/src/placement/presentation/three/placement-instance.tsx` — лестница отката (`chainRef`/`idx`) **удаляется** и заменяется хуком.
- `frontend/src/viewer/presentation/three/glb-preloader.tsx` — греет грубые уровни, а не LOD0.

**Frontend, создаваемые:**
- `frontend/src/viewer/application/use-progressive-lod.ts` — хук: состояние готовности и сломанных уровней.
- `frontend/src/viewer/application/use-progressive-lod.spec.tsx` — vitest.
- `frontend/src/viewer/presentation/three/lod-warmer.tsx` — невидимый компонент-грелка.

## Два отступления от спеки

Оба сознательные, оба надо помнить при ревью.

1. **`PlacementBody` не выносится в отдельный файл.** Спека закладывала вынос ради капа 200 строк. Не понадобится: хук **заменяет** существующую лестницу отката, а не добавляется к ней, и файл становится короче исходных 174 строк. Шаг с проверкой линтером в задаче 8 это подтверждает — а если линтер всё же сработает, это признак, что правка отклонилась от плана, и разбираться надо с ней, а не глушить выносом.

2. **Свап не покрывается рендер-тестом.** Спека обещала vitest-проверку «грубый виден до готовности, целевой заменяет его после». В репозитории нет тест-рендерера для react-three-fiber, и заводить его ради трёх утверждений — отдельная работа с собственной ценой. Вместо этого вся логика свапа вынесена в чистую функцию (задача 4, `node --test`) и хук (задача 5, vitest с `renderHook`) — то есть покрыто всё, кроме одной строки JSX, которая монтирует `<LodWarmer>`. Эта строка проверяется живым прогоном в задачах 7 и 8, где она и ломается заметно.

## Порядок выкатки на прод

Не переставлять: **воркер → переконвертация территорий → фронт**. Обратный порядок даёт фронт, который просит грубый уровень ради ускорения и получает тот же тяжёлый файл, что и раньше, плюс лишний запрос. Фронт при этом безопасен на непереконвертированных данных — цепочка из одного LOD0 даёт `warmUrl: null` и сегодняшнее поведение, — так что рассинхрон не ломает, а лишь не ускоряет.

---

### Task 1: Отделить сырой GLB от сжатого

Сегодня `ConvertLODs` упрощает уже сжатый GLB: `Convert` вызывает `compress()` перед возвратом (`convert.go:56-60`), а `convert_lods.go:39` передаёт `base.Content` в `simplifyLOD`. Значит gltfpack получает на вход геометрию в Draco и текстуры в Basis Universal — пережать текстуры он оттуда не сможет. Эта задача разводит сырые байты и сжатые, ничего не меняя в наблюдаемом поведении.

**Files:**
- Create: `backend/services/mesh-service/internal/converter/raw.go`
- Modify: `backend/services/mesh-service/internal/converter/convert.go` (строки 27-77)
- Modify: `backend/services/mesh-service/internal/converter/convert_lods.go` (строки 21-52)
- Test: `backend/services/mesh-service/internal/converter/convert_lods_test.go`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces: `type rawGLB struct { content []byte; vertices, faces uint64; bboxMin, bboxMax domain.Vec3 }`; `func (c *Converter) convertRaw(ctx context.Context, sourcePath string) (rawGLB, error)`; `func (c *Converter) finish(ctx context.Context, raw rawGLB) (domain.ConversionResult, error)`. Публичные `Convert` и `ConvertLODs` сохраняют сигнатуры.

- [ ] **Step 1: Заменить тестовый дублёр настоящим `ConvertLODs`**

`convert_lods_test.go:41-54` содержит хелпер `simplifyLODs` — копию цикла из `ConvertLODs`, написанную «чтобы не нужен был настоящий OBJ». Именно поэтому три существующих теста прошли бы и с дефектом, который мы чиним: они проверяют копию, а не оригинал. Хелпер удаляется, тесты переписываются против настоящей функции, а OBJ пишется во временный файл — четыре строки текста.

Заменить `convert_lods_test.go` целиком на:

```go
package converter

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

// fakePostprocessor satisfies the converter's Compressor interface.
type fakePostprocessor struct {
	compressFn func(ctx context.Context, glb []byte) ([]byte, error)
	simplifyFn func(ctx context.Context, glb []byte, ratio float64) ([]byte, error)
}

func (f *fakePostprocessor) Compress(ctx context.Context, glb []byte) ([]byte, error) {
	if f.compressFn != nil {
		return f.compressFn(ctx, glb)
	}
	return glb, nil
}

func (f *fakePostprocessor) Simplify(ctx context.Context, glb []byte, ratio float64) ([]byte, error) {
	return f.simplifyFn(ctx, glb, ratio)
}

type ConvertLODsSuite struct {
	suite.Suite
	objPath string
}

func TestConvertLODsSuite(t *testing.T) {
	suite.Run(t, new(ConvertLODsSuite))
}

// SetupTest writes a one-triangle OBJ so the tests exercise the real
// ConvertLODs instead of a copy of its loop. The previous version of this
// file duplicated that loop in the test to avoid needing a file — which is
// exactly why it could stay green while ConvertLODs was wrong.
func (s *ConvertLODsSuite) SetupTest() {
	dir := s.T().TempDir()
	s.objPath = filepath.Join(dir, "tri.obj")
	obj := "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
	assert.NilError(s.T(), os.WriteFile(s.objPath, []byte(obj), 0o600))
}

func (s *ConvertLODsSuite) TestNoCompressor_returnsLOD0Only() {
	c := &Converter{lodRatios: []float64{0.5}}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 1)
}

func (s *ConvertLODsSuite) TestAppendsForEachRatio() {
	calls := 0
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, _ float64) ([]byte, error) {
			calls++
			return []byte("simplified"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 3)
	assert.Equal(s.T(), calls, 2)
	assert.Equal(s.T(), out[1].ContentType, "model/gltf-binary")
}

func (s *ConvertLODsSuite) TestPerLODErrorTolerated() {
	pp := &fakePostprocessor{
		simplifyFn: func(_ context.Context, _ []byte, ratio float64) ([]byte, error) {
			if ratio == 0.25 {
				return nil, errors.New("encoder boom")
			}
			return []byte("ok"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(out), 2) // LOD0 + LOD1; LOD2 dropped
}

// TestSimplifiesRawNotCompressed is the regression this whole task exists for.
// gltfpack cannot decode Basis Universal, so a LOD pass fed the compressed
// artifact can only touch geometry and every LOD keeps full-resolution
// textures.
func (s *ConvertLODsSuite) TestSimplifiesRawNotCompressed() {
	var seen [][]byte
	pp := &fakePostprocessor{
		compressFn: func(_ context.Context, _ []byte) ([]byte, error) {
			return []byte("COMPRESSED"), nil
		},
		simplifyFn: func(_ context.Context, glb []byte, _ float64) ([]byte, error) {
			seen = append(seen, glb)
			return []byte("ok"), nil
		},
	}
	c := &Converter{compressor: pp, lodRatios: []float64{0.5, 0.25}}

	out, err := c.ConvertLODs(s.T().Context(), s.objPath)

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(out[0].Content), "COMPRESSED")
	assert.Equal(s.T(), len(seen), 2)
	for _, got := range seen {
		assert.Assert(s.T(), string(got) != "COMPRESSED",
			"LOD pass received the compressed artifact, not the raw GLB")
		assert.Assert(s.T(), len(got) > 0)
	}
}
```

- [ ] **Step 2: Убедиться, что тест падает по правильной причине**

```bash
cd backend/services/mesh-service && go test ./internal/converter/ -run TestConvertLODsSuite -v
```

Ожидается: `TestSimplifiesRawNotCompressed` — FAIL с сообщением «LOD pass received the compressed artifact, not the raw GLB». Остальные четыре — PASS: они описывают поведение, которое не меняется. Если падает что-то ещё — разобраться до продолжения.

- [ ] **Step 3: Вынести `convertRaw` в новый файл**

Создать `backend/services/mesh-service/internal/converter/raw.go`:

```go
package converter

import (
	"context"
	"fmt"
	"os"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// rawGLB is the converter's output before any gltfpack pass: plain glTF with
// uncompressed geometry and the source's own JPEG/PNG textures still embedded.
//
// Keeping this separate from ConversionResult is what lets ConvertLODs hand
// gltfpack an input it can actually re-encode. Feeding it the compressed LOD0
// instead means the textures arrive as Basis Universal, which gltfpack cannot
// decode — so `-ts` would silently do nothing and every LOD would ship
// full-resolution textures.
type rawGLB struct {
	content  []byte
	vertices uint64
	faces    uint64
	bboxMin  domain.Vec3
	bboxMax  domain.Vec3
}

// convertRaw runs the pure conversion pipeline: parse OBJ, normalize
// (Z-up→Y-up, center, scale to maxDim=2), resolve materials, emit GLB.
// No external binary is involved, so the result is deterministic.
func (c *Converter) convertRaw(ctx context.Context, sourcePath string) (rawGLB, error) {
	if err := ctx.Err(); err != nil {
		return rawGLB{}, err
	}
	f, err := os.Open(sourcePath)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: open %q: %w", sourcePath, err)
	}
	defer func() { _ = f.Close() }()

	report(ctx, "parsing", 0.30)
	src, err := parseOBJ(f)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: parse: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return rawGLB{}, err
	}

	report(ctx, "encoding", 0.45)
	origMin, origMax := normalize(src.positions)

	materials := buildGLMaterials(ctx, src, sourcePath)

	body, err := writeGLB(src.positions, src.uvs, src.groups, materials)
	if err != nil {
		return rawGLB{}, fmt.Errorf("converter: write: %w", err)
	}

	totalTris := uint64(0)
	for _, g := range src.groups {
		totalTris += uint64(len(g.triangles))
	}
	return rawGLB{
		content:  body,
		vertices: uint64(len(src.positions)),
		faces:    totalTris,
		bboxMin:  domain.Vec3{X: float64(origMin[0]), Y: float64(origMin[1]), Z: float64(origMin[2])},
		bboxMax:  domain.Vec3{X: float64(origMax[0]), Y: float64(origMax[1]), Z: float64(origMax[2])},
	}, nil
}
```

- [ ] **Step 4: Свести `Convert` к композиции**

В `convert.go` заменить тело функции `Convert` (строки 27-77) на:

```go
func (c *Converter) Convert(ctx context.Context, sourcePath string) (domain.ConversionResult, error) {
	raw, err := c.convertRaw(ctx, sourcePath)
	if err != nil {
		return domain.ConversionResult{}, err
	}
	return c.finish(ctx, raw)
}

// finish applies the optional gltfpack pass to a raw GLB and packages the
// bytes as a catalog-ready artifact. Split out of Convert so ConvertLODs can
// produce LOD0 from the same raw bytes it then simplifies.
func (c *Converter) finish(ctx context.Context, raw rawGLB) (domain.ConversionResult, error) {
	report(ctx, "compressing", 0.55)
	body, err := c.compress(ctx, raw.content)
	if err != nil {
		return domain.ConversionResult{}, err
	}
	sum := sha256.Sum256(body)
	return domain.ConversionResult{
		ArtifactHash: hex.EncodeToString(sum[:]),
		Content:      body,
		ContentType:  "model/gltf-binary",
		Size:         int64(len(body)),
		Vertices:     raw.vertices,
		Faces:        raw.faces,
		BBoxMin:      raw.bboxMin,
		BBoxMax:      raw.bboxMax,
	}, nil
}
```

Импорты `convert.go` при этом не меняются: `os`, `errors`, `log/slog`, `path/filepath`, `strings` продолжают использоваться функциями ниже по файлу (`loadMTL`, `loadTexture`, `mimeFromPath`), а `crypto/sha256`, `encoding/hex`, `fmt`, `context` и `domain` — новой `finish`. Проверяется сборкой на шаге 6, а не глазами.

- [ ] **Step 5: Переключить `ConvertLODs` на сырые байты**

В `convert_lods.go` заменить строки 21-30 на:

```go
func (c *Converter) ConvertLODs(ctx context.Context, sourcePath string) ([]domain.ConversionResult, error) {
	raw, err := c.convertRaw(ctx, sourcePath)
	if err != nil {
		return nil, err
	}
	base, err := c.finish(ctx, raw)
	if err != nil {
		return nil, err
	}
	out := []domain.ConversionResult{base}
	if c.compressor == nil || len(c.lodRatios) == 0 {
		return out, nil
	}
```

И в цикле заменить строку 39:

```go
		lod, err := c.simplifyLOD(ctx, raw.content, ratio)
```

В докблоке `ConvertLODs` (строки 13-20) заменить фразу «plus one additional LOD artifact per configured ratio» на явное упоминание источника:

```go
// ConvertLODs produces LOD0 (full quality) plus one additional LOD artifact
// per configured ratio. Every LOD — including LOD0 — is derived from the same
// uncompressed GLB, never from LOD0's compressed bytes: gltfpack cannot decode
// Basis Universal textures, so simplifying the compressed artifact would leave
// every LOD carrying full-resolution textures.
```

- [ ] **Step 6: Прогнать тесты пакета**

```bash
cd backend/services/mesh-service && go test ./internal/converter/ -v
```

Ожидается: PASS во всём пакете, включая `TestSimplifiesRawNotCompressed`, `TestAppendsForEachRatio`, `TestPerLODErrorTolerated`, а также существующие `parse_obj_test.go` и `normalize_test.go`.

- [ ] **Step 7: Проверить кап строк**

```bash
wc -l backend/services/mesh-service/internal/converter/convert.go \
      backend/services/mesh-service/internal/converter/raw.go \
      backend/services/mesh-service/internal/converter/convert_lods.go
```

Ожидается: все три файла ≤ 200 строк. Если `convert.go` всё ещё длиннее — вынести `loadMTL`/`loadTexture`/`mimeFromPath` в `materials.go`, они образуют одну связную группу.

- [ ] **Step 8: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/mesh-service/internal/converter/
git commit -m "refactor(mesh): derive LODs from the raw GLB, not from compressed LOD0

gltfpack cannot decode Basis Universal, so a simplification pass fed the
compressed artifact can only touch geometry. Splitting convertRaw out of
Convert lets ConvertLODs hand every pass an input it can actually re-encode.

No behaviour change yet: the ratio flags are unchanged."
```

---

### Task 2: Уменьшать текстуры вместе с геометрией

**Files:**
- Modify: `backend/services/mesh-service/internal/compression/simplify.go` (строки 19-55)
- Create: `backend/services/mesh-service/internal/compression/simplify_test.go`

**Interfaces:**
- Consumes: `rawGLB.content` из задачи 1 приходит в `Simplify` как `glb`.
- Produces: `func (o *Optimizer) simplifyArgs(in, out string, ratio float64) []string` — чистая функция состава argv, единственное, что можно проверить без бинарника.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/services/mesh-service/internal/compression/simplify_test.go`:

```go
package compression

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type SimplifyArgsSuite struct {
	suite.Suite
}

func TestSimplifyArgsSuite(t *testing.T) {
	suite.Run(t, new(SimplifyArgsSuite))
}

// argValue returns the token following flag, or "" when the flag is absent.
func argValue(args []string, flag string) string {
	i := slices.Index(args, flag)
	if i < 0 || i+1 >= len(args) {
		return ""
	}
	return args[i+1]
}

func (s *SimplifyArgsSuite) TestScalesTexturesByTheSameRatio() {
	o := New("gltfpack", WithDraco(), WithKTX2())

	args := o.simplifyArgs("in.glb", "out.glb", 0.25)

	assert.Equal(s.T(), argValue(args, "-si"), "0.25")
	assert.Equal(s.T(), argValue(args, "-ts"), "0.25")
}

func (s *SimplifyArgsSuite) TestKeepsTheBaseFlags() {
	o := New("gltfpack", WithDraco(), WithKTX2())

	args := o.simplifyArgs("in.glb", "out.glb", 0.5)

	// -tc is what makes -ts take effect: gltfpack resizes textures while
	// encoding them, so a build without KTX2 silently ignores the scale.
	for _, want := range []string{"-noq", "-kn", "-km", "-ke", "-cc", "-tc"} {
		assert.Assert(s.T(), slices.Contains(args, want), "missing %s", want)
	}
	assert.Equal(s.T(), argValue(args, "-i"), "in.glb")
	assert.Equal(s.T(), argValue(args, "-o"), "out.glb")
}
```

- [ ] **Step 2: Убедиться, что тест не компилируется**

```bash
cd backend/services/mesh-service && go test ./internal/compression/ -run TestSimplifyArgsSuite
```

Ожидается: FAIL с `o.simplifyArgs undefined (type *Optimizer has no field or method simplifyArgs)`.

- [ ] **Step 3: Реализовать**

В `simplify.go` заменить строки 39-41 на вызов новой функции и добавить саму функцию в конец файла:

```go
	args := o.simplifyArgs(in, out, ratio)
```

```go
// simplifyArgs is the argv for one LOD pass: the shared gltfpack flags plus
// simplification.
//
// `-ts` takes the SAME ratio as `-si` and is the reason lower LODs are
// smaller on the wire at all. `-si` drops triangles, which for photogrammetry
// is the minority of the bytes; the textures are the bulk, and without `-ts`
// every LOD ships them at full resolution. The ratio is linear per side, so
// -si 0.25 pairs with 16x fewer texture pixels.
//
// `-ts` only bites while gltfpack is encoding textures, i.e. together with
// `-tc`. With MESH_KTX2_ENABLED=false the flag is inert and LODs stay as heavy
// as they were before this pass existed. That is acceptable: KTX2 is on by
// default, and a build without it already ships deliberately larger files.
func (o *Optimizer) simplifyArgs(in, out string, ratio float64) []string {
	r := strconv.FormatFloat(ratio, 'f', -1, 64)
	return append(o.buildArgs(in, out), "-si", r, "-ts", r)
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
cd backend/services/mesh-service && go test ./internal/compression/ -run TestSimplifyArgsSuite -v
```

Ожидается: PASS обоих тестов сьюта.

- [ ] **Step 5: Обновить докблок `Simplify`**

В `simplify.go` заменить строки 12-18 на:

```go
// Simplify reduces mesh polygon count to roughly `ratio` of the input and
// scales texture dimensions by the same ratio, then applies the Optimizer's
// usual Draco/KTX2 settings. Used by the worker to emit lower-LOD artifacts
// alongside LOD0.
//
// The input MUST be an uncompressed GLB — see rawGLB in the converter package
// for why passing the compressed LOD0 makes the texture scaling a no-op.
//
// Ratio MUST be in (0, 1); values outside that range return an error.
```

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
git add backend/services/mesh-service/internal/compression/
git commit -m "feat(mesh): scale LOD textures by the simplification ratio

-si sheds triangles, which on photogrammetry sources is the minority of the
bytes. Without -ts every LOD carried full-resolution textures, so LOD2 weighed
roughly as much as LOD0 and was useless as a fast first paint."
```

---

### Task 3: Замер — точка отмены

Ничего не пишется. Здесь выясняется, стоило ли всё остальное затевать.

**Files:** нет.

**Interfaces:**
- Consumes: собранный образ `mesh-worker` из задач 1-2.
- Produces: числа для решения, идти ли дальше, и для критериев готовности.

- [ ] **Step 1: Пересобрать воркер и убедиться, что образ действительно новый**

```bash
cd /Users/vbncursed/programming/rosneft
docker compose build mesh-worker
docker image inspect andrey-mesh-worker --format '{{.Created}}'
docker compose up -d mesh-worker
```

Ожидается: `Created` — сегодняшняя метка времени. **Это не формальность:** `docker compose build` умеет молча оставить старый образ и написать «Started»; за одну прошлую сессию ловушка сработала трижды. Если метка старая — сборка не состоялась, и любые выводы ниже будут выводами о старом коде.

- [ ] **Step 2: Записать размеры «до»**

```bash
curl -s -b cookies.txt http://localhost:8080/api/territories/dji-wp-46-cut/scene \
  | jq '.artifact.artifacts[] | {lod, size}'
```

Ожидается: три строки, LOD0/1/2. Записать значения — это база сравнения.

- [ ] **Step 3: Переконвертировать территорию**

Взять `sourceBlobHash` территории и отправить его же обратно — `ReplaceTerritorySource` удалит артефакты и поставит job:

```bash
HASH=$(curl -s -b cookies.txt http://localhost:8080/api/territories/dji-wp-46-cut | jq -r .sourceBlobHash)
CSRF=$(curl -s -b cookies.txt http://localhost:8080/api/auth/me | jq -r .csrfToken)
curl -s -b cookies.txt -X POST \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"sourceBlobHash\":\"$HASH\"}" \
  http://localhost:8080/api/territories/dji-wp-46-cut/source
```

`POST`, не `PUT` — операция `ReplaceTerritorySource` объявлена на `POST /api/territories/{slug}/source` (`api/openapi.yaml:950`). Заголовок `X-CSRF-Token` обязателен, потому что сессия пришла кукой; Bearer-вызов от него освобождён.

Ожидается: ответ с `job`. Дождаться `succeeded`, засекая время:

```bash
time (while [ "$(curl -s -b cookies.txt http://localhost:8080/api/jobs/$JOB/events --max-time 600 | grep -c succeeded)" = "0" ]; do sleep 5; done)
```

- [ ] **Step 4: Записать размеры «после» и решить**

Повторить команду из шага 2.

**Критерий прохода: `size` LOD2 ≤ 25% от `size` LOD0.**

- Прошло → продолжаем с задачи 4.
- Не прошло → **остановиться и не выполнять задачи 4-10.** Сообщить заказчику числа и разобраться, из чего состоит вес файла: возможно, доминируют не текстуры, и тогда правильная работа — другая. Задачи 1-2 при этом не откатываются: они делают конвейер честнее в любом случае.

- [ ] **Step 5: Записать время конверсии**

Сравнить с ожиданием из спеки: рост не более чем в полтора раза. Если больше — не блокер для продолжения, но число попадает в отчёт и в PR.

---

### Task 4: Чистая функция выбора уровня

**Files:**
- Modify: `frontend/src/shared/domain/lod-artifact.ts`
- Test: `frontend/src/shared/domain/lod-artifact.test.ts`

**Interfaces:**
- Consumes: существующие `LodArtifact`, `orderByPreferred`, `pickLod` из того же модуля.
- Produces:
  - `function pickCoarsest(chain: LodArtifact[]): LodArtifact | null`
  - `interface ProgressiveSelection { show: LodArtifact | null; warm: LodArtifact | null }`
  - `function selectProgressive(chain: LodArtifact[], targetLod: number, ready: boolean): ProgressiveSelection`

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `frontend/src/shared/domain/lod-artifact.test.ts`:

```ts
test("pickCoarsest returns the highest lod number", () => {
  assert.equal(pickCoarsest(CHAIN)?.lod, 2);
});

test("pickCoarsest on an empty chain is null", () => {
  assert.equal(pickCoarsest([]), null);
});

test("before ready, show the coarsest and warm the target", () => {
  const sel = selectProgressive(CHAIN, 0, false);
  assert.equal(sel.show?.lod, 2);
  assert.equal(sel.warm?.lod, 0);
});

test("once ready, show the target and warm nothing", () => {
  const sel = selectProgressive(CHAIN, 0, true);
  assert.equal(sel.show?.lod, 0);
  assert.equal(sel.warm, null);
});

test("a single-entry chain never warms — there is nothing to upgrade to", () => {
  const sel = selectProgressive([lod(0)], 0, false);
  assert.equal(sel.show?.lod, 0);
  assert.equal(sel.warm, null);
});

test("an empty chain selects nothing", () => {
  const sel = selectProgressive([], 0, false);
  assert.equal(sel.show, null);
  assert.equal(sel.warm, null);
});

test("a target that is itself the coarsest never warms", () => {
  const sel = selectProgressive(CHAIN, 2, false);
  assert.equal(sel.show?.lod, 2);
  assert.equal(sel.warm, null);
});
```

Дописать импорты в строке 5 файла:

```ts
import {
  orderByPreferred,
  pickLod,
  pickCoarsest,
  selectProgressive,
  type LodArtifact,
} from "./lod-artifact.ts";
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
cd frontend && yarn test
```

Ожидается: FAIL — `pickCoarsest is not a function` / `selectProgressive is not a function`.

- [ ] **Step 3: Реализовать**

Дописать в конец `frontend/src/shared/domain/lod-artifact.ts`:

```ts
// pickCoarsest returns the entry with the highest lod number — the cheapest
// thing in the chain to download, and therefore what a progressive load shows
// first. Null only when the chain is empty.
export function pickCoarsest(chain: LodArtifact[]): LodArtifact | null {
  return chain.reduce<LodArtifact | null>(
    (best, a) => (best === null || a.lod > best.lod ? a : best),
    null,
  );
}

// ProgressiveSelection splits "what is on screen" from "what is downloading
// behind it". `warm` is null whenever there is nothing left to upgrade to —
// either because the target already arrived, or because it IS the coarsest.
export interface ProgressiveSelection {
  show: LodArtifact | null;
  warm: LodArtifact | null;
}

// selectProgressive decides both at once. Before the target has loaded, the
// coarsest entry is shown and the target warms; afterwards the target is shown
// and nothing warms. Keeping this pure is what makes the swap testable without
// a WebGL context.
export function selectProgressive(
  chain: LodArtifact[],
  targetLod: number,
  ready: boolean,
): ProgressiveSelection {
  const target = pickLod(chain, targetLod);
  if (target === null) return { show: null, warm: null };
  const coarsest = pickCoarsest(chain);
  if (ready || coarsest === null || coarsest.lod === target.lod) {
    return { show: target, warm: null };
  }
  return { show: coarsest, warm: target };
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
cd frontend && yarn test
```

Ожидается: PASS всех тестов файла, включая шесть новых.

- [ ] **Step 5: Проверить кап и линтер**

```bash
cd frontend && yarn lint && wc -l src/shared/domain/lod-artifact.ts
```

Ожидается: линтер чист, файл ≤ 200 строк (`max-lines` считает без пустых строк и комментариев, но проверить глазами тоже стоит).

- [ ] **Step 6: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/shared/domain/lod-artifact.ts frontend/src/shared/domain/lod-artifact.test.ts
git commit -m "feat(frontend): pure LOD selection for progressive loading

selectProgressive splits what is on screen from what is downloading behind it,
so the swap logic is testable without a WebGL context."
```

---

### Task 5: Хук готовности и сломанных уровней

Хук заменяет собой и лестницу отката плейсмента (`placement-instance.tsx:53-71`), и жёсткий выбор LOD0 у территории.

**Files:**
- Create: `frontend/src/viewer/application/use-progressive-lod.ts`
- Test: `frontend/src/viewer/application/use-progressive-lod.spec.tsx`

**Interfaces:**
- Consumes: `selectProgressive`, `pickLod`, `LodArtifact` из задачи 4; `lodUrl` из `@/shared/application/lod-url`.
- Produces:
  ```ts
  interface ProgressiveLod {
    url: string | null;      // что рендерить сейчас
    warmUrl: string | null;  // что грузить невидимо; null — грузить нечего
    onWarmReady: () => void; // вызывает LodWarmer, когда целевой LOD загрузился
    onFailed: () => void;    // вызывает граница ошибок, когда упал ПОКАЗЫВАЕМЫЙ url
  }
  function useProgressiveLod(chain: LodArtifact[], targetLod?: number): ProgressiveLod
  ```

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/viewer/application/use-progressive-lod.spec.tsx`:

```tsx
// Run with: yarn test:spa  (vitest + jsdom).
import { test, afterEach } from "vitest";
import assert from "node:assert/strict";

import { renderHook, act } from "@/test-support/render-hook";
import { useProgressiveLod } from "./use-progressive-lod";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

const lod = (n: number): LodArtifact => ({ lod: n, hash: `h${n}`, size: 100 - n });
const CHAIN = [lod(0), lod(1), lod(2)];

const mounted: (() => void)[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function bind(chain: LodArtifact[], target = 0) {
  const h = renderHook(() => useProgressiveLod(chain, target));
  mounted.push(h.unmount);
  return h;
}

test("starts on the coarsest level and warms the target", () => {
  const { result } = bind(CHAIN);
  assert.match(result.current.url!, /h2$/);
  assert.match(result.current.warmUrl!, /h0$/);
});

test("swaps to the target once the warmer reports it loaded", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onWarmReady());
  assert.match(result.current.url!, /h0$/);
  assert.equal(result.current.warmUrl, null);
});

test("a chain with only LOD0 warms nothing", () => {
  const { result } = bind([lod(0)]);
  assert.match(result.current.url!, /h0$/);
  assert.equal(result.current.warmUrl, null);
});

test("a failed displayed level drops out of the chain", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onFailed());
  // h2 is gone; the coarsest remaining is h1.
  assert.match(result.current.url!, /h1$/);
});

test("failing every level leaves nothing to render", () => {
  const { result } = bind(CHAIN);
  act(() => result.current.onFailed());
  act(() => result.current.onFailed());
  act(() => result.current.onFailed());
  assert.equal(result.current.url, null);
});

test("an empty chain renders nothing and warms nothing", () => {
  const { result } = bind([]);
  assert.equal(result.current.url, null);
  assert.equal(result.current.warmUrl, null);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
cd frontend && yarn test:spa src/viewer/application/use-progressive-lod.spec.tsx
```

Ожидается: FAIL — модуль `./use-progressive-lod` не найден.

- [ ] **Step 3: Реализовать**

Создать `frontend/src/viewer/application/use-progressive-lod.ts`:

```ts
import { useCallback, useMemo, useState } from "react";
import {
  pickLod,
  selectProgressive,
  type LodArtifact,
} from "@/shared/domain/lod-artifact";
import { lodUrl } from "@/shared/application/lod-url";

export interface ProgressiveLod {
  url: string | null;
  warmUrl: string | null;
  onWarmReady: () => void;
  onFailed: () => void;
}

// useProgressiveLod shows the cheapest level in the chain immediately and
// upgrades to the target once it has downloaded.
//
// Readiness is keyed by the target's content hash rather than a boolean, so a
// chain that changes underneath (the asset was reconverted, the placement now
// points at a different model) resets itself without any derived-state dance:
// the new target has a different hash, so `ready` is false again.
//
// Failed levels are tracked by hash too and simply drop out of the chain,
// which is what the placement's old fallback ladder did by index. Doing it
// here means the territory gets the same protection, and it had none.
export function useProgressiveLod(
  chain: LodArtifact[],
  targetLod = 0,
): ProgressiveLod {
  const [readyHash, setReadyHash] = useState<string | null>(null);
  const [broken, setBroken] = useState<string[]>([]);

  const available = useMemo(
    () => chain.filter((a) => !broken.includes(a.hash)),
    [chain, broken],
  );
  const target = pickLod(available, targetLod);
  const ready = target !== null && readyHash === target.hash;
  const { show, warm } = selectProgressive(available, targetLod, ready);

  const showHash = show?.hash ?? null;
  const targetHash = target?.hash ?? null;

  const onWarmReady = useCallback(() => setReadyHash(targetHash), [targetHash]);
  const onFailed = useCallback(() => {
    if (showHash === null) return;
    setBroken((prev) => (prev.includes(showHash) ? prev : [...prev, showHash]));
  }, [showHash]);

  return {
    url: show ? lodUrl(show) : null,
    warmUrl: warm ? lodUrl(warm) : null,
    onWarmReady,
    onFailed,
  };
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
cd frontend && yarn test:spa src/viewer/application/use-progressive-lod.spec.tsx
```

Ожидается: PASS всех шести тестов.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
cd frontend && yarn lint && cd ..
git add frontend/src/viewer/application/use-progressive-lod.ts \
        frontend/src/viewer/application/use-progressive-lod.spec.tsx
git commit -m "feat(frontend): useProgressiveLod hook

Keys readiness by the target's content hash so a changed chain resets itself,
and folds the placement's index-based fallback ladder into the same state."
```

---

### Task 6: Невидимая грелка

**Files:**
- Create: `frontend/src/viewer/presentation/three/lod-warmer.tsx`

**Interfaces:**
- Consumes: `extendGltfLoader` из `@/viewer/presentation/three/gltf-loader-setup`, `LodErrorBoundary` из `@/viewer/presentation/three/lod-error-boundary`.
- Produces: `export default function LodWarmer({ url, onReady }: { url: string; onReady: () => void }): JSX.Element`

- [ ] **Step 1: Реализовать**

Создать `frontend/src/viewer/presentation/three/lod-warmer.tsx`:

```tsx
import { Suspense, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";

function Warm({ url, onReady }: { url: string; onReady: () => void }) {
  // Suspends until the GLB is parsed. drei caches by URL, so the component
  // that swaps in afterwards gets a cache hit rather than a second fetch.
  useGLTF(url, true, true, extendGltfLoader);
  useEffect(() => {
    onReady();
  }, [url, onReady]);
  return null;
}

// LodWarmer downloads a higher-quality LOD without putting it on screen. The
// caller keeps rendering the coarse level until onReady fires.
//
// ponytail: the coarse level stays in drei's cache after the swap, so a scene
// holds both levels in VRAM. Deliberate — the cache is keyed by URL and shared,
// so several placements of one model share a single entry, and clearing on
// unmount would pull the buffer out from under the others. If VRAM becomes the
// binding constraint, the upgrade path is a refcounted useGLTF.clear once every
// consumer of the coarse URL has let go.
//
// The error boundary deliberately swallows: if the high-quality level cannot
// load, the right outcome is to stay on the coarse one, which is already
// visible and correct. That is the opposite of the boundary's other caller,
// which walks DOWN the chain on failure — here there is nowhere left to walk.
export default function LodWarmer({
  url,
  onReady,
}: {
  url: string;
  onReady: () => void;
}) {
  return (
    <LodErrorBoundary resetKey={url} onError={noop}>
      <Suspense fallback={null}>
        <Warm url={url} onReady={onReady} />
      </Suspense>
    </LodErrorBoundary>
  );
}

function noop() {}
```

- [ ] **Step 2: Проверить сборку и линтер**

```bash
cd frontend && yarn lint && yarn build
```

Ожидается: обе команды без ошибок. `yarn build` здесь нужен потому, что компонент пока никем не используется — ошибка типизации иначе всплывёт только в следующей задаче.

- [ ] **Step 3: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/viewer/presentation/three/lod-warmer.tsx
git commit -m "feat(frontend): LodWarmer — download a LOD without showing it"
```

---

### Task 7: Территория грузится прогрессивно

**Files:**
- Modify: `frontend/src/viewer/presentation/three/gltf-model.tsx` (строки 1-6 импорты, 69-83 тело)

**Interfaces:**
- Consumes: `useProgressiveLod` из задачи 5, `LodWarmer` из задачи 6.
- Produces: поведение `GltfModel`; сигнатура пропсов не меняется, `scene-canvas.tsx:241` править не нужно.

- [ ] **Step 1: Заменить импорты**

В `gltf-model.tsx` заменить строки 4-6 на:

```tsx
import { pickLod, type LodArtifact } from "@/shared/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import { useProgressiveLod } from "@/viewer/application/use-progressive-lod";
import LodWarmer from "@/viewer/presentation/three/lod-warmer";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";
```

Импорт `assetUrl` (строка 4) удалить — URL теперь строит хук. Импорт `pickLod` остаётся в списке только если он ещё где-то нужен; после правки тела он не нужен, и его надо убрать, иначе линтер ругнётся на неиспользуемый импорт.

Итоговая строка 4-8:

```tsx
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import { useProgressiveLod } from "@/viewer/application/use-progressive-lod";
import LodWarmer from "@/viewer/presentation/three/lod-warmer";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";
```

- [ ] **Step 2: Переписать тело и протухший комментарий**

Заменить строки 69-83 (комментарий и функцию `GltfModel`) на:

```tsx
// GltfModel renders the territory progressively: the coarsest level in the
// chain mounts first so there is something on screen while LOD0 is still on
// the wire, then LOD0 replaces it.
//
// This is NOT drei's <Detailed>: the level on screen does not depend on camera
// distance. A territory is usually framed whole, so distance-based switching
// would leave it coarse forever, and the measure tool's raycast would land on
// different geometry depending on zoom.
export default function GltfModel({ lods, raycastable, groupRef }: GltfModelProps) {
  const { url, warmUrl, onWarmReady, onFailed } = useProgressiveLod(lods, 0);
  if (!url) return null;
  return (
    <>
      <LodErrorBoundary resetKey={url} onError={onFailed}>
        <Suspense fallback={null}>
          <GltfPrimitive url={url} raycastable={raycastable} groupRef={groupRef} />
        </Suspense>
      </LodErrorBoundary>
      {warmUrl && <LodWarmer url={warmUrl} onReady={onWarmReady} />}
    </>
  );
}
```

- [ ] **Step 3: Проверить сборку, линтер и кап**

```bash
cd frontend && yarn lint && yarn build && wc -l src/viewer/presentation/three/gltf-model.tsx
```

Ожидается: чисто, файл ≤ 200 строк.

- [ ] **Step 4: Живая проверка в браузере**

```bash
cd frontend && yarn dev --port 3000
```

Открыть `http://localhost:3000/territories/dji-wp-46-cut`, вкладка Network, троттлинг «Fast 4G». Ожидается: сначала запрос за хешем LOD2 и видимая грубая модель, затем запрос за хешем LOD0 и подмена на чёткую. Оба хеша сверить с ответом `/scene`.

**Замерить и записать провал кадра в момент подмены** (вкладка Performance, длительность самой длинной задачи вокруг второго запроса). Это критерий готовности из спеки, и он должен быть числом, а не словом «незаметно». Если провал больше ~200 мс — записать это в PR и завести отдельный вопрос о сдвиге `computeBoundsTree` в `requestIdleCallback`; в рамках этой работы не чинить.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/viewer/presentation/three/gltf-model.tsx
git commit -m "feat(frontend): load the territory progressively

The coarsest level mounts while LOD0 is still on the wire. Also drops the
comment claiming lower LODs are never loaded — it stopped being true here."
```

---

### Task 8: Плейсменты перестают жить на самом грубом уровне

Сегодня плейсмент навсегда остаётся на LOD2 (`placement-instance.tsx:37`). После задачи 2 текстуры LOD2 стали в шестнадцать раз мельче по пикселям, поэтому «навсегда» превратилось бы в нечитаемые шильдики на оборудовании.

**Files:**
- Modify: `frontend/src/placement/presentation/three/placement-instance.tsx` (строки 1-20 импорты, 32-94 тело `PlacementInstanceImpl`)

**Interfaces:**
- Consumes: `useProgressiveLod` из задачи 5, `LodWarmer` из задачи 6.
- Produces: поведение `PlacementInstance`; пропсы и `PlacementBody` не меняются, `placements-layer.tsx` править не нужно.

- [ ] **Step 1: Удалить лестницу отката и подключить хук**

Заменить строки 32-88 (константу `PREFERRED_PLACEMENT_LOD`, комментарий над ней и всё тело `PlacementInstanceImpl`) на:

```tsx
// PlacementInstance owns the in-scene representation of a single placement.
// The transform is applied imperatively (useLayoutEffect on the group's ref)
// rather than via JSX props because TransformControls mutates the object
// directly during a drag — keeping React as the only writer would let
// re-renders elsewhere stomp on the gizmo's in-flight mutations. The
// forwarded ref lets the parent attach <TransformControls> when this
// placement is the selected one.
//
// The LOD is progressive, same as the territory: the coarsest level mounts
// first so a scene full of placements paints quickly, then each upgrades to
// LOD0. Sitting on the coarsest level permanently used to be acceptable when
// lower LODs kept full-resolution textures; they no longer do.
function PlacementInstanceImpl({
  placement,
  selected,
  measureMode,
  onSelect,
  ref,
}: PlacementInstanceProps) {
  const { url, warmUrl, onWarmReady, onFailed } = useProgressiveLod(placement.lods, 0);
  if (!url) return null;

  return (
    <>
      <LodErrorBoundary resetKey={url} onError={onFailed}>
        <PlacementBody
          ref={ref}
          placement={placement}
          url={url}
          selected={selected}
          measureMode={measureMode}
          onSelect={onSelect}
        />
      </LodErrorBoundary>
      {warmUrl && <LodWarmer url={warmUrl} onReady={onWarmReady} />}
    </>
  );
}
```

- [ ] **Step 2: Почистить импорты**

Заменить строки 1-20 на:

```tsx
import {
  memo,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import { useProgressiveLod } from "@/viewer/application/use-progressive-lod";
import LodWarmer from "@/viewer/presentation/three/lod-warmer";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";
```

Ушли: `useState`, `LodArtifact`, `lodUrl`, `orderByPreferred` — их использовала удалённая лестница.

- [ ] **Step 3: Проверить кап и линтер**

```bash
cd frontend && yarn lint && wc -l src/placement/presentation/three/placement-instance.tsx
```

Ожидается: линтер чист, файл ≤ 200 строк. Спека допускала, что придётся выносить `PlacementBody` в отдельный файл; после этой правки файл стал **короче** исходных 174 строк, потому что удалённого больше, чем добавленного. Выносить ничего не нужно — если `max-lines` всё же сработал, значит правка отклонилась от плана, и это надо разобрать, а не глушить выносом.

- [ ] **Step 4: Живая проверка**

Открыть территорию с плейсментами, вкладка Network. Ожидается: по два запроса на каждую уникальную модель (грубый, затем LOD0), и **один** комплект на несколько плейсментов одной модели — кеш `useGLTF` адресуется по URL и дедуплицирует. Убедиться глазами, что плейсмент в итоге чёткий, а не остался мыльным.

- [ ] **Step 5: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/placement/presentation/three/placement-instance.tsx
git commit -m "feat(frontend): placements upgrade to LOD0 instead of staying coarse

The index-based fallback ladder is gone — useProgressiveLod tracks broken
levels by hash and does the same job for the territory too, which had none."
```

---

### Task 9: Прелоадер греет то, что действительно монтируется первым

**Files:**
- Modify: `frontend/src/viewer/presentation/three/glb-preloader.tsx`

**Interfaces:**
- Consumes: `pickCoarsest` из задачи 4.
- Produces: поведение `GlbPreloader`; пропсы не меняются, `scene-canvas.tsx:222` править не нужно.

- [ ] **Step 1: Переписать файл**

Заменить `frontend/src/viewer/presentation/three/glb-preloader.tsx` целиком на:

```tsx
import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { pickCoarsest, type LodArtifact } from "@/shared/domain/lod-artifact";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";

interface GlbPreloaderProps {
  parentLods: LodArtifact[];
  placements: ResolvedPlacement[];
}

// GlbPreloader warms drei's useGLTF cache for the level that actually mounts
// first — the coarsest one in each chain. LOD0 is deliberately NOT preloaded:
// LodWarmer fetches it as soon as the coarse level is on screen, and racing it
// here would put the two on the wire together and lose the point of showing
// something early.
//
// Critically, this lives INSIDE <Canvas> and AFTER <Ktx2Init>: a preload at
// module-top or in a parent component would parse cached GLBs in a microtask
// before the KTX2 transcoder is configured, silently failing every
// KHR_texture_basisu decode and rendering models white. The useEffect runs
// after the first render commit of Canvas's children, by which time Ktx2Init's
// render-time detectSupport has already configured the loader.
export default function GlbPreloader({
  parentLods,
  placements,
}: GlbPreloaderProps) {
  useEffect(() => {
    const first = pickCoarsest(parentLods);
    if (first) {
      useGLTF.preload(assetUrl(first.hash), true, true, extendGltfLoader);
    }
    for (const p of placements) {
      const pick = pickCoarsest(p.lods);
      if (pick) {
        useGLTF.preload(assetUrl(pick.hash), true, true, extendGltfLoader);
      }
    }
  }, [parentLods, placements]);
  return null;
}
```

- [ ] **Step 2: Проверить сборку и линтер**

```bash
cd frontend && yarn lint && yarn build && yarn test && yarn test:spa
```

Ожидается: всё зелёное.

- [ ] **Step 3: Коммит**

```bash
cd /Users/vbncursed/programming/rosneft
git add frontend/src/viewer/presentation/three/glb-preloader.tsx
git commit -m "refactor(frontend): preload the level that mounts first, not LOD0

Racing LOD0 into the cache alongside the coarse level puts both on the wire
at once and loses the point of showing something early."
```

---

### Task 10: Живая проверка и цифры для отчёта

Тесты этой работы не поймают самого важного. За прошлую работу из четырёх дефектов тесты не поймали ни одного — их нашли код-ревью и регрессионный прогон на живом стенде.

**Files:** нет.

**Interfaces:**
- Consumes: всё из задач 1-9.
- Produces: числа для PR и для ревизии артефакта аудита.

- [ ] **Step 1: Снять время до первого кадра, до и после**

На стенде, вкладка Performance, троттлинг «Fast 4G», холодный кеш (`Disable cache`). Открыть `/territories/dji-wp-46-cut`, замерить от навигации до первого кадра, где видна геометрия.

Замер «до» брать на коммите перед задачей 7 (`git stash` фронтовых правок или отдельный чекаут), «после» — на текущем.

Критерий из спеки: сокращение минимум вчетверо.

- [ ] **Step 2: Проверить территорию без цепочки LOD**

Создать территорию, у которой в каталоге окажется только LOD0 — либо через `MESH_LOD_RATIOS=` (пусто) на воркере, либо взяв старую, не переконвертированную.

Ожидается: открывается ровно как раньше, без второго запроса, `warmUrl` равен `null`. Это проверка того, что фронт безопасен на старых данных.

- [ ] **Step 3: Проверить сравнение качества**

Один и тот же ракурс, скриншот до и после завершения загрузки. Ожидается: итоговый кадр неотличим от сегодняшнего — прогрессивная загрузка меняет путь, а не результат.

- [ ] **Step 4: Проверить измерительный инструмент**

Включить измерение (`M`), поставить две точки на территории **во время** загрузки LOD0 и ещё две — после подмены. Ожидается: обе пары дают осмысленные расстояния, канвас не падает. Это место, где подмена сцены под ногами райкаста могла бы сломаться незаметно.

- [ ] **Step 5: Прогнать полный гейт**

```bash
cd /Users/vbncursed/programming/rosneft
make -C backend check
cd frontend && yarn lint && yarn build && yarn test && yarn test:spa
```

Ожидается: всё зелёное.

- [ ] **Step 6: Грепнуть комментарии, которые правка могла сделать ложными**

```bash
cd /Users/vbncursed/programming/rosneft
grep -rn "LOD" --include='*.md' --include='*.go' --include='*.ts' --include='*.tsx' \
  backend/CLAUDE.md CLAUDE.md backend/services/mesh-service/README.md frontend/src | grep -i "never loaded\|always\|LOD0 only\|coarsest\|full quality"
```

Ожидается: ни одного утверждения, ставшего ложным. Кандидаты, которые точно надо перечитать: `CLAUDE.md` («placements far from the camera should grab LOD2; the main scene asset should always grab LOD0», «Frontends that don't yet request lower LODs continue to use LOD0 only») и `backend/CLAUDE.md` (описание шага 5 конвейера). Протухший комментарий в этом репозитории уже трижды пережил правку кода — это отдельный шаг, а не примечание.

- [ ] **Step 7: Обновить документацию и закоммитить**

Привести к правде найденные на шаге 6 места в `CLAUDE.md` и `backend/CLAUDE.md`: теперь главная сцена начинает с самого грубого уровня и апгрейдится, плейсменты тоже, а LOD-проход получает сырой GLB и масштабирует текстуры.

```bash
git add CLAUDE.md backend/CLAUDE.md
git commit -m "docs: LOD chain is now progressive, and lower LODs shed textures too"
```

- [ ] **Step 8: PR**

```bash
git push -u origin dev
gh pr create --base main --head dev --title "Прогрессивная загрузка LOD" --body "$(cat <<'EOF'
Направление 04 аудита: первый кадр ждал весь LOD0 целиком.

Цепочка LOD генерировалась, но не грузилась — и не помогла бы: LOD-проход
получал уже сжатый GLB, поэтому `-si` снимал треугольники, а текстуры
оставались в полном разрешении. На фотограмметрии это большая часть байтов.

- LOD-проход получает сырой GLB и добавляет `gltfpack -ts` с тем же ratio.
- Вьюер монтирует самый грубый уровень сразу и подменяет на LOD0 по готовности —
  и для территории, и для плейсментов.
- Лестница отката плейсмента заменена общим хуком, так что территория тоже
  получила защиту от битого артефакта, которой у неё не было.

Числа: <размеры LOD0/1/2 до и после, время конверсии, время до первого кадра,
провал кадра в момент подмены>.

Не закрыто осознанно: тайлинг, инстансинг, потоковый разбор OBJ, потолок 2 ГиБ.

Спека: docs/superpowers/specs/2026-08-03-progressive-lod-design.md
План: docs/superpowers/plans/2026-08-03-progressive-lod.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Код-ревью и ревизия артефакта**

Запустить `/code-review` на PR. Правки с уверенностью ниже 80 в комментарии не попадут — если находка своя и проверена, чинить всё равно.

После merge — обновить артефакт аудита (ревизия 5): направление 04, оценку поднять с 40% с явным перечислением того, что осталось. Отчёт правится, а не переписывается: снятая оценка остаётся видна рядом с новой.

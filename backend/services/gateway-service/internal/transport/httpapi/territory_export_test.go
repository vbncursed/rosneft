package httpapi

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

type TerritoryExportSuite struct {
	suite.Suite
	logs bytes.Buffer
}

func TestTerritoryExportSuite(t *testing.T) { suite.Run(t, new(TerritoryExportSuite)) }

func (s *TerritoryExportSuite) SetupTest() { s.logs.Reset() }

// triJSON is one triangle on buffer 0 (36 bytes of positions), the smallest
// document Build accepts; glb frames it by hand like gltfpack's output.
const triJSON = `{"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],` +
	`"nodes":[{"name":"n","mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],` +
	`"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],` +
	`"bufferViews":[{"buffer":0,"byteLength":36}],"buffers":[{"byteLength":%d}]}`

// glb frames json (space-padded) and a BIN chunk whose header declares binLen
// bytes while only the first len(bin) exist; binLen == len(bin) is a whole file.
func glb(json string, bin []byte, binLen int) []byte {
	for len(json)%4 != 0 {
		json += " "
	}
	out := binary.LittleEndian.AppendUint32(nil, 0x46546C67)
	out = binary.LittleEndian.AppendUint32(out, 2)
	out = binary.LittleEndian.AppendUint32(out, uint32(20+len(json)+8+binLen))
	out = binary.LittleEndian.AppendUint32(out, uint32(len(json)))
	out = binary.LittleEndian.AppendUint32(out, 0x4E4F534A)
	out = append(out, json...)
	out = binary.LittleEndian.AppendUint32(out, uint32(binLen))
	out = binary.LittleEndian.AppendUint32(out, 0x004E4942)
	return append(out, bin...)
}

func triGLB(seed byte) []byte {
	bin := bytes.Repeat([]byte{seed}, 36)
	return glb(fmt.Sprintf(triJSON, 36), bin, 36)
}

// exportOpener serves blobs from memory; fail, when set, may veto an open.
func exportOpener(blobs map[string][]byte, fail func(hash string, offset int64) error) glbexport.Opener {
	return func(_ context.Context, hash string, offset int64) (io.ReadCloser, error) {
		if fail != nil {
			if err := fail(hash, offset); err != nil {
				return nil, err
			}
		}
		b, ok := blobs[hash]
		if !ok {
			return nil, errors.New("no such blob " + hash)
		}
		return io.NopCloser(bytes.NewReader(b[offset:])), nil
	}
}

type exportServiceStub struct {
	Service
	territoryErr error
	bundle       domain.SceneBundle
	bundleErr    error
	bundleCalls  int
}

func (e *exportServiceStub) GetTerritory(_ context.Context, slug, _ string) (domain.Territory, error) {
	if e.territoryErr != nil {
		return domain.Territory{}, e.territoryErr
	}
	return domain.Territory{Slug: slug}, nil
}

func (e *exportServiceStub) GetSceneBundle(context.Context, string, string) (domain.SceneBundle, error) {
	e.bundleCalls++
	return e.bundle, e.bundleErr
}

// router mirrors routes_root.go: the territory gate mounted inline on the root
// router, then the handler. Anything that differs proves nothing about production.
func (s *TerritoryExportSuite) router(svc Service, sc gateCase, open glbexport.Opener) http.Handler {
	srv := New(svc)
	r := chi.NewRouter()
	r.Use(slogchi.New(slog.New(slog.NewJSONHandler(&s.logs, nil))))
	scope := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(withTestScope(req.Context(), sc)))
		})
	}
	r.With(scope, srv.RequireTerritoryAccess).
		Get("/api/territories/{slug}/export.glb", srv.ServeTerritoryExport(open))
	return r
}

func (s *TerritoryExportSuite) bundle() domain.SceneBundle {
	return domain.SceneBundle{
		Territory:    domain.Territory{Slug: "ust-kut", Title: "Усть-Кут"},
		Artifact:     &domain.Artifact{Hash: "terr"},
		ModelOptions: []domain.AssetOption{{Slug: "tank", LODs: []domain.LodArtifact{{LOD: 0, Hash: "tank"}}}, {Slug: "raw"}},
		PlacementGroups: []domain.PlacementGroup{
			{ID: 1, Hidden: true},
		},
		Placements: []domain.Placement{
			{ID: 1, ModelSlug: "tank", Label: "shown", Scale: domain.Vec3{X: 1, Y: 1, Z: 1}},
			{ID: 2, ModelSlug: "tank", Label: "hidden", Hidden: true},
			{ID: 3, ModelSlug: "tank", Label: "in hidden group", GroupID: new(int64(1))},
			{ID: 4, ModelSlug: "raw", Label: "no lod0"},
		},
	}
}

func (s *TerritoryExportSuite) blobs() map[string][]byte {
	return map[string][]byte{"terr": triGLB(1), "tank": triGLB(9)}
}

func (s *TerritoryExportSuite) get(h http.Handler) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/territories/ust-kut/export.glb", nil))
	return rec
}

var scoped = gateCase{adminID: "admin-1"}

func (s *TerritoryExportSuite) TestForeignTerritoryIs404() {
	svc := &exportServiceStub{territoryErr: domain.ErrTerritoryNotFound, bundle: s.bundle()}

	rec := s.get(s.router(svc, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "not_found"), rec.Body.String())
	assert.Equal(s.T(), svc.bundleCalls, 0, "the gate must stop the request before the bundle is read")
}

func (s *TerritoryExportSuite) TestCatalogFailureIs503() {
	svc := &exportServiceStub{territoryErr: errors.New("dial tcp 10.0.0.7: refused"), bundle: s.bundle()}

	rec := s.get(s.router(svc, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusServiceUnavailable)
	assert.Assert(s.T(), !strings.Contains(rec.Body.String(), "10.0.0.7"), rec.Body.String())
}

func (s *TerritoryExportSuite) TestPrincipalWithoutScopeIs404() {
	svc := &exportServiceStub{bundle: s.bundle()}

	rec := s.get(s.router(svc, gateCase{}, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
	assert.Equal(s.T(), svc.bundleCalls, 0)
}

func (s *TerritoryExportSuite) TestBundleNotFoundIs404() {
	svc := &exportServiceStub{bundleErr: domain.ErrTerritoryNotFound}

	rec := s.get(s.router(svc, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
}

func (s *TerritoryExportSuite) TestNotConvertedIs409() {
	b := s.bundle()
	b.Artifact = nil

	rec := s.get(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusConflict)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"conflict"`), rec.Body.String())
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "territory is not converted yet"), rec.Body.String())
}

func (s *TerritoryExportSuite) TestStreamsTheVisibleScene() {
	svc := &exportServiceStub{bundle: s.bundle()}

	rec := s.get(s.router(svc, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	h := rec.Header()
	assert.Equal(s.T(), h.Get("Content-Type"), "model/gltf-binary")
	assert.Equal(s.T(), h.Get("Content-Disposition"), `attachment; filename=ust-kut.glb`)
	assert.Equal(s.T(), h.Get("Cache-Control"), "no-store")
	body := rec.Body.Bytes()
	assert.Equal(s.T(), h.Get("Content-Length"), strconv.Itoa(len(body)))

	head, err := glbexport.ReadHead(bytes.NewReader(body))
	assert.NilError(s.T(), err)
	names := make([]string, 0, len(head.Doc.Scenes[0].Nodes))
	for _, i := range head.Doc.Scenes[0].Nodes {
		names = append(names, head.Doc.Nodes[i].Name)
	}
	assert.DeepEqual(s.T(), names, []string{"Усть-Кут", "shown"})
	assert.Assert(s.T(), strings.Contains(s.logs.String(), `"export_skipped":1`), s.logs.String())
}

// A slug the schema never constrained must not break out of the filename.
func (s *TerritoryExportSuite) TestOddSlugStaysInsideTheFilename() {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, `/api/territories/a";x=y/export.glb`, nil)
	s.router(&exportServiceStub{bundle: s.bundle()}, scoped, exportOpener(s.blobs(), nil)).ServeHTTP(rec, req)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	_, params, err := mime.ParseMediaType(rec.Header().Get("Content-Disposition"))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), params, map[string]string{"filename": `a";x=y.glb`})
}

func (s *TerritoryExportSuite) TestOpenerFailureBeforeFirstByteIs500() {
	open := exportOpener(s.blobs(), func(string, int64) error { return errors.New("asset down: 10.0.0.9") })

	rec := s.get(s.router(&exportServiceStub{bundle: s.bundle()}, scoped, open))

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), strings.TrimSpace(rec.Body.String()), `{"code":"internal","message":"internal error"}`)
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), "")
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "asset down: 10.0.0.9"), "the cause belongs on the log line")
}

func (s *TerritoryExportSuite) TestTooLargeIs422() {
	huge := glb(fmt.Sprintf(triJSON, 3<<30), nil, 3<<30) // header says 3 GiB, nothing follows
	blobs := map[string][]byte{"terr": huge, "tank": huge}

	rec := s.get(s.router(&exportServiceStub{bundle: s.bundle()}, scoped, exportOpener(blobs, nil)))

	assert.Equal(s.T(), rec.Code, http.StatusUnprocessableEntity)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"unprocessable"`), rec.Body.String())
}

// Anti-goal: a silently truncated 200. The length is promised up front, so a
// failure after the first byte must reach the client as a short body.
func (s *TerritoryExportSuite) TestMidStreamFailureIsAShortBody() {
	open := exportOpener(s.blobs(), func(hash string, offset int64) error {
		if hash == "tank" && offset > 0 {
			return errors.New("asset died mid-export")
		}
		return nil
	})
	srv := httptest.NewServer(s.router(&exportServiceStub{bundle: s.bundle()}, scoped, open))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/territories/ust-kut/export.glb")
	assert.NilError(s.T(), err)
	defer func() { _ = resp.Body.Close() }()
	got, err := io.ReadAll(resp.Body)

	assert.Equal(s.T(), resp.StatusCode, http.StatusOK)
	assert.Assert(s.T(), errors.Is(err, io.ErrUnexpectedEOF), "err = %v", err)
	assert.Assert(s.T(), int64(len(got)) < resp.ContentLength, "got %d of %d", len(got), resp.ContentLength)
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "asset died mid-export"), s.logs.String())
}

package httpapi

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	slogchi "github.com/samber/slog-chi"
	"github.com/stretchr/testify/suite"

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

// router mirrors routes_root.go (the territory gate mounted inline on the root
// router, then the handler) and InitRouter's /api group for export-check. Anything that differs proves nothing about production.
func (s *TerritoryExportSuite) router(svc Service, sc gateCase, open glbexport.Opener) http.Handler {
	srv := New(svc).WithExportOpener(open)
	r := chi.NewRouter()
	r.Use(middleware.Recoverer, slogchi.New(slog.New(slog.NewJSONHandler(&s.logs, nil))))
	scope := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(withTestScope(req.Context(), sc)))
		})
	}
	r.With(scope, srv.RequireTerritoryAccess).
		Get("/api/territories/{slug}/export.glb", srv.ServeTerritoryExport())
	r.With(scope, srv.RequireTerritoryAccess).
		Get("/api/territories/{slug}/export.obj.zip", srv.ServeTerritoryExportOBJ())
	// The check is a normal /api operation: it inherits the gate from the group.
	r.Group(func(api chi.Router) {
		api.Use(scope, srv.RequireTerritoryAccess, ETagMiddleware)
		Mount(api, srv)
	})
	return r
}

func (s *TerritoryExportSuite) bundle() domain.SceneBundle {
	return domain.SceneBundle{
		Territory: domain.Territory{Slug: "ust-kut", Title: "Усть-Кут"},
		Artifact:  &domain.Artifact{Hash: "terr"},
		ModelOptions: []domain.AssetOption{
			{Slug: "tank", LODs: []domain.LodArtifact{{LOD: 0, Hash: "tank"}}},
			{Slug: "raw"},
		},
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
	return s.getPath(h, "/api/territories/ust-kut/export.glb")
}

func (s *TerritoryExportSuite) getPath(h http.Handler, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

var scoped = gateCase{adminID: "admin-1"}

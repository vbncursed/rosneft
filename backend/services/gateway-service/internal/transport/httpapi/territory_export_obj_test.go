package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"math"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

const objURL = "/api/territories/ust-kut/export.obj.zip"

func f32bits(f float32) uint32 { return math.Float32bits(f) }

func (s *TerritoryExportSuite) objBlobs() map[string][]byte {
	return map[string][]byte{"terr-p": objTriGLB(), "tank-p": objTriGLB()}
}

func entryNames(t assert.TestingT, body []byte) []string {
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	assert.NilError(t, err)
	names := make([]string, len(zr.File))
	for i, f := range zr.File {
		names[i] = f.Name
	}
	return names
}

func (s *TerritoryExportSuite) TestOBJStreamsAZip() {
	var (
		mu     sync.Mutex // ReadHeads opens blobs concurrently
		opened []string
	)
	blobs := s.objBlobs()
	open := func(ctx context.Context, hash string, offset int64) (io.ReadCloser, error) {
		mu.Lock()
		opened = append(opened, hash)
		mu.Unlock()
		return exportOpener(blobs, nil)(ctx, hash, offset)
	}

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, open), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "application/zip")
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), "attachment; filename=ust-kut-obj.zip")
	assert.Equal(s.T(), rec.Header().Get("Content-Length"), "")
	assert.Equal(s.T(), rec.Header().Get("Cache-Control"), "no-store")
	assert.DeepEqual(s.T(), entryNames(s.T(), rec.Body.Bytes()), []string{"README.txt", "ust-kut.mtl", "ust-kut.obj"})
	for _, h := range opened {
		assert.Assert(s.T(), strings.HasSuffix(h, "-p"), "opened %q, not a plain copy", h)
	}
}

func (s *TerritoryExportSuite) TestOBJIgnoresQuery() {
	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(s.objBlobs(), nil)), objURL+"?variant=x")

	assert.Equal(s.T(), rec.Code, http.StatusOK)
}

func (s *TerritoryExportSuite) TestOBJMissingPlainIs409() {
	territory := s.compatBundle()
	territory.Artifact.PlainHash = ""
	model := s.compatBundle()
	model.ModelOptions[0].LODs[0].PlainHash = ""
	for name, b := range map[string]domain.SceneBundle{"territory": territory, "model": model} {
		s.Run(name, func() {
			rec := s.getPath(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.objBlobs(), nil)), objURL)

			assert.Equal(s.T(), rec.Code, http.StatusConflict)
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), "OBJ export is not ready yet"), rec.Body.String())
		})
	}
}

func (s *TerritoryExportSuite) TestOBJHiddenPlacementWithoutPlainDoesNotBlock() {
	b := s.compatBundle()
	b.ModelOptions = append(b.ModelOptions, domain.AssetOption{Slug: "old", LODs: []domain.LodArtifact{{LOD: 0, Hash: "old"}}})
	b.Placements = append(b.Placements,
		domain.Placement{ID: 5, ModelSlug: "old", Label: "hidden", Hidden: true},
		domain.Placement{ID: 6, ModelSlug: "old", Label: "in hidden group", GroupID: new(int64(1))},
	)

	rec := s.getPath(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.objBlobs(), nil)), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
}

func (s *TerritoryExportSuite) TestOBJNotConvertedIs409() {
	b := s.compatBundle()
	b.Artifact = nil

	rec := s.getPath(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.objBlobs(), nil)), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusConflict)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "territory is not converted yet"), rec.Body.String())
}

func (s *TerritoryExportSuite) TestOBJForeignTerritoryIs404() {
	svc := &exportServiceStub{territoryErr: domain.ErrTerritoryNotFound, bundle: s.compatBundle()}

	rec := s.getPath(s.router(svc, scoped, exportOpener(s.objBlobs(), nil)), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
	assert.Equal(s.T(), svc.bundleCalls, 0)
}

func (s *TerritoryExportSuite) TestOBJTooLargeIs422() {
	blobs := map[string][]byte{"terr-p": objBigGLB(), "tank-p": objBigGLB()}

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(blobs, nil)), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusUnprocessableEntity)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"unprocessable"`), rec.Body.String())
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "OBJ export exceeds 20 million vertices or 40 million faces"), rec.Body.String())
}

func (s *TerritoryExportSuite) TestOBJBuildFailureIs500() {
	blobs := s.objBlobs()
	blobs["terr-p"] = triGLB(2) // not indexed

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(blobs, nil)), objURL)

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), strings.TrimSpace(rec.Body.String()), `{"code":"internal","message":"internal error"}`)
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "unsupported"), s.logs.String())
}

// Review Focus 2.
func (s *TerritoryExportSuite) TestOBJOddSlugStaysInsideTheFilename() {
	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(s.objBlobs(), nil)),
		"/api/territories/a%22;x=y/export.obj.zip")

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	_, params, err := mime.ParseMediaType(rec.Header().Get("Content-Disposition"))
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), params, map[string]string{"filename": `a";x=y-obj.zip`})
	names := entryNames(s.T(), rec.Body.Bytes())
	assert.Assert(s.T(), strings.Contains(strings.Join(names, " "), "a__x_y.obj"), "%v", names)
	for _, n := range names {
		assert.Assert(s.T(), !strings.Contains(n, "/"), "entry %q has a separator", n)
	}
}

// A failure after the headers must cut the connection: ending the chunked body
// cleanly would hand the client a complete-looking, truncated ZIP.
func (s *TerritoryExportSuite) TestOBJMidStreamFailureAbortsTheResponse() {
	died := func(hash string, offset int64) error {
		if hash == "tank-p" && offset > 0 {
			return errors.New("asset died mid-export")
		}
		return nil
	}
	h := s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(s.objBlobs(), died))
	done := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(done) // runs after slog-chi's deferred log, so s.logs is safe to read
		h.ServeHTTP(w, r)
	}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + objURL)
	assert.NilError(s.T(), err)
	defer func() { _ = resp.Body.Close() }()
	_, readErr := io.ReadAll(resp.Body)
	<-done

	assert.Equal(s.T(), resp.StatusCode, http.StatusOK)
	assert.Equal(s.T(), resp.ContentLength, int64(-1))
	assert.ErrorIs(s.T(), readErr, io.ErrUnexpectedEOF)
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "asset died mid-export"), s.logs.String())
}

package httpapi

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

const compatURL = "/api/territories/ust-kut/export.glb?variant=compatible"

// compatBundle is bundle() with a plain copy next to every LOD0.
func (s *TerritoryExportSuite) compatBundle() domain.SceneBundle {
	b := s.bundle()
	b.Artifact.PlainHash = "terr-p"
	b.ModelOptions[0].LODs[0].PlainHash = "tank-p"
	return b
}

func (s *TerritoryExportSuite) compatBlobs() map[string][]byte {
	b := s.blobs()
	b["terr-p"], b["tank-p"] = triGLB(2), triGLB(7)
	return b
}

func (s *TerritoryExportSuite) TestCompatibleStreamsWithItsOwnFilename() {
	var (
		mu     sync.Mutex // ReadHeads opens blobs concurrently
		opened []string
	)
	blobs := s.compatBlobs()
	open := func(ctx context.Context, hash string, offset int64) (io.ReadCloser, error) {
		mu.Lock()
		opened = append(opened, hash)
		mu.Unlock()
		return exportOpener(blobs, nil)(ctx, hash, offset)
	}

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, open), compatURL)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), `attachment; filename=ust-kut-compatible.glb`)
	assert.Equal(s.T(), rec.Header().Get("Content-Length"), strconv.Itoa(rec.Body.Len()))
	for _, h := range opened {
		assert.Assert(s.T(), strings.HasSuffix(h, "-p"), "opened %q, not a plain copy", h)
	}
}

// Review Focus 2.
func (s *TerritoryExportSuite) TestVariantIsValidated() {
	for _, q := range []string{"?variant=", "?variant=Compatible", "?variant=compressed", "?variant=compatible&variant=compatible"} {
		s.Run(q, func() {
			svc := &exportServiceStub{bundle: s.compatBundle()}

			rec := s.getPath(s.router(svc, scoped, exportOpener(s.compatBlobs(), nil)), "/api/territories/ust-kut/export.glb"+q)

			assert.Equal(s.T(), rec.Code, http.StatusBadRequest)
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"invalid_input"`), rec.Body.String())
			assert.Equal(s.T(), svc.bundleCalls, 0)
		})
	}
}

func (s *TerritoryExportSuite) TestMissingPlainIs409() {
	territory := s.compatBundle()
	territory.Artifact.PlainHash = ""
	model := s.compatBundle()
	model.ModelOptions[0].LODs[0].PlainHash = ""
	for name, b := range map[string]domain.SceneBundle{"territory": territory, "model": model} {
		s.Run(name, func() {
			rec := s.getPath(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.compatBlobs(), nil)), compatURL)

			assert.Equal(s.T(), rec.Code, http.StatusConflict)
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"conflict"`), rec.Body.String())
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), "compatible copy is not ready yet"), rec.Body.String())
		})
	}
}

// Review Focus 3: only exported placements count.
func (s *TerritoryExportSuite) TestHiddenPlacementWithoutPlainDoesNotBlock() {
	b := s.compatBundle()
	b.ModelOptions = append(b.ModelOptions, domain.AssetOption{Slug: "old", LODs: []domain.LodArtifact{{LOD: 0, Hash: "old"}}})
	b.Placements = append(b.Placements,
		domain.Placement{ID: 5, ModelSlug: "old", Label: "hidden", Hidden: true},
		domain.Placement{ID: 6, ModelSlug: "old", Label: "in hidden group", GroupID: new(int64(1))},
	)

	rec := s.getPath(s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.compatBlobs(), nil)), compatURL)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
}

// Review Focus 5.
func (s *TerritoryExportSuite) TestCompressedIgnoresMissingPlain() {
	rec := s.get(s.router(&exportServiceStub{bundle: s.bundle()}, scoped, exportOpener(s.blobs(), nil)))

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), `attachment; filename=ust-kut.glb`)
}

// Anti-goal: a "compatible" file that still needs an extension never ships.
func (s *TerritoryExportSuite) TestCompatibleThatStillRequiresAnExtensionIs500() {
	withExt := strings.Replace(triJSON, `"scene":0,`, `"extensionsUsed":["KHR_texture_basisu"],"extensionsRequired":["KHR_texture_basisu"],"scene":0,`, 1)
	blobs := s.compatBlobs()
	blobs["tank-p"] = glb(strings.Replace(withExt, "%d", "36", 1), bytes.Repeat([]byte{7}, 36), 36)

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(blobs, nil)), compatURL)

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), strings.TrimSpace(rec.Body.String()), `{"code":"internal","message":"internal error"}`)
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), "")
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "KHR_texture_basisu"), s.logs.String())
}

func (s *TerritoryExportSuite) TestForeignTerritoryWithVariantIs404() {
	svc := &exportServiceStub{territoryErr: domain.ErrTerritoryNotFound, bundle: s.compatBundle()}

	rec := s.getPath(s.router(svc, scoped, exportOpener(s.compatBlobs(), nil)), compatURL)

	assert.Equal(s.T(), rec.Code, http.StatusNotFound)
	assert.Equal(s.T(), svc.bundleCalls, 0)
}

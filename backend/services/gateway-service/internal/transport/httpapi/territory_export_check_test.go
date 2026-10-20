package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

const checkURL = "/api/territories/ust-kut/export-check?variant="

// checkCase is one export variant with the download route that answers for it.
type checkCase struct {
	variant, download string
	bundle            domain.SceneBundle
	blobs             map[string][]byte
}

func (s *TerritoryExportSuite) checkCases() []checkCase {
	return []checkCase{
		{"compressed", "/api/territories/ust-kut/export.glb", s.bundle(), s.blobs()},
		{"compatible", compatURL, s.compatBundle(), s.compatBlobs()},
		{"obj", objURL, s.compatBundle(), s.objBlobs()},
	}
}

func (s *TerritoryExportSuite) TestCheckAnnouncesTheDownloadsFilenameAndSize() {
	for _, tc := range s.checkCases() {
		s.Run(tc.variant, func() {
			h := s.router(&exportServiceStub{bundle: tc.bundle}, scoped, exportOpener(tc.blobs, nil))

			download := s.getPath(h, tc.download)
			check := s.getPath(h, checkURL+tc.variant)

			assert.Equal(s.T(), check.Code, http.StatusOK, check.Body.String())
			assert.Equal(s.T(), check.Header().Get("Cache-Control"), "no-store")
			var body map[string]any
			assert.NilError(s.T(), json.Unmarshal(check.Body.Bytes(), &body))
			_, params, err := mime.ParseMediaType(download.Header().Get("Content-Disposition"))
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), body["filename"], params["filename"])
			if tc.variant == "obj" { // chunked: no length to promise
				assert.Equal(s.T(), download.Header().Get("Content-Length"), "")
				_, has := body["sizeBytes"]
				assert.Assert(s.T(), !has, "sizeBytes must be omitted: %v", body)
				return
			}
			size := strconv.Itoa(download.Body.Len())
			assert.Equal(s.T(), download.Header().Get("Content-Length"), size)
			assert.Equal(s.T(), fmt.Sprint(body["sizeBytes"]), size)
		})
	}
}

func (s *TerritoryExportSuite) TestCheckFilenameFollowsAnOddSlug() {
	h := s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(s.objBlobs(), nil))

	rec := s.getPath(h, `/api/territories/a%22;x=y/export-check?variant=obj`)

	assert.Equal(s.T(), rec.Code, http.StatusOK, rec.Body.String())
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"filename":"a\";x=y-obj.zip"`), rec.Body.String())
}

// The check and the download are one code path up to the first byte, so every
// refusal is the same status with the same body.
func (s *TerritoryExportSuite) TestCheckRefusesExactlyLikeTheDownload() {
	huge := glb(fmt.Sprintf(triJSON, 3<<30), nil, 3<<30) // header says 3 GiB, nothing follows
	hugeGLB := map[string][]byte{"terr": huge, "tank": huge, "terr-p": huge, "tank-p": huge}
	hugeOBJ := map[string][]byte{"terr-p": objBigGLB(), "tank-p": objBigGLB()}
	for _, tc := range s.checkCases() {
		notConverted := tc.bundle
		notConverted.Artifact = nil
		noPlainTerritory, noPlainModel := s.compatBundle(), s.compatBundle()
		noPlainTerritory.Artifact.PlainHash = ""
		noPlainModel.ModelOptions[0].LODs[0].PlainHash = ""
		tooLarge := hugeGLB
		if tc.variant == "obj" {
			tooLarge = hugeOBJ
		}
		type scenario struct {
			name string
			svc  *exportServiceStub
			open glbexport.Opener
			want int
		}
		ok := exportOpener(tc.blobs, nil)
		scenarios := []scenario{
			{"foreign", &exportServiceStub{territoryErr: domain.ErrTerritoryNotFound, bundle: tc.bundle}, ok, http.StatusNotFound},
			{"catalog down", &exportServiceStub{territoryErr: errors.New("dial tcp 10.0.0.7"), bundle: tc.bundle}, ok, http.StatusServiceUnavailable},
			{"not converted", &exportServiceStub{bundle: notConverted}, ok, http.StatusConflict},
			{"too large", &exportServiceStub{bundle: tc.bundle}, exportOpener(tooLarge, nil), http.StatusUnprocessableEntity},
			{"asset down", &exportServiceStub{bundle: tc.bundle}, exportOpener(tc.blobs, func(string, int64) error { return errors.New("asset down: 10.0.0.9") }), http.StatusInternalServerError},
		}
		if tc.variant != "compressed" { // a compressed export never looks at plain copies
			scenarios = append(scenarios,
				scenario{"no plain territory", &exportServiceStub{bundle: noPlainTerritory}, ok, http.StatusConflict},
				scenario{"no plain model", &exportServiceStub{bundle: noPlainModel}, ok, http.StatusConflict})
		}
		for _, sc := range scenarios {
			s.Run(tc.variant+"/"+sc.name, func() {
				h := s.router(sc.svc, scoped, sc.open)

				download := s.getPath(h, tc.download)
				check := s.getPath(h, checkURL+tc.variant)

				assert.Equal(s.T(), download.Code, sc.want, download.Body.String())
				assert.Equal(s.T(), check.Code, sc.want, check.Body.String())
				assert.Equal(s.T(), check.Body.String(), download.Body.String())
			})
		}
	}
}

func (s *TerritoryExportSuite) TestCheckHiddenPlacementWithoutPlainDoesNotBlock() {
	b := s.compatBundle()
	b.ModelOptions = append(b.ModelOptions, domain.AssetOption{Slug: "old", LODs: []domain.LodArtifact{{LOD: 0, Hash: "old"}}})
	b.Placements = append(b.Placements,
		domain.Placement{ID: 5, ModelSlug: "old", Label: "hidden", Hidden: true},
		domain.Placement{ID: 6, ModelSlug: "old", Label: "in hidden group", GroupID: new(int64(1))},
	)
	h := s.router(&exportServiceStub{bundle: b}, scoped, exportOpener(s.compatBlobs(), nil))

	assert.Equal(s.T(), s.getPath(h, checkURL+"compatible").Code, http.StatusOK)
}

func (s *TerritoryExportSuite) TestCheckOpenerFailureLogsTheCauseOnly() {
	open := exportOpener(s.blobs(), func(string, int64) error { return errors.New("asset down: 10.0.0.9") })

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.bundle()}, scoped, open), checkURL+"compressed")

	assert.Equal(s.T(), strings.TrimSpace(rec.Body.String()), `{"code":"internal","message":"internal error"}`)
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "asset down: 10.0.0.9"), "the cause belongs on the log line")
}

func (s *TerritoryExportSuite) TestCheckCompatibleThatStillRequiresAnExtensionIs500() {
	withExt := strings.Replace(triJSON, `"scene":0,`, `"extensionsUsed":["KHR_texture_basisu"],"extensionsRequired":["KHR_texture_basisu"],"scene":0,`, 1)
	blobs := s.compatBlobs()
	blobs["tank-p"] = glb(strings.Replace(withExt, "%d", "36", 1), bytes.Repeat([]byte{7}, 36), 36)

	rec := s.getPath(s.router(&exportServiceStub{bundle: s.compatBundle()}, scoped, exportOpener(blobs, nil)), checkURL+"compatible")

	assert.Equal(s.T(), rec.Code, http.StatusInternalServerError)
	assert.Equal(s.T(), strings.TrimSpace(rec.Body.String()), `{"code":"internal","message":"internal error"}`)
	assert.Assert(s.T(), strings.Contains(s.logs.String(), "KHR_texture_basisu"), s.logs.String())
}

func (s *TerritoryExportSuite) TestCheckGateRunsBeforeTheBundleIsRead() {
	for name, tc := range map[string]struct {
		svc *exportServiceStub
		sc  gateCase
	}{
		"foreign":         {&exportServiceStub{territoryErr: domain.ErrTerritoryNotFound, bundle: s.bundle()}, scoped},
		"without a scope": {&exportServiceStub{bundle: s.bundle()}, gateCase{}},
	} {
		s.Run(name, func() {
			rec := s.getPath(s.router(tc.svc, tc.sc, exportOpener(s.blobs(), nil)), checkURL+"compressed")

			assert.Equal(s.T(), rec.Code, http.StatusNotFound)
			assert.Equal(s.T(), tc.svc.bundleCalls, 0)
		})
	}
}

func (s *TerritoryExportSuite) TestCheckVariantIsRequiredAndExact() {
	for _, q := range []string{
		"", "?variant=", "?variant=Compatible", "?variant=zip", "?variant=obj&variant=obj",
		"?variant=obj&variant=compatible",
		// url.Values drops a pair it cannot parse, which would read as "absent".
		"?variant=compat%zzible", "?variant=obj;x",
	} {
		s.Run(q, func() {
			svc := &exportServiceStub{bundle: s.compatBundle()}
			rec := httptest.NewRecorder()

			s.router(svc, scoped, exportOpener(s.compatBlobs(), nil)).
				ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/territories/ust-kut/export-check"+q, nil))

			assert.Equal(s.T(), rec.Code, http.StatusBadRequest, rec.Body.String())
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), `"code":"invalid_input"`), rec.Body.String())
			assert.Equal(s.T(), svc.bundleCalls, 0)
		})
	}
}

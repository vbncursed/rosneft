package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// loadExport is the one place the three export routes decide a refusal, so each
// refusal is pinned here as status, slug and message together, for every variant.
func (s *TerritoryExportSuite) TestLoadExportRefusals() {
	notConverted := s.bundle()
	notConverted.Artifact = nil
	generic := &exportRefusal{http.StatusInternalServerError, apperr.SlugInternal, apperr.InternalMessage}
	tests := []struct {
		name  string
		scope bool
		stub  *exportServiceStub
		want  *exportRefusal
	}{
		{"no scope at all", false, &exportServiceStub{bundle: s.bundle()}, territoryMissing()},
		{"bundle not found", true, &exportServiceStub{bundleErr: domain.ErrTerritoryNotFound}, territoryMissing()},
		{"bundle failure", true, &exportServiceStub{bundleErr: errors.New("db down")}, generic},
		{
			"not converted", true, &exportServiceStub{bundle: notConverted},
			&exportRefusal{http.StatusConflict, apperr.SlugConflict, "territory is not converted yet"},
		},
	}
	for _, tt := range tests {
		for _, v := range []exportVariant{variantCompressed, variantCompatible, variantOBJ} {
			s.Run(fmt.Sprintf("%s/%d", tt.name, v), func() {
				ctx := s.T().Context()
				if tt.scope {
					ctx = authhttp.NewTestContext(ctx, false, "admin-1")
				}
				srv := New(tt.stub).WithExportOpener(exportOpener(s.blobs(), nil))

				src, ref := srv.loadExport(ctx, "ust-kut", v)

				s.wantRefusal(ref, tt.want)
				assert.Equal(s.T(), len(src.placements), 0)
			})
		}
	}
}

func (s *TerritoryExportSuite) TestLoadExportPlainVariantsRefuseAMissingPlainCopy() {
	srv := New(&exportServiceStub{bundle: s.bundle()}).WithExportOpener(exportOpener(s.blobs(), nil))
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	for _, v := range []exportVariant{variantCompatible, variantOBJ} {
		_, ref := srv.loadExport(ctx, "ust-kut", v)

		s.wantRefusal(ref, &exportRefusal{http.StatusConflict, apperr.SlugConflict, v.notReady()})
	}
}

func (s *TerritoryExportSuite) TestLoadExportReturnsTheVisibleSceneAndItsHeads() {
	srv := New(&exportServiceStub{bundle: s.bundle()}).WithExportOpener(exportOpener(s.blobs(), nil))
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	src, ref := srv.loadExport(ctx, "ust-kut", variantCompressed)

	assert.Assert(s.T(), ref == nil)
	assert.Equal(s.T(), len(src.placements), 2)
	assert.Equal(s.T(), src.placements[1].Name, "shown")
	assert.Equal(s.T(), len(src.heads), 2)
	assert.Equal(s.T(), src.bundle.Territory.Slug, "ust-kut")
}

func (s *TerritoryExportSuite) TestLoadExportHeadFailureIsTheGenericRefusal() {
	open := exportOpener(s.blobs(), func(string, int64) error { return errors.New("asset down") })
	srv := New(&exportServiceStub{bundle: s.bundle()}).WithExportOpener(open)
	ctx := authhttp.NewTestContext(s.T().Context(), true, "")

	_, ref := srv.loadExport(ctx, "ust-kut", variantCompressed)

	s.wantRefusal(ref, &exportRefusal{http.StatusInternalServerError, apperr.SlugInternal, apperr.InternalMessage})
}

func (s *TerritoryExportSuite) wantRefusal(got, want *exportRefusal) {
	s.T().Helper()
	assert.Assert(s.T(), got != nil)
	assert.Equal(s.T(), *got, *want)
}

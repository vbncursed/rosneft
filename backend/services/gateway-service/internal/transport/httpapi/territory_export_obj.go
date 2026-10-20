package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/objexport"
)

// ServeTerritoryExportOBJ streams the territory and its visible placed models
// as one ZIP holding a baked OBJ, its MTL and the source textures. It reads the
// plain copies, like export.glb?variant=compatible, and shares that route's
// root-router mount and scope re-check (see ServeTerritoryExport).
//
// The ZIP has no known size up front, so it goes out chunked without a
// Content-Length. Everything that can fail before the first byte does; a
// failure afterwards aborts the connection instead of returning.
func (s *Server) ServeTerritoryExportOBJ(open glbexport.Opener) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		src, ok := s.loadExport(w, r, open, variantCompatible, "OBJ export is not ready yet")
		if !ok {
			return
		}
		slug := chi.URLParam(r, "slug")
		a := src.bundle.Artifact
		ratio, metric := objexport.UnitRatio(
			[3]float64{a.BBoxMin.X, a.BBoxMin.Y, a.BBoxMin.Z},
			[3]float64{a.BBoxMax.X, a.BBoxMax.Y, a.BBoxMax.Z})
		plan, err := objexport.Build(src.placements, src.heads, objexport.Options{
			Stem: slug, Ratio: ratio, Metric: metric, Modified: time.Now(),
		})
		if errors.Is(err, objexport.ErrTooLarge) {
			apperr.Write(w, http.StatusUnprocessableEntity, apperr.SlugUnprocessable, "OBJ export exceeds 20 million vertices or 40 million faces")
			return
		}
		if err != nil {
			exportFailed(w, r, err)
			return
		}

		setDownloadHeaders(w.Header(), "application/zip", slug+"-obj.zip")
		w.WriteHeader(http.StatusOK)
		// Headers out now, before the asset reads: Cloudflare's 100 s timeout counts to them.
		_ = http.NewResponseController(w).Flush()
		if err := objexport.Write(ctx, w, plan, open); err != nil {
			slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
			// Returning would end the chunked body cleanly: a complete-looking, truncated ZIP.
			// Recoverer re-panics ErrAbortHandler and net/http drops the connection without
			// the terminal chunk; slog-chi still logs (its log is deferred).
			panic(http.ErrAbortHandler)
		}
	}
}

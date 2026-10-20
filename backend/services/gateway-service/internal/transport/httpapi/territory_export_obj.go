package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"
)

// ServeTerritoryExportOBJ streams the territory and its visible placed models
// as one ZIP holding a baked OBJ, its MTL and the source textures. It reads the
// plain copies, like export.glb?variant=compatible, and shares that route's
// root-router mount and scope re-check (see ServeTerritoryExport).
//
// The ZIP has no known size up front, so it goes out chunked without a
// Content-Length. Everything that can fail before the first byte does; a
// failure afterwards aborts the connection instead of returning.
func (s *Server) ServeTerritoryExportOBJ() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		p, ref := s.prepareExport(ctx, chi.URLParam(r, "slug"), variantOBJ)
		if ref != nil {
			ref.write(w)
			return
		}
		p.begin(w)
		// Headers out now, before the asset reads: Cloudflare's 100 s timeout counts to them.
		_ = http.NewResponseController(w).Flush()
		if err := p.stream(ctx, w); err != nil {
			slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
			// Returning would end the chunked body cleanly: a complete-looking, truncated ZIP.
			// Recoverer re-panics ErrAbortHandler and net/http drops the connection without
			// the terminal chunk; slog-chi still logs (its log is deferred).
			panic(http.ErrAbortHandler)
		}
	}
}

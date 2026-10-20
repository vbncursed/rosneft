package httpapi

import (
	"log/slog"
	"mime"
	"net/http"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// ServeTerritoryExport streams the territory and its visible placed models as
// one GLB, read through the server's export opener (the asset client in
// production).
//
// It lives on the root router because ETagMiddleware buffers the whole body.
// RequireTerritoryAccess is mounted in front of it by hand and fires because
// the route pattern starts with territoryScopedPrefix; the scope is checked
// again in prepareExport, like GetSceneBundle does, so this handler does not
// depend on the mount.
//
// Everything that can fail is done before the first byte (prepareExport, shared
// with export-check): the plan fixes the exact Content-Length, and a failure
// afterwards is a body shorter than it — the connection is cut, never a
// complete-looking 200.
func (s *Server) ServeTerritoryExport() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		variant, err := parseExportVariant(r.URL.RawQuery)
		if err != nil {
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, err.Error())
			return
		}
		p, ref := s.prepareExport(ctx, chi.URLParam(r, "slug"), variant)
		if ref != nil {
			ref.write(w)
			return
		}
		p.begin(w)
		if err := p.stream(ctx, w); err != nil {
			// The status is out; the short body is the signal, the cause the log line.
			slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
		}
	}
}

// setDownloadHeaders sets the headers every export download carries.
// New slugs are [a-z0-9-], but nothing in the schema enforces it on old rows;
// FormatMediaType quotes or RFC 2231-encodes whatever is there.
func setDownloadHeaders(h http.Header, contentType, filename string) {
	h.Set("Content-Type", contentType)
	h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	h.Set("Cache-Control", "no-store")
}

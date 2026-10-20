package httpapi

import (
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"slices"
	"strconv"

	"github.com/go-chi/chi/v5"
	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ServeTerritoryExport streams the territory and its visible placed models as
// one GLB, read through open (the asset client in production).
//
// It lives on the root router because ETagMiddleware buffers the whole body.
// RequireTerritoryAccess is mounted in front of it by hand and fires because
// the route pattern starts with territoryScopedPrefix; the scope is checked
// again here, like GetSceneBundle does, so this handler does not depend on the
// mount.
//
// Everything that can fail is done before the first byte: the plan fixes the
// exact Content-Length, and a failure afterwards is a body shorter than it —
// the connection is cut, never a complete-looking 200.
func (s *Server) ServeTerritoryExport(open glbexport.Opener) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		variant, err := parseExportVariant(r.URL.RawQuery)
		if err != nil {
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, err.Error())
			return
		}
		src, ok := s.loadExport(w, r, open, variant, "compatible copy is not ready yet")
		if !ok {
			return
		}
		plan, err := glbexport.Build(src.placements, src.heads)
		if errors.Is(err, glbexport.ErrTooLarge) {
			apperr.Write(w, http.StatusUnprocessableEntity, apperr.SlugUnprocessable, "export exceeds the 4 GiB GLB limit")
			return
		}
		if err != nil {
			exportFailed(w, r, err)
			return
		}
		if variant == variantCompatible && len(plan.Required) > 0 {
			exportFailed(w, r, fmt.Errorf("compatible export requires %v", plan.Required))
			return
		}

		h := w.Header()
		setDownloadHeaders(h, "model/gltf-binary", variant.filename(chi.URLParam(r, "slug")))
		h.Set("Content-Length", strconv.FormatInt(plan.Size, 10))
		w.WriteHeader(http.StatusOK)
		if err := glbexport.Write(ctx, w, plan, open); err != nil {
			// The status is out; the short body is the signal, the cause the log line.
			slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
		}
	}
}

// exportSource is what both export handlers read before the first byte.
type exportSource struct {
	bundle     domain.SceneBundle // Artifact non-nil
	placements []glbexport.Placement
	heads      map[string]glbexport.Head
}

// loadExport runs what the two export routes share: the scope re-check, the
// bundle read, the 409 for a territory without LOD0, the 409 notReady when the
// compatible variant lacks a plain copy for something it draws, and the head
// reads. ok == false means the response is already written.
func (s *Server) loadExport(w http.ResponseWriter, r *http.Request, open glbexport.Opener, v exportVariant, notReady string) (src exportSource, ok bool) {
	ctx := r.Context()
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if !allAccess && scopeAdminID == "" {
		writeTerritoryMissing(w)
		return src, false
	}
	bundle, err := s.svc.GetSceneBundle(ctx, chi.URLParam(r, "slug"), scopeAdminID)
	switch {
	case isNotFound(err):
		writeTerritoryMissing(w)
		return src, false
	case err != nil:
		exportFailed(w, r, err)
		return src, false
	}
	if bundle.Artifact == nil {
		apperr.Write(w, http.StatusConflict, apperr.SlugConflict, "territory is not converted yet")
		return src, false
	}

	placements, skipped := exportPlacements(bundle, v)
	if v == variantCompatible && slices.ContainsFunc(placements, func(p glbexport.Placement) bool { return p.Hash == "" }) {
		apperr.Write(w, http.StatusConflict, apperr.SlugConflict, notReady)
		return src, false
	}
	if skipped > 0 {
		slogchi.AddContextAttributes(ctx, slog.Int("export_skipped", skipped))
	}
	hashes := make([]string, len(placements))
	for i, p := range placements {
		hashes[i] = p.Hash
	}
	heads, err := glbexport.ReadHeads(ctx, open, hashes)
	if err != nil {
		exportFailed(w, r, err)
		return src, false
	}
	return exportSource{bundle: bundle, placements: placements, heads: heads}, true
}

// setDownloadHeaders sets the headers every export download carries.
// New slugs are [a-z0-9-], but nothing in the schema enforces it on old rows;
// FormatMediaType quotes or RFC 2231-encodes whatever is there.
func setDownloadHeaders(h http.Header, contentType, filename string) {
	h.Set("Content-Type", contentType)
	h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	h.Set("Cache-Control", "no-store")
}

// exportFailed answers 500 with the generic body; the cause goes on the
// request's log line.
func exportFailed(w http.ResponseWriter, r *http.Request, err error) {
	slogchi.AddContextAttributes(r.Context(), slog.String("error", errMsg(err)))
	apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, apperr.InternalMessage)
}
